import assert from "node:assert/strict";
import test from "node:test";
import { prepareAccessEvent } from "./accessEvent.js";

const validPayload = {
  plate: "AP12A1234",
  status: "RECOGNIZED",
  decision: "AUTHORIZED",
  format_valid: true,
  ocr_confidence: 0.9,
  ocr_consensus: 2,
};

test("recognized access events never carry a client authorization decision", () => {
  const event = prepareAccessEvent(validPayload);

  assert.equal(event.status, "RECOGNIZED");
  assert.equal(event.decision, "UNKNOWN");
  assert.equal(event.plateNumber, "AP12A1234");
});

test("weak OCR is converted to an uncertain status", () => {
  assert.equal(prepareAccessEvent({ ...validPayload, ocr_confidence: 0.1 }).status, "OCR_UNCERTAIN");
  assert.equal(prepareAccessEvent({ ...validPayload, ocr_consensus: 1 }).status, "OCR_UNCERTAIN");
});

test("invalid or explicitly failed OCR cannot reach access lookup", () => {
  assert.equal(prepareAccessEvent({ ...validPayload, format_valid: false }).status, "INVALID_PLATE");
  assert.equal(prepareAccessEvent({ ...validPayload, status: "OCR_UNCERTAIN" }).status, "OCR_UNCERTAIN");
});

test("invalid event shapes and access statuses are rejected", () => {
  assert.throws(() => prepareAccessEvent(null), /must be an object/);
  assert.throws(() => prepareAccessEvent({ ...validPayload, status: "AUTHORIZED" }), /OCR quality/);
  assert.throws(() => prepareAccessEvent({ ...validPayload, ocr_consensus: 2.5 }), /non-negative integer/);
});
