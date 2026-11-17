const OCR_FAILURE_REASONS = new Map([
  ["OCR_FAILED", "OCR returned no readable plate"],
  ["OCR_UNCERTAIN", "OCR confidence below threshold; continue reading frames"],
  ["INVALID_PLATE", "OCR output does not match a valid plate format"],
]);

export function getOcrQualityDecision(plateNumber, statusHint) {
  const status = String(statusHint || "").toUpperCase();
  const reason = OCR_FAILURE_REASONS.get(status);
  if (!reason) return null;

  return {
    vehicle: null,
    invitation: null,
    permission: null,
    status,
    decision: "UNKNOWN",
    reason: plateNumber
      ? `${reason}; supplied plate text was not used for access`
      : reason,
  };
}
