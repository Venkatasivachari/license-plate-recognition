import assert from "node:assert/strict";
import test from "node:test";
import { getOcrQualityDecision } from "./ocrQualityGate.js";

test("OCR failure statuses fail closed even when plate text is present", () => {
  for (const status of ["OCR_FAILED", "OCR_UNCERTAIN", "INVALID_PLATE"]) {
    const result = getOcrQualityDecision("AP12AB1234", status);

    assert.equal(result.status, status);
    assert.equal(result.decision, "UNKNOWN");
    assert.equal(result.vehicle, null);
    assert.match(result.reason, /supplied plate text was not used for access/);
  }
});

test("OCR failure statuses without text remain unknown", () => {
  for (const status of ["OCR_FAILED", "OCR_UNCERTAIN", "INVALID_PLATE"]) {
    const result = getOcrQualityDecision("", status);

    assert.equal(result.status, status);
    assert.equal(result.decision, "UNKNOWN");
    assert.doesNotMatch(result.reason, /supplied plate text/);
  }
});

test("successful OCR statuses continue to the normal access lookup", () => {
  assert.equal(getOcrQualityDecision("AP12AB1234", "AUTHORIZED"), null);
  assert.equal(getOcrQualityDecision("AP12AB1234", undefined), null);
});
