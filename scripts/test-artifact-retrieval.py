"""GATE05-R WP8: authenticated provider-artifact retrieval + provenance separation.

Provider/GitHub responses are represented by fixtures (no live calls); genuine live
retrieval is exercised only during an authorized live qualification.
"""
import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from agency_supervisor.controller import ArtifactUnavailable, SafetyError
from agency_supervisor.artifacts import read_product
from agency_supervisor.validation import validate, classify_provenance

ACT = {"companyId": "c", "issueId": "i", "agentId": "a", "runId": "r",
       "remoteSessionId": "s", "repository": "owner/repo", "branch": "main",
       "pullRequestUrl": "https://github.com/owner/repo/pull/7", "task": {}}


def product(**over):
    p = {"companyId": "c", "issueId": "i", "agentId": "a", "runId": "r",
         "remoteSessionId": "s", "repository": "owner/repo", "branch": "main",
         "pullRequestUrl": "https://github.com/owner/repo/pull/7",
         "headSha": "a" * 40, "baseSha": "b" * 40,
         "paths": ["qualification/out.md"],
         "bodies": {"qualification/out.md": "paperclip_run_id: r\npaperclip_issue_id: i\npaperclip_agent_id: a\njules_session_id: s\n"},
         "prMetadataVerified": True}
    p.update(over)
    return p


class FakeApi:
    def __init__(self, resp): self.resp = resp
    def request(self, method, path, body=None):
        assert method == "POST" and path.endswith("/supervisor/artifact/read"), (method, path)
        assert isinstance(body, dict) and "paperclipRunId" in body
        return self.resp


class Retrieval(unittest.TestCase):
    def test_authenticated_retrieval_returns_product(self):
        env = {"artifactRetrieved": True, "code": "ARTIFACT_RETRIEVED", "contentHash": "sha256:x", "product": product()}
        got = read_product(ACT, FakeApi(env))
        self.assertTrue(got["artifactRetrieved"]); self.assertEqual(got["headSha"], "a" * 40)
        self.assertEqual(got["contentHash"], "sha256:x")

    def test_recoverable_token_missing(self):
        env = {"artifactRetrieved": False, "code": "GITHUB_TOKEN_MISSING", "product": {"companyId": "c"}}
        with self.assertRaises(ArtifactUnavailable) as e:
            read_product(ACT, FakeApi(env))
        self.assertEqual(e.exception.code, "GITHUB_TOKEN_MISSING")

    def test_github_rejection_status_preserved(self):
        env = {"artifactRetrieved": False, "code": "GITHUB_READ_REJECTED", "status": 404, "product": {}}
        with self.assertRaises(ArtifactUnavailable) as e:
            read_product(ACT, FakeApi(env))
        self.assertEqual(e.exception.status, 404)

    def test_malformed_response_rejected(self):
        with self.assertRaises(SafetyError):
            read_product(ACT, FakeApi({"nope": True}))

    def test_missing_runid_rejected(self):
        with self.assertRaises(SafetyError):
            read_product({**ACT, "runId": None}, FakeApi({"artifactRetrieved": True, "product": product()}))

    def test_provider_verified_classification(self):
        self.assertEqual(classify_provenance(product(), {"verdict": "PASS"}), "PROVIDER_ARTIFACT_VERIFIED")

    def test_manual_document_is_registration_only(self):
        manual = product(); manual.pop("prMetadataVerified")
        self.assertEqual(classify_provenance(manual, {"verdict": "REVIEW_REQUIRED"}), "API_REGISTRATION_ONLY")

    def test_manual_document_fails_provenance_validation(self):
        manual = product(); manual.pop("prMetadataVerified")
        manual["paths"] = ["manual/note.md"]; manual["bodies"] = {"manual/note.md": "just a note"}
        task = {"writeScopes": ["manual/*"], "requirePR": True, "provenanceRequired": True}
        self.assertEqual(validate(manual, ACT, task)["verdict"], "FAIL")


if __name__ == "__main__":
    unittest.main(verbosity=2)
