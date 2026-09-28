import unittest

from lprs_runtime import OCRAttempt, build_detection_event, classify_plate, summarize_ocr


class LPRSRuntimeTests(unittest.TestCase):
    def test_empty_ocr_is_unknown_not_unauthorized(self):
        state, result = classify_plate(
            summarize_ocr([OCRAttempt("", "", 0.0)]),
            {"AP12JA1234"},
            0.30,
        )

        self.assertEqual(state, "OCR_FAILED")
        self.assertEqual(result["decision"], "UNKNOWN")


    def test_low_confidence_ocr_is_unknown(self):
        state, result = classify_plate(
            summarize_ocr([OCRAttempt("AP12JA1234", "AP12JA1234", 0.2)]),
            {"AP12JA1234"},
            0.30,
        )

        self.assertEqual(state, "OCR_UNCERTAIN")
        self.assertEqual(result["decision"], "UNKNOWN")


    def test_consensus_is_used_for_authorization(self):
        summary = summarize_ocr(
            [
                OCRAttempt("AP12 JA1234", "AP12JA1234", 0.70),
                OCRAttempt("AP12JA1234", "AP12JA1234", 0.91),
                OCRAttempt("AP12JA1234", "AP12JA1234", 0.80),
                OCRAttempt("AP12JB1234", "AP12JB1234", 0.99),
            ]
        )

        state, result = classify_plate(summary, {"AP12JA1234"}, 0.30)

        self.assertEqual(summary.plate, "AP12JA1234")
        self.assertEqual(summary.consensus, 3)
        self.assertEqual(state, "AUTHORIZED")
        self.assertEqual(result["decision"], "AUTHORIZED")


    def test_valid_but_unlisted_plate_is_unauthorized(self):
        state, result = classify_plate(
            summarize_ocr([OCRAttempt("AP99ZZ9999", "AP99ZZ9999", 0.87)]),
            {"AP12JA1234"},
            0.30,
        )

        self.assertEqual(state, "UNAUTHORIZED")
        self.assertEqual(result["decision"], "UNAUTHORIZED")

    def test_detection_event_preserves_ocr_failure_as_unknown(self):
        event = build_detection_event(
            summarize_ocr([OCRAttempt("", "", 0.0)]),
            "car",
            {"AP12JA1234"},
            0.30,
        )

        self.assertEqual(event["event"], "vehicle_detected")
        self.assertEqual(event["status"], "OCR_FAILED")
        self.assertEqual(event["decision"], "UNKNOWN")
        self.assertFalse(event["format_valid"])


if __name__ == "__main__":
    unittest.main()