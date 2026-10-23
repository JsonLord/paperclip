#!/usr/bin/env python3
import io
import json
import os
import unittest
import urllib.error
from unittest.mock import patch, MagicMock
from agency_supervisor.api import AdminTokenApi, NoRedirect
from agency_supervisor.controller import SafetyError


class AdminTokenApiTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(
            os.environ,
            {"PAPERCLIP_ADMIN_API_TOKEN": "test-admin-token-only"},
            clear=True,
        )
        self.env.start()
        self.addCleanup(self.env.stop)
        self.opener = MagicMock()
        self.opener.open.return_value.__enter__.return_value = io.BytesIO(
            json.dumps(
                {
                    "user": {"id": "admin"},
                    "session": {"id": "session:admin_token:admin"},
                }
            ).encode()
        )
        self.factory = patch("urllib.request.build_opener", return_value=self.opener)
        self.factory.start()
        self.addCleanup(self.factory.stop)

    def test_bearer_only_without_login_cookies_or_origin(self):
        api = AdminTokenApi("https://paperclip.example")
        request = self.opener.open.call_args.args[0]
        self.assertEqual(request.method, "GET")
        self.assertEqual(
            request.full_url, "https://paperclip.example/api/auth/get-session"
        )
        self.assertEqual(
            request.get_header("Authorization"), "Bearer test-admin-token-only"
        )
        self.assertIsNone(request.get_header("Origin"))
        self.assertIsNone(request.get_header("Cookie"))
        self.assertEqual(self.opener.open.call_count, 1)

    def test_missing_token_never_falls_back_to_password_or_signing_secret(self):
        os.environ.pop("PAPERCLIP_ADMIN_API_TOKEN")
        os.environ.update(
            PAPERCLIP_ADMIN_PASSWORD="password", BETTER_AUTH_SECRET="signing"
        )
        with self.assertRaises(SafetyError):
            AdminTokenApi("https://paperclip.example")
        self.opener.open.assert_not_called()

    def test_cookie_identity_is_rejected(self):
        self.opener.open.return_value.__enter__.return_value = io.BytesIO(
            json.dumps(
                {"user": {"id": "admin"}, "session": {"id": "cookie-session"}}
            ).encode()
        )
        with self.assertRaises(SafetyError):
            AdminTokenApi("https://paperclip.example")

    def test_401_or_uncertain_response_has_no_retry_or_fallback(self):
        for error in [
            urllib.error.HTTPError(
                "https://paperclip.example", 401, "Unauthorized", {}, None
            ),
            OSError("test-admin-token-only"),
        ]:
            with self.subTest(error=type(error)):
                self.opener.open.reset_mock()
                self.opener.open.side_effect = error
                with self.assertRaises(SafetyError) as raised:
                    AdminTokenApi("https://paperclip.example")
                self.assertEqual(self.opener.open.call_count, 1)
                self.assertNotIn("test-admin-token-only", str(raised.exception))

    def test_redirect_and_unsafe_origin_are_rejected(self):
        with self.assertRaises(SafetyError):
            NoRedirect().redirect_request(None, None, None, None, None, None)
        for origin in [
            "http://paperclip.example",
            "https://user:password@paperclip.example",
            "https://paperclip.example/api",
            "https://paperclip.example?token=x",
        ]:
            with self.subTest(origin=origin), self.assertRaises(SafetyError):
                AdminTokenApi(origin)


if __name__ == "__main__":
    unittest.main()
