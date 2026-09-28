"""HTTP frame gateway for the existing LPRS inference modules."""
from __future__ import annotations

import base64
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import cv2
import numpy as np
import openai
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

client = openai.OpenAI(
    base_url=os.getenv("OMNIROUTE_BASE_URL", "http://localhost:20128/v1"),
    api_key=os.getenv("OMNIROUTE_API_KEY"),
)

SRC_DIR = Path(__file__).resolve().parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from config import AUTHORIZED_PLATES, OCR_CONFIDENCE_THRESHOLD, UNAUTHORIZED_PLATES, YOLO_CONFIDENCE_THRESHOLD  # noqa: E402
from lprs_runtime import OCRAttempt, build_detection_event, summarize_ocr  # noqa: E402
from ocr import read_plate  # noqa: E402
from plate_detection import PlateDetector  # noqa: E402
from vehicle_detection import VehicleDetector  # noqa: E402

MODEL_PATH = os.getenv("LPRS_MODEL_PATH")
BACKEND_URL = os.getenv("LPRS_BACKEND_URL", "http://localhost:4000/api/events")
PAPER_TEST_MODE = os.getenv("LPRS_PAPER_TEST", "false").lower() == "true"
_detector = None
_plate_detector = PlateDetector()


def _load_dotenv_values(path):
    values = {}
    try:
        for line in Path(path).read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            values[key.strip()] = value.strip().strip('"').strip("'")
    except OSError:
        pass
    return values


SERVICE_TOKEN = os.getenv("LPRS_AI_TOKEN") or _load_dotenv_values(SRC_DIR.parent / "backend" / ".env").get("SERVICE_TOKEN", "")


def review_uncertain_plate(ocr_text: str, confidence: float) -> str:
    response = client.chat.completions.create(
        model="auto/best-coding",
        messages=[
            {
                "role": "user",
                "content": (
                    f"OCR read '{ocr_text}' with {confidence}% confidence. "
                    "Is this likely a valid license plate format? "
                    "Answer yes/no with brief reasoning."
                ),
            }
        ],
    )
    return response.choices[0].message.content or ""


def process_frame(frame: np.ndarray) -> dict:
    global _detector
    started = time.perf_counter()
    if _detector is None:
        _detector = VehicleDetector(MODEL_PATH)
    vehicles = _detector.detect(frame, YOLO_CONFIDENCE_THRESHOLD)
    plate_only = not vehicles

    best = max(vehicles, key=lambda item: item["confidence"]) if vehicles else {"bbox": (0, 0, frame.shape[1], frame.shape[0]), "confidence": 1.0, "class_name": "Plate Inspection"}
    vehicle_crop = _detector.crop_vehicle(frame, best["bbox"]) if vehicles else frame
    plate_bbox = _plate_detector.detect(vehicle_crop)
    if plate_bbox is None and vehicles:
        return {"event": "vehicle_detected", "status": "NO_PLATE", "decision": "UNKNOWN", "vehicle_type": best["class_name"], "detection_confidence": best["confidence"], "processing_ms": round((time.perf_counter() - started) * 1000, 1)}

    def padded_crop(bbox):
        x1, y1, x2, y2 = bbox
        padding_x = max(8, int((x2 - x1) * 0.12))
        padding_y = max(8, int((y2 - y1) * 0.35))
        x1 = max(0, x1 - padding_x)
        y1 = max(0, y1 - padding_y)
        x2 = min(vehicle_crop.shape[1], x2 + padding_x)
        y2 = min(vehicle_crop.shape[0], y2 + padding_y)
        return vehicle_crop[y1:y2, x1:x2]

    crops = [padded_crop(candidate) for candidate in _plate_detector.detect_plate_candidates(vehicle_crop)]
    crops.append(vehicle_crop)
    raw_text, confidence = "", 0.0
    for crop in crops:
        candidate_text, candidate_confidence = read_plate(crop)
        if candidate_confidence > confidence:
            raw_text, confidence = candidate_text, candidate_confidence
        if candidate_text and candidate_confidence >= OCR_CONFIDENCE_THRESHOLD:
            break
    attempt = OCRAttempt(raw_text=raw_text, plate=raw_text, confidence=confidence)
    if plate_only and not raw_text:
        return {"event": "vehicle_detected", "status": "NO_VEHICLE", "decision": "UNKNOWN", "vehicle_type": "Unknown", "processing_ms": round((time.perf_counter() - started) * 1000, 1)}
    event = build_detection_event(summarize_ocr([attempt]), best["class_name"], set(AUTHORIZED_PLATES), OCR_CONFIDENCE_THRESHOLD)
    if event.get("plate") in UNAUTHORIZED_PLATES:
        event.update({"status": "UNAUTHORIZED", "decision": "UNAUTHORIZED", "reason": "Plate is explicitly unauthorized"})
    event.update({"detection_confidence": best["confidence"], "vehicle_bbox": best["bbox"], "plate_bbox": plate_bbox, "processing_ms": round((time.perf_counter() - started) * 1000, 1), "source": "PLATE_ONLY" if plate_only else "REAL", "demoData": False})
    return event


class FrameHandler(BaseHTTPRequestHandler):
    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/health":
            self._json(200, {"status": "ok", "service": "python-ai", "pipeline": "YOLO -> plate detection -> EasyOCR -> validation"})
            return
        self._json(404, {"error": "Not found"})

    def do_POST(self) -> None:
        if self.path != "/process-frame":
            self._json(404, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            image = base64.b64decode(payload["image"])
            frame = cv2.imdecode(np.frombuffer(image, dtype=np.uint8), cv2.IMREAD_COLOR)
            if frame is None:
                raise ValueError("Frame could not be decoded")
            event = process_frame(frame)
            if event.get("format_valid") and event.get("plate") and event.get("status") not in {"NO_VEHICLE", "NO_PLATE", "OCR_FAILED", "OCR_UNCERTAIN", "INVALID_PLATE"}:
                import urllib.request
                headers = {"Content-Type": "application/json"}
                if SERVICE_TOKEN:
                    headers["Authorization"] = f"Bearer {SERVICE_TOKEN}"
                request = urllib.request.Request(BACKEND_URL, data=json.dumps(event).encode(), headers=headers)
                try:
                    with urllib.request.urlopen(request, timeout=15) as backend_response:
                        persisted = json.loads(backend_response.read().decode("utf-8"))
                    if isinstance(persisted, dict) and (persisted.get("plateNumber") or persisted.get("plate_number") or persisted.get("plate")):
                        event.update(persisted)
                except Exception as error:
                    print(f"BACKEND POST FAILED: {error}")
            self._json(200, event)
        except Exception as error:
            self._json(400, {"event": "vehicle_detected", "status": "AI_ERROR", "decision": "UNKNOWN", "error": str(error)})

    def log_message(self, format: str, *args: object) -> None:
        if os.getenv("DEBUG", "false").lower() == "true":
            super().log_message(format, *args)


if __name__ == "__main__":
    port = int(os.getenv("LPRS_AI_PORT", "5001"))
    print(f"Python AI frame service listening on {port}")
    ThreadingHTTPServer(("0.0.0.0", port), FrameHandler).serve_forever()
