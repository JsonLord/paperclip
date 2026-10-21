#!/usr/bin/env python3
"""One-time Agency materialization through native HTTPS APIs; never deploys.

Credentials are read from PAPERCLIP_ADMIN_EMAIL / PAPERCLIP_ADMIN_PASSWORD.
Cookies stay in memory. Mutation requests are never automatically retried.
"""
import argparse
from collections import Counter
import difflib
import fcntl
import http.cookiejar
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

SOURCE_SHA = 'cf909b0b5435a229ac7c7fd7b6abcfa97fd06d09'
SOURCE_PATCH = '0697069221de9830e40d0a80f84fa8189daf9128'
DIVISIONS = {'decision', 'discovery', 'distribution', 'evaluation', 'experimentation',
             'hypothesis', 'intelligence', 'production', 'proposition'}
REUSE = {'evidence': 'evidence-auditor', 'market': 'market-intelligence-analyst',
         'customer': 'customer-investigator', 'experiment': 'experiment-designer',
         'sales': 'lead-researcher', 'product': 'prototype-director',
         'business': 'venture-judge', 'content': 'copy-producer'}
BASELINE = {'founder-manager': 'Founder Manager', 'evidence': 'Evidence Steward',
            'market': 'Market Analyst', 'customer': 'Customer Researcher',
            'experiment': 'Growth Experimenter', 'sales': 'Commercial Lead',
            'product': 'Product Lead', 'engineering': 'Product Engineer',
            'finance': 'Finance Lead', 'business': 'Business Case Architect',
            'content': 'Content & GTM Lead'}
ENVELOPE = '''
Execution envelope:
- Paperclip is the organization/control plane. Work only the assigned Paperclip outcome.
- Never invent market/customer evidence. Label synthetic qualification artifacts explicitly.
- External writes/actions require approval; an explicit issue may authorize a bounded repository artifact/PR.
- Do not merge your own PR. Do not expose secrets.
- Reuse the current Jules session when Paperclip resumes it.
- Report blockers instead of bypassing them.
- A completed Jules session is a completion candidate, not acceptance.
- Metadata reads/writes describe the persona's contracts, not live Nodepad authorization.
Assignment title: {{context.assignment.title}}
Assignment description: {{context.assignment.description}}
Priority: {{context.assignment.priority}}
Goal: {{context.assignment.goal}}
Issue: {{context.issueId}}
Goal ID: {{context.goalId}}
Run: {{runId}}
Agent: {{agentId}}
Company: {{companyId}}
'''


class Stop(RuntimeError):
    pass


def require(value, message):
    if not value:
        raise Stop(message)


