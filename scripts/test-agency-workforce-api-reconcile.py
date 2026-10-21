#!/usr/bin/env python3
"""Offline safety tests; no credentials, provider calls, or live mutations."""
import copy
import contextlib
import io
import importlib.util
import tempfile
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('reconciler', Path(__file__).with_name('agency-workforce-api-reconcile.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def fixture():
    ids = list(m.REUSE.values()) + ['problem-explorer'] + [f'fixture-{n}' for n in range(36)]
    catalog = [{'id': x, 'name': x.replace('-', ' ').title(), 'division': sorted(m.DIVISIONS)[i // 5],
                'source': f'agents/test/{x}.md', 'skills': ['inspect'], 'reads': ['fixture'],
                'writes': ['research_gap'], 'capabilities': ['research.web'], 'approval': {'external_write': 'required'},
                'bias': ['disconfirmation'], 'runtime': {'primary': 'github-actions'},
                '_persona': 'Canonical fixture persona'} for i, x in enumerate(ids)]
    agents = [{'id': key, 'companyId': 'aux', 'name': name,
               'metadata': {'founderosTemplateId': key + ',' + key, 'preserve': 'yes'},
               'status': 'idle', 'adapterType': 'hermes_local' if key == 'founder-manager' else 'jules',
               'adapterConfig': {'repository': 'owner/repo', 'source': 'sources/owner/repo',
                                 'startingBranch': 'main', 'outcomeTemplate': 'bootstrap',
                                 'apiKey': 'NEVER-COPY-THIS'},
               'runtimeConfig': {}, 'reportsTo': None, 'capabilities': 'existing'}
              for key, name in m.BASELINE.items()]
    return catalog, agents


class FakeApi:
    def __init__(self, agents):
        self.agents = copy.deepcopy(agents)
        self.calls = []
        self.fail_pause = False
        self.uncertain_create = False
    def request(self, method, path, body=None):
        self.calls.append((method, path))
        if method == 'GET':
            return copy.deepcopy(self.agents) if path.endswith('/agents') else []
        if method == 'PATCH':
            a = next(a for a in self.agents if a['id'] == path.split('/')[-1])
            a.update(copy.deepcopy(body)); return copy.deepcopy(a)
        if path.endswith('/pause'):
            if self.fail_pause:
                raise m.Stop('pause failed')
            a = next(a for a in self.agents if a['id'] == path.split('/')[-2])
            a['status'] = 'paused'; return copy.deepcopy(a)
        a = {**copy.deepcopy(body), 'id': f'new-{len(self.agents)}', 'companyId': 'aux', 'status': 'idle'}
        self.agents.append(a)
        if self.uncertain_create:
            raise m.Stop('uncertain response')
        return copy.deepcopy(a)


class Safety(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.catalog, agents = fixture(); self.api = FakeApi(agents)
    def run_mode(self, mode):
        with contextlib.redirect_stdout(io.StringIO()):
            return m.reconcile(self.api, self.catalog, 'aux', self.temp.name, mode)
    def test_dry_run_has_no_mutations(self):
        result = self.run_mode('dry-run')
        self.assertEqual((result['reused'], result['missing']), (8, 37))
        self.assertTrue(all(c[0] == 'GET' for c in self.api.calls))
    def test_apply_order_preservation_and_second_apply(self):
        result = self.run_mode('apply')
        self.assertEqual(result['created'], 37)
        mutations = [c for c in self.api.calls if c[0] != 'GET']
        for i, call in enumerate(mutations):
            if call == ('POST', '/api/companies/aux/agents'):
                self.assertTrue(mutations[i + 1][1].endswith('/pause'))
        self.assertEqual(self.run_mode('verify')['nativeCount'], 48)
        before = len(self.api.calls)
        again = self.run_mode('apply')
        self.assertEqual((again['created'], again['reused'], again['duplicate']), (0, 45, 0))
        self.assertTrue(all(c[0] == 'GET' for c in self.api.calls[before:]))
        for agent in self.api.agents[11:]:
            self.assertNotIn('apiKey', agent['adapterConfig'])
            self.assertNotIn('outcomeTemplate', agent['adapterConfig'])
            self.assertIn('{{context.assignment.title}}', agent['adapterConfig']['promptTemplate'])
    def test_pause_failure_stops_before_next_create(self):
        self.api.fail_pause = True
        with self.assertRaises(m.Stop): self.run_mode('apply')
        self.assertEqual(len(self.api.agents), 12)
        self.assertEqual(sum(c == ('POST', '/api/companies/aux/agents') for c in self.api.calls), 1)
    def test_uncertain_create_recovers_visible_identity_without_duplicate(self):
        self.api.uncertain_create = True
        with self.assertRaises(m.Stop): self.run_mode('apply')
        self.api.uncertain_create = False
        self.run_mode('apply')
        self.assertEqual(len(self.api.agents), 48)
        self.assertEqual(self.run_mode('verify')['nativeCount'], 48)
    def test_uncertain_create_not_visible_refuses_retry(self):
        self.api.uncertain_create = True
        with self.assertRaises(m.Stop): self.run_mode('apply')
        self.api.agents.pop(); self.api.uncertain_create = False
        count = len(self.api.calls)
        with self.assertRaisesRegex(m.Stop, 'Uncertain create'): self.run_mode('apply')
        self.assertTrue(all(c[0] == 'GET' for c in self.api.calls[count:]))
    def test_name_only_match_is_ambiguous(self):
        self.api.agents.append({'id': 'unknown', 'name': self.catalog[-1]['name'], 'metadata': {}})
        with self.assertRaisesRegex(m.Stop, 'AMBIGUOUS_AGENT_MATCH'): self.run_mode('dry-run')
    def test_duplicate_canonical_identity_stops(self):
        agent = copy.deepcopy(self.api.agents[1]); agent['metadata']['agencyId'] = self.catalog[0]['id']
        self.api.agents[1] = agent
        duplicate = copy.deepcopy(agent); duplicate['id'] = 'duplicate'; duplicate['metadata'].pop('founderosTemplateId'); self.api.agents.append(duplicate)
        with self.assertRaisesRegex(m.Stop, 'Duplicate agencyId'): self.run_mode('apply')
    def test_unexpected_baseline_stops_before_any_write(self):
        self.api.agents[1]['metadata'] = {}
        with self.assertRaisesRegex(m.Stop, 'baseline'): self.run_mode('apply')
        self.assertTrue(all(c[0] == 'GET' for c in self.api.calls))
    def test_verify_detects_persona_and_status_drift(self):
        self.run_mode('apply')
        self.api.agents[-1]['adapterConfig']['promptTemplate'] = 'Generic task'
        with self.assertRaisesRegex(m.Stop, 'Persona prompt drift'): self.run_mode('verify')
    def test_journal_never_persists_raw_credential(self):
        self.run_mode('apply')
        self.assertNotIn('NEVER-COPY-THIS', (Path(self.temp.name) / 'journal.json').read_text())
        self.assertIn('[REDACTED]', (Path(self.temp.name) / 'journal.json').read_text())
    def test_legacy_specialists_and_reused_runtime_remain_unchanged(self):
        before = copy.deepcopy(self.api.agents)
        self.run_mode('apply')
        for old in before:
            current = next(a for a in self.api.agents if a['id'] == old['id'])
            for key in ['id', 'name', 'status', 'adapterConfig', 'runtimeConfig']:
                self.assertEqual(current[key], old[key])
            self.assertEqual(current['metadata']['preserve'], 'yes')
        for key in ['engineering', 'finance', 'founder-manager']:
            self.assertEqual(next(a for a in self.api.agents if a['id'] == key),
                             next(a for a in before if a['id'] == key))
    def test_capability_narrowing_is_detected(self):
        self.run_mode('apply')
        self.api.agents[1]['capabilities'] = 'research.web'
        with self.assertRaisesRegex(m.Stop, 'narrowed'): self.run_mode('verify')
    def test_wrong_source_rejected_before_git_or_api(self):
        with self.assertRaisesRegex(m.Stop, 'Authoritative'): m.load_catalog('/missing', 'main')


if __name__ == '__main__':
    unittest.main()
