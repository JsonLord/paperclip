"""Read real PR metadata and immutable Git objects. Never execute repository code."""

import hashlib, json, pathlib, re, subprocess, urllib.request, urllib.error
from .controller import require


def read_product(activation, cache):
    task = activation["task"]
    repo = task["repository"]
    url = activation.get("pullRequestUrl") or ""
    match = re.fullmatch(
        r"https://github\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)/pull/([1-9][0-9]*)/?",
        url,
    )
    require(match and match[1].lower() == repo.lower(), "PR_REPOSITORY_MISMATCH")
    cache = pathlib.Path(cache)
    cache.mkdir(parents=True, exist_ok=True)
    checkout = cache / hashlib.sha256(repo.encode()).hexdigest()[:20]

    def git(*args):
        return subprocess.check_output(
            ["git", "-C", str(checkout), *args], stderr=subprocess.DEVNULL, timeout=60
        ).decode()

    if not checkout.exists():
        subprocess.run(
            [
                "git",
                "clone",
                "--quiet",
                "--bare",
                "--single-branch",
                "--branch",
                task["branch"],
                "https://github.com/" + repo + ".git",
                str(checkout),
            ],
            check=True,
            timeout=90,
        )
    git(
        "fetch",
        "--quiet",
        "origin",
        f"refs/pull/{match[2]}/head:refs/qualification/pr-{match[2]}",
        f'+refs/heads/{task["branch"]}:refs/qualification/base',
    )
    head = git("rev-parse", f"refs/qualification/pr-{match[2]}").strip()
    base = git("merge-base", "refs/qualification/base", head).strip()
    paths = git("diff", "--name-only", base, head).splitlines()
    bodies = {}
    secret_or_binary = False
    for path in paths:
        if path.startswith("/") or ".." in path.split("/"):
            continue
        mode = git("ls-tree", head, "--", path).split(" ", 1)[0]
        if mode != "100644":
            secret_or_binary = True
            continue
        size = int(git("cat-file", "-s", head + ":" + path).strip())
        if size > 200000:
            secret_or_binary = True
            continue
        try:
            bodies[path] = git("show", head + ":" + path)
        except UnicodeError:
            secret_or_binary = True
    branch = None
    metadata_verified = False
    try:
        request = urllib.request.Request(
            f"https://api.github.com/repos/{repo}/pulls/{match[2]}",
            headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": "Paperclip-Agency-Supervisor",
            },
        )
        with urllib.request.urlopen(request, timeout=25) as response:
            metadata = json.load(response)
        require(
            metadata["head"]["sha"] == head
            and metadata["base"]["repo"]["full_name"].lower() == repo.lower(),
            "PR head/repository changed during validation",
        )
        branch = metadata["base"]["ref"]
        metadata_verified = True
    except (urllib.error.URLError, TimeoutError):
        pass
    return {
        "companyId": activation["companyId"],
        "issueId": activation["issueId"],
        "agentId": activation["agentId"],
        "runId": activation["runId"],
        "remoteSessionId": activation["remoteSessionId"],
        "repository": repo,
        "branch": branch,
        "pullRequestUrl": url,
        "headSha": head,
        "baseSha": base,
        "paths": paths,
        "bodies": bodies,
        "prMetadataVerified": metadata_verified,
        "binaryOrSymlink": secret_or_binary,
        "qualityGates": {},
    }
