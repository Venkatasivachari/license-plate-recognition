"""Service-authenticated access decisions for standalone LPRS hardware clients."""

from __future__ import annotations

import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path
import urllib.error
import urllib.request
from uuid import uuid4

from dotenv import load_dotenv

from config import OCR_CONFIDENCE_THRESHOLD, OCR_CONSENSUS_FRAMES
from plate_validator import validate_plate

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(PROJECT_ROOT / "backend" / ".env")

BACKEND_URL = os.getenv("LPRS_ACCESS_URL", "http://localhost:4000/api/access/events")


class BackendAccessError(RuntimeError):
    """Raised when an authoritative backend access decision is unavailable."""


def evaluate_plate_access(
    plate: str,
    confidence: float,
    consensus: int,
    camera_id: str,
) -> dict:
    validation = validate_plate(plate)
    if not validation["valid"]:
        raise ValueError("A valid plate is required for an access lookup")
    if not math.isfinite(confidence) or not 0 <= confidence <= 1:
        raise ValueError("OCR confidence must be between 0 and 1")
    if confidence < OCR_CONFIDENCE_THRESHOLD:
        raise ValueError("OCR confidence is below the configured access threshold")
    if not isinstance(consensus, int) or consensus < 0:
        raise ValueError("OCR consensus must be a non-negative integer")
    if consensus < OCR_CONSENSUS_FRAMES:
        raise ValueError("OCR consensus is below the configured access threshold")

    token = os.getenv("LPRS_AI_TOKEN") or os.getenv("SERVICE_TOKEN")
    if not token:
        raise BackendAccessError("Backend service credentials are not configured")

    request_payload = {
        "event": "vehicle_detected",
        "plate": validation["plate"],
        "status": "RECOGNIZED",
        "decision": "UNKNOWN",
        "ocr_confidence": confidence,
        "ocr_consensus": consensus,
        "format_valid": True,
        "source": "REAL",
        "cameraId": camera_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "idempotencyKey": f"{camera_id}:{uuid4()}",
    }
    request = urllib.request.Request(
        BACKEND_URL,
        data=json.dumps(request_payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raise BackendAccessError(f"Backend access lookup returned HTTP {error.code}") from error
    except urllib.error.URLError as error:
        raise BackendAccessError(f"Backend access lookup failed: {error.reason}") from error
    except (TimeoutError, OSError) as error:
        raise BackendAccessError(f"Backend access lookup failed: {error}") from error
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise BackendAccessError("Backend returned an invalid access response") from error

    if not isinstance(result, dict) or result.get("decision") not in {"AUTHORIZED", "UNAUTHORIZED", "UNKNOWN"}:
        raise BackendAccessError("Backend response did not contain an authoritative access decision")
    return result
