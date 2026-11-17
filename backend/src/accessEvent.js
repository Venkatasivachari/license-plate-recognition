const normalizePlate = (value) => String(value || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
const OCR_FAILURE_STATUSES = new Set(["OCR_FAILED", "OCR_UNCERTAIN", "INVALID_PLATE"]);

export function prepareAccessEvent(payload, { minimumConfidence = 0.3, minimumConsensus = 2 } = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("Access event must be an object");
  }
  if (!Number.isFinite(minimumConfidence) || minimumConfidence < 0 || minimumConfidence > 1) {
    throw new TypeError("Configured minimum OCR confidence must be between 0 and 1");
  }
  if (!Number.isInteger(minimumConsensus) || minimumConsensus < 1) {
    throw new TypeError("Configured minimum OCR consensus must be a positive integer");
  }

  const plateNumber = normalizePlate(payload.plateNumber || payload.plate);
  const confidence = Number(payload.ocr_confidence ?? payload.ocrConfidence);
  const consensus = Number(payload.ocr_consensus ?? payload.ocrConsensus);
  const requestedStatus = String(payload.status || "").toUpperCase();

  if (!["RECOGNIZED", ...OCR_FAILURE_STATUSES].includes(requestedStatus)) {
    throw new TypeError("Access event status must describe OCR quality, not an access decision");
  }
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new TypeError("OCR confidence must be between 0 and 1");
  }
  if (!Number.isInteger(consensus) || consensus < 0) {
    throw new TypeError("OCR consensus must be a non-negative integer");
  }
  if (payload.timestamp && !Number.isFinite(Date.parse(payload.timestamp))) {
    throw new TypeError("Access event timestamp is invalid");
  }

  let status = requestedStatus;
  if (!OCR_FAILURE_STATUSES.has(status)) {
    if (!plateNumber || payload.format_valid !== true) status = "INVALID_PLATE";
    else if (confidence < minimumConfidence || consensus < minimumConsensus) status = "OCR_UNCERTAIN";
  }

  return {
    ...payload,
    plateNumber,
    status,
    decision: "UNKNOWN",
    ocr_confidence: confidence,
    ocr_consensus: consensus,
  };
}
