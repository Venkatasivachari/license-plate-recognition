"""Pure runtime decisions used by the live LPRS application."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Iterable

from plate_validator import validate_plate


@dataclass(frozen=True)
class OCRAttempt:
    raw_text: str
    plate: str
    confidence: float


@dataclass(frozen=True)
class OCRSummary:
    raw_text: str
    plate: str
    confidence: float
    consensus: int
    attempts: int


def summarize_ocr(attempts: Iterable[OCRAttempt]) -> OCRSummary:
    """Select the highest-confidence plate among the most supported values."""
    usable = [attempt for attempt in attempts if attempt.plate and attempt.confidence > 0]
    if not usable:
        return OCRSummary("", "", 0.0, 0, 0)

    grouped: dict[str, list[OCRAttempt]] = defaultdict(list)
    for attempt in usable:
        grouped[attempt.plate].append(attempt)

    plate, group = max(
        grouped.items(),
        key=lambda item: (len(item[1]), max(value.confidence for value in item[1])),
    )
    best = max(group, key=lambda attempt: attempt.confidence)
    return OCRSummary(
        raw_text=best.raw_text,
        plate=plate,
        confidence=best.confidence,
        consensus=len(group),
        attempts=len(attempts),
    )


def classify_plate(
    summary: OCRSummary,
    authorized_plates: set[str],
    minimum_confidence: float,
) -> tuple[str, dict]:
    """Return UNKNOWN until OCR is usable and the normalized format is valid."""
    if not summary.plate or summary.confidence <= 0:
        return "OCR_FAILED", {
            "decision": "UNKNOWN",
            "reason": "OCR returned no text",
        }

    if summary.confidence < minimum_confidence:
        return "OCR_UNCERTAIN", {
            "decision": "UNKNOWN",
            "reason": "OCR confidence below threshold",
        }

    validation = validate_plate(summary.plate)
    if not validation["valid"]:
        return "INVALID_PLATE", {
            "decision": "UNKNOWN",
            "reason": validation["reason"],
            "validation": validation,
        }

    if validation["plate"] in authorized_plates:
        return "AUTHORIZED", {
            "decision": "AUTHORIZED",
            "validation": validation,
        }

    return "UNAUTHORIZED", {
        "decision": "UNAUTHORIZED",
        "validation": validation,
    }


def build_detection_event(
    summary: OCRSummary,
    vehicle_class: str,
    authorized_plates: set[str],
    minimum_confidence: float,
) -> dict:
    """Create the stable, JSON-friendly payload sent to dashboard clients."""
    state, details = classify_plate(summary, authorized_plates, minimum_confidence)
    validation = details.get("validation", {})
    return {
        "event": "vehicle_detected",
        "vehicle_type": vehicle_class or "Unknown",
        "raw_ocr": summary.raw_text,
        "plate": validation.get("plate", summary.plate),
        "ocr_confidence": summary.confidence,
        "ocr_attempts": summary.attempts,
        "ocr_consensus": summary.consensus,
        "format_valid": bool(validation.get("valid", False)),
        "state": validation.get("state", "Unknown"),
        "status": state,
        "decision": details["decision"],
        "reason": details.get("reason", ""),
    }