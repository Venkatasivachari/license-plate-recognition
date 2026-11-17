import json
import os
import unittest
from unittest.mock import patch

from backend_access import BackendAccessError, evaluate_plate_access


class FakeResponse:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return json.dumps(self.body).encode("utf-8")


class BackendAccessTests(unittest.TestCase):
    @patch.dict(os.environ, {"SERVICE_TOKEN": "test-token"}, clear=True)
    @patch("backend_access.urllib.request.urlopen")
    def test_sends_access_event_to_authenticated_backend(self, urlopen):
        urlopen.return_value = FakeResponse({
            "decision": "AUTHORIZED",
            "status": "PERMISSION_VALID",
        })

        result = evaluate_plate_access("AP12A1234", 0.9, 2, "test-camera")

        self.assertEqual(result["decision"], "AUTHORIZED")
        request = urlopen.call_args.args[0]
        self.assertEqual(request.get_header("Authorization"), "Bearer test-token")
        payload = json.loads(request.data)
        self.assertEqual(payload["plate"], "AP12A1234")
        self.assertEqual(payload["status"], "RECOGNIZED")
        self.assertEqual(payload["decision"], "UNKNOWN")
        self.assertEqual(payload["ocr_consensus"], 2)

    @patch.dict(os.environ, {}, clear=True)
    @patch("backend_access.urllib.request.urlopen")
    def test_missing_service_credentials_fail_closed(self, urlopen):
        with self.assertRaisesRegex(BackendAccessError, "credentials are not configured"):
            evaluate_plate_access("AP12A1234", 0.9, 2, "test-camera")
        urlopen.assert_not_called()

    @patch.dict(os.environ, {"SERVICE_TOKEN": "test-token"}, clear=True)
    @patch("backend_access.urllib.request.urlopen")
    def test_invalid_or_low_quality_reads_are_not_sent(self, urlopen):
        with self.assertRaises(ValueError):
            evaluate_plate_access("not-a-plate", 0.9, 2, "test-camera")
        with self.assertRaises(ValueError):
            evaluate_plate_access("AP12A1234", 0.1, 2, "test-camera")
        with self.assertRaises(ValueError):
            evaluate_plate_access("AP12A1234", float("nan"), 2, "test-camera")
        with self.assertRaises(ValueError):
            evaluate_plate_access("AP12A1234", 0.9, 1, "test-camera")
        urlopen.assert_not_called()

    @patch.dict(os.environ, {"SERVICE_TOKEN": "test-token"}, clear=True)
    @patch("backend_access.urllib.request.urlopen")
    def test_backend_failures_are_reported(self, urlopen):
        urlopen.side_effect = TimeoutError("timed out")
        with self.assertRaisesRegex(BackendAccessError, "timed out"):
            evaluate_plate_access("AP12A1234", 0.9, 2, "test-camera")


if __name__ == "__main__":
    unittest.main()
