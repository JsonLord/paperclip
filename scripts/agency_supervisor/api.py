"""Native board API client using an explicit independent admin Bearer token."""

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from .controller import SafetyError, require


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise SafetyError("Unexpected redirect refused")


class AdminTokenApi:
    def __init__(self, base):
        url = urllib.parse.urlsplit(base)
        require(
            url.scheme == "https"
            and url.hostname
            and not url.username
            and not url.password
            and url.path in ("", "/")
            and not url.query
            and not url.fragment,
            "HTTPS origin required",
        )
        self.base = base.rstrip("/")
        self.token = os.getenv("PAPERCLIP_ADMIN_API_TOKEN")
        require(
            self.token, "Set PAPERCLIP_ADMIN_API_TOKEN securely; no password fallback"
        )
        # No cookie processor, login, Origin header, signing-secret use or redirect.
        self.client = urllib.request.build_opener(NoRedirect())
        session = self.request("GET", "/api/auth/get-session")
        require(
            session
            and session.get("user")
            and ":admin_token:" in str((session.get("session") or {}).get("id", "")),
            "Native admin-token identity required",
        )

    def request(self, method, path, body=None):
        require(
            path.startswith("/api/") and "#" not in path, "Native API path required"
        )
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(
            self.base + path,
            data=data,
            method=method,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": "Bearer " + self.token,
            },
        )
        try:
            with self.client.open(request, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            raise SafetyError(
                f"{method} {path}: HTTP {exc.code}; not retried"
            ) from None
        except (OSError, ValueError):
            raise SafetyError(
                f"{method} {path}: response uncertain; not retried"
            ) from None