def stable(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'))


def redact(value):
    if isinstance(value, dict):
        return {k: ('[REDACTED]' if re.search(r'password|token|api.?key|authorization|cookie|secretvalue', k, re.I)
                    else redact(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    return value


def save(path, value):
    path = Path(path)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(redact(value), indent=2) + '\n')
    os.chmod(tmp, 0o600)
    tmp.replace(path)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise Stop('Unexpected redirect refused')


class Api:
    def __init__(self, base):
        url = urllib.parse.urlsplit(base)
        require(url.scheme == 'https' and url.hostname and not url.username and not url.password
                and url.path in ('', '/') and not url.query and not url.fragment, 'HTTPS origin required')
        self.base = base.rstrip('/')
        self.client = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()), NoRedirect())
        email, password = os.getenv('PAPERCLIP_ADMIN_EMAIL'), os.getenv('PAPERCLIP_ADMIN_PASSWORD')
        require(email and password, 'Set native admin email/password securely in environment settings')
        self.request('POST', '/api/auth/sign-in/email', {'email': email, 'password': password})
        session = self.request('GET', '/api/auth/get-session')
        require(session and session.get('user') and session.get('session'), 'Native login failed')

    def request(self, method, path, body=None):
        require(path.startswith('/api/') and not path.startswith('//'), 'Native API path required')
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={'Origin': self.base, 'Accept': 'application/json',
                                              'Content-Type': 'application/json'})
        try:
            with self.client.open(req, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            raise Stop(f'{method} {path}: HTTP {exc.code}; not retried') from None
        except (OSError, ValueError):
            raise Stop(f'{method} {path}: response uncertain; not retried') from None


def load_catalog(repo, sha):
    require(sha == SOURCE_SHA, 'Authoritative Agency SHA required')
    def blob(path):
        require(not path.startswith('/') and '..' not in Path(path).parts, 'Invalid catalog path')
        try:
            return subprocess.check_output(['git', '-C', str(repo), 'show', f'{sha}:{path}'],
                                           stderr=subprocess.DEVNULL).decode()
        except (subprocess.CalledProcessError, UnicodeError):
            raise Stop('Pinned Agency blob unavailable') from None
    catalog = json.loads(blob('catalog/agents.json'))
    require(isinstance(catalog, list) and len(catalog) == 45, 'Expected 45 canonical agents')
    require(len({a['id'] for a in catalog}) == 45, 'Duplicate canonical identity')
    require(Counter(a['division'] for a in catalog) == Counter({d: 5 for d in DIVISIONS}),
            'Expected nine divisions with five agents each')
    require(set(REUSE.values()) <= {a['id'] for a in catalog}, 'Reuse identities absent from catalog')
    for definition in catalog:
        require(definition['source'].startswith('agents/') and definition['source'].endswith('.md'),
                'Invalid persona source')
        definition['_persona'] = blob(definition['source'])
        require(definition['_persona'].strip(), 'Empty persona')
    return catalog


def template_id(agent):
    return str((agent.get('metadata') or {}).get('founderosTemplateId', '')).split(',')[0]


def agency_metadata(definition):
    return {'agencyId': definition['id'], 'agencyDivision': definition['division'],
            'agencySourceCommit': SOURCE_SHA, 'agencySourcePath': definition['source'],
            'agencySkills': definition.get('skills', []), 'agencyReads': definition.get('reads', []),
            'agencyWrites': definition.get('writes', []), 'agencyApproval': definition.get('approval', {}),
            'agencyBias': definition.get('bias', []), 'agencyPreferredRuntime': definition.get('runtime', {})}


def capabilities(agent, definition):
    current = [x.strip() for x in (agent.get('capabilities') or '').split(',') if x.strip()]
    return ', '.join(dict.fromkeys(current + definition.get('capabilities', [])))


def prompt(definition):
    fields = {k: definition.get(k, []) for k in
              ['division', 'description', 'bias', 'skills', 'reads', 'writes', 'approval', 'capabilities']}
    return ('Canonical Agency persona at ' + SOURCE_SHA + '\n' + definition['_persona']
            + '\nCanonical catalog contract:\n' + json.dumps(fields, indent=2) + '\n' + ENVELOPE)


def normalize(name):
    return re.sub(r'[^a-z0-9]', '', name.lower())


def plan(catalog, agents, journal):
    require(len({a['id'] for a in agents}) == len(agents), 'Duplicate native IDs')
    original = [a for a in agents if template_id(a) in BASELINE]
    require(len(original) == 11 and Counter(template_id(a) for a in original)
            == Counter(BASELINE.keys()), 'Unexpected FounderOS baseline identities')
    for agent in original:
        require(agent['name'] == BASELINE[template_id(agent)], 'Unexpected FounderOS baseline names')
    baseline_ids = {a['id'] for a in original}
    by_id = {}; missing = []; reused = []
    for definition in catalog:
        canonical = definition['id']
        matches = [a for a in agents if (a.get('metadata') or {}).get('agencyId') == canonical]
        mapped = [a for a in original if REUSE.get(template_id(a)) == canonical]
        require(len(matches) <= 1, 'Duplicate agencyId: ' + canonical)
        require(not matches or not mapped or matches[0]['id'] == mapped[0]['id'],
                'Canonical identity duplicates FounderOS reuse: ' + canonical)
        match = matches[0] if matches else mapped[0] if mapped else None
        if match:
            require(not (match.get('metadata') or {}).get('agencyId') or
                    match['metadata']['agencyId'] == canonical, 'Conflicting Agency identity')
            by_id[canonical] = match
            if match['id'] in baseline_ids:
                reused.append(match)
        else:
            missing.append(definition)
    require(len(reused) == 8, 'Expected exactly eight reused FounderOS records')
    unknown = [a for a in agents if a['id'] not in baseline_ids and
               a['id'] not in {v['id'] for v in by_id.values()}]
    for agent in unknown:
        names = [d['name'] for d in catalog] + [alias for d in catalog for alias in d.get('aliases', [])]
        if any(difflib.SequenceMatcher(None, normalize(agent['name']), normalize(n)).ratio() >= .85
               for n in names):
            raise Stop('AMBIGUOUS_AGENT_MATCH: ' + agent['id'])
    require(not unknown, 'Unexpected additional native agents')
    if not journal:
        require(len(agents) in (11, 48), 'Partial roster requires its original journal')
        require(len(missing) in (37, 0), 'Expected 37 missing or a complete roster')
    else:
        require(journal['agencySourceSha'] == SOURCE_SHA, 'Journal source mismatch')
        require(set(journal['baselineIds']) == baseline_ids, 'Journal baseline mismatch')
        pending = journal.get('pendingCreate')
        require(not pending or pending in by_id,
                'Uncertain create is not visible; investigate before any retry')
    return by_id, missing, original


def make_agent(definition, manager_id, binding):
    return {'name': definition['name'], 'role': 'general', 'title': 'Agency / ' + definition['division'],
            'reportsTo': manager_id, 'capabilities': ', '.join(definition.get('capabilities', [])),
            'adapterType': 'jules', 'adapterConfig': {**binding, 'promptTemplate': prompt(definition)},
            'runtimeConfig': {'heartbeat': {'enabled': False, 'wakeOnDemand': True}},
            'budgetMonthlyCents': 0, 'permissions': {'canCreateAgents': False},
            'metadata': agency_metadata(definition)}


def reconcile(api, catalog, cid, directory, mode):
    directory = Path(directory); directory.mkdir(parents=True, exist_ok=True)
    journal_path = directory / 'journal.json'
    journal = json.loads(journal_path.read_text()) if journal_path.exists() else None
    require(not journal or journal['companyId'] == cid, 'Journal company mismatch')
    path = f'/api/companies/{cid}/agents'
    agents = api.request('GET', path)
    by_id, missing, original = plan(catalog, agents, journal)
    summary = {'companyId': cid, 'agencySourceSha': SOURCE_SHA, 'nativeCount': len(agents),
               'created': 0, 'reused': len(by_id), 'missing': len(missing), 'duplicate': 0}
    if mode == 'dry-run':
        save(directory / 'dry-run.json', summary)
        return summary
    if mode == 'verify':
        require(not missing and len(agents) == 48, 'Incomplete roster')
        for definition in catalog:
            agent = by_id[definition['id']]
            require(all((agent.get('metadata') or {}).get(k) == v for k, v in
                        agency_metadata(definition).items()), 'Canonical metadata drift: ' + definition['id'])
            require(set(definition.get('capabilities', [])) <=
                    {v.strip() for v in (agent.get('capabilities') or '').split(',')}, 'Capability drift')
            if agent not in original:
                expected = make_agent(definition, next(a['id'] for a in original
                                       if template_id(a) == 'founder-manager'), {})
                require(agent['status'] == 'paused', 'New specialist is not paused')
                require(agent['adapterType'] == 'jules' and agent['reportsTo'] == expected['reportsTo'],
                        'New specialist runtime/manager drift')
                require(agent.get('runtimeConfig', {}).get('heartbeat', {}).get('enabled') is False
                        and agent['runtimeConfig']['heartbeat'].get('wakeOnDemand') is True,
                        'New specialist heartbeat drift')
                require(agent.get('adapterConfig', {}).get('promptTemplate') == prompt(definition)
                        and not agent['adapterConfig'].get('outcomeTemplate'), 'Persona prompt drift')
                require(agent.get('permissions', {}).get('canCreateAgents') is False, 'Permissions drift')
        if journal:
            for old in journal['baseline']:
                current = next(a for a in agents if a['id'] == old['id'])
                for key in ['name', 'status', 'adapterType', 'adapterConfig', 'runtimeConfig', 'reportsTo']:
                    require(redact(current.get(key)) == old.get(key), 'Baseline changed: ' + old['id'] + '/' + key)
                require(all(current.get('metadata', {}).get(k) == v for k, v in old.get('metadata', {}).items()),
                        'FounderOS metadata was replaced')
                old_caps = {x.strip() for x in (old.get('capabilities') or '').split(',') if x.strip()}
                current_caps = {x.strip() for x in (current.get('capabilities') or '').split(',') if x.strip()}
                require(old_caps <= current_caps, 'FounderOS capability declarations narrowed')
                if template_id(old) not in REUSE:
                    require(current.get('metadata') == old.get('metadata') and
                            current.get('capabilities') == old.get('capabilities'), 'Retained specialist changed')
        save(directory / 'verify.json', summary)
        return summary
    if not journal:
        require(len(agents) in (11, 48), 'Unexpected native count')
        journal = {'companyId': cid, 'agencySourceSha': SOURCE_SHA,
                   'baselineIds': [a['id'] for a in original], 'baseline': original,
                   'createdIds': [], 'pendingCreate': None}
        for section in ['agents', 'org', 'goals', 'projects', 'issues']:
            save(directory / ('baseline-' + section + '.json'),
                 agents if section == 'agents' else api.request('GET', f'/api/companies/{cid}/{section}'))
        save(journal_path, journal)
    # Recover only a visible canonical create. A missing response never causes blind recreation.
    pending = journal.get('pendingCreate')
    if pending:
        agent = by_id[pending]
        require(agent['id'] not in journal['baselineIds'], 'Pending create points at baseline')
        require(api.request('POST', f"/api/agents/{agent['id']}/pause", {})['status'] == 'paused',
                'Pause failed; STOP import')
        if agent['id'] not in journal['createdIds']:
            journal['createdIds'].append(agent['id'])
        journal['pendingCreate'] = None; save(journal_path, journal)
    for definition in catalog:
        agent = by_id.get(definition['id'])
        if not agent or template_id(agent) not in REUSE:
            continue
        patch = {'metadata': {**(agent.get('metadata') or {}), **agency_metadata(definition)},
                 'capabilities': capabilities(agent, definition)}
        if any(agent.get(k) != v for k, v in patch.items()):
            updated = api.request('PATCH', f"/api/agents/{agent['id']}", patch)
            require(all(updated.get(k) == v for k, v in patch.items()), 'Metadata patch not confirmed')
    manager = next(a for a in original if template_id(a) == 'founder-manager')
    healthy = next((a for a in original if a['adapterType'] == 'jules' and a['status'] == 'idle'
                    and a.get('adapterConfig', {}).get('repository') and a['adapterConfig'].get('source')), None)
    require(healthy or not missing, 'No structurally healthy existing Jules binding')
    binding = {k: healthy['adapterConfig'][k] for k in ['repository', 'source', 'startingBranch', 'autoApprovePlan']
               if healthy and k in healthy['adapterConfig']}
    for definition in missing:
        # Recheck before each non-idempotent create. Concurrent imports are unsupported.
        current, _, _ = plan(catalog, api.request('GET', path), journal)
        require(definition['id'] not in current, 'Concurrent roster mutation; STOP')
        journal['pendingCreate'] = definition['id']; save(journal_path, journal)
        agent = api.request('POST', path, make_agent(definition, manager['id'], binding))
        # Pause first even if subsequent response verification detects a discrepancy.
        require(agent.get('id') and agent.get('companyId') == cid, 'Create response uncertain; inspect roster')
        paused = api.request('POST', f"/api/agents/{agent['id']}/pause", {})
        require(paused.get('status') == 'paused' and paused.get('id') == agent['id'], 'Pause failed; STOP import')
        require(agent.get('metadata', {}).get('agencyId') == definition['id'], 'Created identity mismatch')
        journal['createdIds'].append(agent['id']); journal['pendingCreate'] = None
        save(journal_path, journal)
        summary['created'] += 1
        print(json.dumps({'createdAndPaused': definition['id'], 'nativeId': agent['id']}), flush=True)
    save(directory / 'apply.json', summary)
    return summary


def main():
    p = argparse.ArgumentParser(description=__doc__)
    modes = p.add_mutually_exclusive_group(required=True)
    for mode in ['dry-run', 'apply', 'verify']:
        modes.add_argument('--' + mode, dest='mode', action='store_const', const=mode)
    p.add_argument('--base-url', default=os.getenv('PAPERCLIP_BASE_URL', 'https://leon4gr45-paperclip-founder.hf.space'))
    p.add_argument('--company', default='AUX', help='Native UUID, unique issue prefix, or exact company name')
    p.add_argument('--agency-repo', required=True, type=Path)
    p.add_argument('--source-sha', default=SOURCE_SHA)
    p.add_argument('--audit-dir', required=True, type=Path)
    args = p.parse_args()
    args.audit_dir.mkdir(parents=True, exist_ok=True)
    with (args.audit_dir / '.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        catalog = load_catalog(args.agency_repo, args.source_sha)
        api = Api(args.base_url)
        companies = api.request('GET', '/api/companies')
        matches = [c for c in companies if c.get('status') != 'archived' and
                   args.company.casefold() in {str(c.get(k, '')).casefold() for k in ['id', 'issuePrefix', 'name']}]
        require(len(matches) == 1, 'Company selector must identify one active company')
        print(json.dumps(reconcile(api, catalog, matches[0]['id'], args.audit_dir, args.mode), indent=2))


if __name__ == '__main__':
    try:
        main()
    except (Stop, BlockingIOError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
