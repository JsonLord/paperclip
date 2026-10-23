#!/usr/bin/env python3
import copy
import unittest
from agency_supervisor.history import archived_admission_denial
from agency_supervisor.controller import SafetyError


class ArchiveRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.activation = {
            "id": "activation",
            "companyId": "company",
            "issueId": "issue",
            "runId": "run",
            "status": "FAIL",
            "nativeRunStatus": "failed",
            "validation": {"verdict": "FAIL", "findings": ["jules_auth_required"]},
        }
        self.runs = [
            {
                "id": "run",
                "status": "failed",
                "error_code": "jules_auth_required",
                "context_snapshot": {
                    "issueId": "issue",
                    "wakeReason": "agency_supervisor:activation",
                },
            }
        ]
        self.sessions = []
        self.capacity = [{"event_type": "profile_degraded", "session_id": None}]
        self.sha = "a" * 40
        self.company = "company"

    def check(self):
        return archived_admission_denial(
            self.activation,
            self.runs,
            self.sessions,
            self.capacity,
            self.sha,
            self.company,
        )

    def test_receipt_preserves_failure_without_authorizing_dispatch(self):
        before = copy.deepcopy(self.activation)
        receipt = self.check()
        self.assertFalse(receipt["redispatchAuthorized"])
        self.assertEqual(receipt["historicalVerdict"], "FAIL")
        self.assertEqual(self.activation, before)

    def test_nonterminal_or_allocated_activation_is_rejected(self):
        for key, value in [
            ("status", "AMBIGUOUS"),
            ("status", "REMOTE_ACTIVE"),
            ("remoteSessionId", "remote"),
            ("nativeRunStatus", "succeeded"),
        ]:
            with self.subTest(key=key, value=value):
                saved = copy.deepcopy(self.activation)
                self.activation[key] = value
                with self.assertRaises(SafetyError):
                    self.check()
                self.activation = saved

    def test_wrong_missing_or_duplicate_run_is_rejected(self):
        for runs in [[], self.runs * 2, [{**self.runs[0], "id": "other"}]]:
            with self.subTest(runs=runs):
                original = self.runs
                self.runs = runs
                with self.assertRaises(SafetyError):
                    self.check()
                self.runs = original

    def test_foreign_issue_activation_or_failure_is_rejected(self):
        for patch in [
            {"issueId": "foreign"},
            {"wakeReason": "agency_supervisor:foreign"},
        ]:
            with self.subTest(patch=patch):
                saved = copy.deepcopy(self.runs)
                self.runs[0]["context_snapshot"].update(patch)
                with self.assertRaises(SafetyError):
                    self.check()
                self.runs = saved
        self.runs[0]["error_code"] = "jules_failed"
        with self.assertRaises(SafetyError):
            self.check()

    def test_remote_session_or_capacity_is_rejected(self):
        self.sessions = [{"issue_id": "issue"}]
        with self.assertRaises(SafetyError):
            self.check()
        self.sessions = []
        self.capacity.append({"session_id": "remote"})
        with self.assertRaises(SafetyError):
            self.check()

    def test_foreign_archive_company_is_rejected(self):
        self.company = "foreign"
        with self.assertRaises(SafetyError):
            self.check()

    def test_mutable_reference_is_rejected(self):
        self.sha = "main"
        with self.assertRaises(SafetyError):
            self.check()


if __name__ == "__main__":
    unittest.main()
