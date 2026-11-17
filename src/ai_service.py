"""HTTP frame gateway for the existing LPRS inference modules."""
from __future__ import annotations

import base64
import json
import os
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import cv2
import numpy as np
from dotenv import load_dotenv

SRC_DIR = Path(__file__).resolve().parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from plate_validator import validate_plate

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from config import OCR_CONFIDENCE_THRESHOLD, OCR_CONSENSUS_FRAMES, OCR_CONSENSUS_WINDOW_SECONDS, PLATE_MIN_WIDTH_PIXELS, VEHICLE_MODEL_PATH, YOLO_CONFIDENCE_THRESHOLD  # noqa: E402
from lprs_runtime import OCRAttempt, PlateConsensus, build_detection_event  # noqa: E402
_ocr_startup_started = time.perf_counter()
from ocr import analyze_plate_styling, read_plate  # noqa: E402
OCR_STARTUP_MS = round((time.perf_counter() - _ocr_startup_started) * 1000, 1)
from plate_detection import PlateDetector  # noqa: E402
from vehicle_detection import VehicleDetector  # noqa: E402

BACKEND_URL = os.getenv("LPRS_BACKEND_URL", "http://localhost:4000/api/events")
_detector = None
_vehicle_model_load_ms = None
_plate_model_load_started = time.perf_counter()
_plate_detector = PlateDetector()
PLATE_MODEL_LOAD_MS = round((time.perf_counter() - _plate_model_load_started) * 1000, 1)
_plate_consensus = PlateConsensus(OCR_CONSENSUS_FRAMES, OCR_CONSENSUS_WINDOW_SECONDS)
_frame_lock = threading.Lock()


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
ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.getenv(
        "LPRS_AI_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
}
MAX_FRAME_BYTES = 8 * 1024 * 1024


def process_frame(frame: np.ndarray, camera_id: str = "laptop-browser-1") -> dict:
    with _frame_lock:
        return _process_frame(frame, camera_id)


def _process_frame(frame: np.ndarray, camera_id: str) -> dict:
    global _detector, _vehicle_model_load_ms
    started = time.perf_counter()
    timings = {}

    def finish(event: dict) -> dict:
        inference_ms = round((time.perf_counter() - started) * 1000, 1)
        event["processing_ms"] = inference_ms
        event["frame_width"] = int(frame.shape[1])
        event["frame_height"] = int(frame.shape[0])
        event["timings"] = {
            "vehicle_model_load_ms": _vehicle_model_load_ms,
            "plate_model_load_ms": PLATE_MODEL_LOAD_MS,
            "ocr_startup_ms": OCR_STARTUP_MS,
            **timings,
            "inference_ms": inference_ms,
        }
        return event

    model_started = time.perf_counter()
    if _detector is None:
        _detector = VehicleDetector(str(VEHICLE_MODEL_PATH))
        _vehicle_model_load_ms = round((time.perf_counter() - model_started) * 1000, 1)
    vehicle_started = time.perf_counter()
    vehicles = _detector.detect(frame, YOLO_CONFIDENCE_THRESHOLD)
    timings["vehicle_detection_ms"] = round((time.perf_counter() - vehicle_started) * 1000, 1)
    plate_only = not vehicles

    crop_started = time.perf_counter()
    best = max(vehicles, key=lambda item: item["confidence"]) if vehicles else {"bbox": (0, 0, frame.shape[1], frame.shape[0]), "confidence": 1.0, "class_name": "Plate Inspection", "track_id": None}
    vehicle_crop = _detector.crop_vehicle(frame, best["bbox"]) if vehicles else frame
    timings["vehicle_crop_ms"] = round((time.perf_counter() - crop_started) * 1000, 1)

    plate_started = time.perf_counter()
    detected_candidates = _plate_detector.detect_plate_candidates(vehicle_crop)
    plate_candidates = [candidate for candidate in detected_candidates if candidate[2] - candidate[0] >= PLATE_MIN_WIDTH_PIXELS]
    plate_bbox = plate_candidates[0] if plate_candidates else None

    def plate_bbox_in_frame(bbox):
        if bbox is None:
            return None
        offset_x, offset_y = best["bbox"][:2] if vehicles else (0, 0)
        return (bbox[0] + offset_x, bbox[1] + offset_y, bbox[2] + offset_x, bbox[3] + offset_y)

    timings["plate_detection_ms"] = round((time.perf_counter() - plate_started) * 1000, 1)
    if detected_candidates and not plate_candidates:
        return finish({"event": "vehicle_detected", "status": "OCR_UNCERTAIN", "decision": "UNKNOWN", "plate": "", "reason": "Plate crop is too small for reliable reading; waiting for a clearer frame", "vehicle_type": best["class_name"], "vehicle_bbox": best["bbox"] if vehicles else None, "track_id": best.get("track_id"), "plate_width_pixels": max((candidate[2] - candidate[0] for candidate in detected_candidates), default=0)})
    if plate_bbox is None and vehicles:
        return finish({"event": "vehicle_detected", "status": "NO_PLATE", "decision": "UNKNOWN", "vehicle_type": best["class_name"], "vehicle_bbox": best["bbox"], "track_id": best.get("track_id"), "detection_confidence": best["confidence"]})

    def padded_crop(bbox):
        x1, y1, x2, y2 = bbox
        padding_x = max(8, int((x2 - x1) * 0.12))
        padding_y = max(8, int((y2 - y1) * 0.35))
        x1 = max(0, x1 - padding_x)
        y1 = max(0, y1 - padding_y)
        x2 = min(vehicle_crop.shape[1], x2 + padding_x)
        y2 = min(vehicle_crop.shape[0], y2 + padding_y)
        return vehicle_crop[y1:y2, x1:x2]

    crop_started = time.perf_counter()
    crops = [padded_crop(candidate) for candidate in plate_candidates] or [vehicle_crop]
    timings["plate_crop_ms"] = round((time.perf_counter() - crop_started) * 1000, 1)

    ocr_started = time.perf_counter()
    raw_text, confidence = "", 0.0
    best_crop = crops[0] if crops else vehicle_crop
    for crop in crops:
        max_ocr_variants = 1 if plate_only and plate_bbox is None else None
        candidate_text, candidate_confidence = read_plate(crop, max_variants=max_ocr_variants)
        if candidate_confidence > confidence:
            raw_text, confidence = candidate_text, candidate_confidence
            best_crop = crop
        if candidate_text and candidate_confidence >= OCR_CONFIDENCE_THRESHOLD and validate_plate(candidate_text)["valid"]:
            best_crop = crop
            break
    timings["ocr_ms"] = round((time.perf_counter() - ocr_started) * 1000, 1)
    styling = analyze_plate_styling(best_crop, best.get("class_name", "Vehicle"))
    attempt = OCRAttempt(raw_text=raw_text, plate=raw_text, confidence=confidence)
    if plate_only and not raw_text:
        return finish({"event": "vehicle_detected", "status": "NO_VEHICLE", "decision": "UNKNOWN", "vehicle_type": "Unknown", "plate_styling": styling})
    validation = validate_plate(raw_text)
    track_key = f"{camera_id}:{best.get('track_id') if best.get('track_id') is not None else 'untracked'}"
    consensus_started = time.perf_counter()
    summary = _plate_consensus.add(track_key, attempt)
    timings["consensus_ms"] = round((time.perf_counter() - consensus_started) * 1000, 1)
    if summary is None:
        return finish({"event": "vehicle_detected", "status": "OCR_UNCERTAIN", "decision": "UNKNOWN", "plate": validation["plate"], "raw_ocr": raw_text, "ocr_confidence": confidence, "ocr_consensus": 1, "format_valid": True, "reason": "Waiting for a second consecutive matching frame", "vehicle_type": best["class_name"], "vehicle_bbox": best["bbox"] if vehicles else None, "plate_bbox": plate_bbox_in_frame(plate_bbox), "track_id": best.get("track_id"), "plate_width_pixels": plate_bbox[2] - plate_bbox[0] if plate_bbox else 0, "plate_styling": styling, "plate_category": styling["category"], "plate_bg_hex": styling["bg_hex"], "plate_text_hex": styling["text_hex"], "plate_layout": styling["layout"]})
    event = build_detection_event(summary, best["class_name"], None, OCR_CONFIDENCE_THRESHOLD)
    event.update({"detection_confidence": best["confidence"], "vehicle_bbox": best["bbox"] if vehicles else None, "plate_bbox": plate_bbox_in_frame(plate_bbox), "plate_width_pixels": plate_bbox[2] - plate_bbox[0] if plate_bbox else 0, "track_id": best.get("track_id"), "cameraId": camera_id, "source": "PLATE_ONLY" if plate_only else "REAL", "demoData": False, "plate_styling": styling, "plate_category": styling["category"], "plate_bg_hex": styling["bg_hex"], "plate_text_hex": styling["text_hex"], "plate_layout": styling["layout"]})
    return finish(event)


class FrameHandler(BaseHTTPRequestHandler):
    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        origin = self.headers.get("Origin")
        if origin and origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

    def do_OPTIONS(self) -> None:
        origin = self.headers.get("Origin")
        if origin and origin not in ALLOWED_ORIGINS:
            self._json(403, {"error": "Origin is not allowed"})
            return
        self.send_response(204)
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/health":
            model_loaded = _plate_detector.model is not None
            self._json(200 if model_loaded else 503, {
                "status": "ok" if model_loaded else "degraded",
                "service": "python-ai",
                "plate_detector": "trained_weights_loaded" if model_loaded else "contour_fallback",
                "pipeline": "YOLO -> plate detection -> EasyOCR -> validation",
                "startup_timings": {
                    "ocr_model_load_ms": OCR_STARTUP_MS,
                    "plate_model_load_ms": PLATE_MODEL_LOAD_MS,
                },
            })
            return
        self._json(404, {"error": "Not found"})

    def do_POST(self) -> None:
        if self.path != "/process-frame":
            self._json(404, {"error": "Not found"})
            return
        origin = self.headers.get("Origin")
        if origin and origin not in ALLOWED_ORIGINS:
            self._json(403, {"error": "Origin is not allowed"})
            return
        request_started = time.perf_counter()
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_FRAME_BYTES:
                self._json(413, {"error": "Frame request must be between 1 byte and 8 MiB"})
                return
            payload = json.loads(self.rfile.read(length))
            decode_started = time.perf_counter()
            image = base64.b64decode(payload["image"])
            frame = cv2.imdecode(np.frombuffer(image, dtype=np.uint8), cv2.IMREAD_COLOR)
            decode_ms = round((time.perf_counter() - decode_started) * 1000, 1)
            if frame is None:
                raise ValueError("Frame could not be decoded")
            camera_id = str(payload.get("cameraId") or "laptop-browser-1")
            event = process_frame(frame, camera_id)
            event["timestamp"] = payload.get("timestamp") or datetime.now(timezone.utc).isoformat()
            event["cameraId"] = camera_id
            event["timings"]["decode_ms"] = decode_ms
            if payload.get("idempotencyKey"):
                event["idempotencyKey"] = str(payload["idempotencyKey"])
            if event.get("format_valid") and event.get("plate") and event.get("status") not in {"NO_VEHICLE", "NO_PLATE", "OCR_FAILED", "OCR_UNCERTAIN", "INVALID_PLATE"}:
                import urllib.error
                import urllib.request
                headers = {"Content-Type": "application/json"}
                if SERVICE_TOKEN:
                    headers["Authorization"] = f"Bearer {SERVICE_TOKEN}"
                request = urllib.request.Request(BACKEND_URL, data=json.dumps(event).encode(), headers=headers)
                persistence_started = time.perf_counter()
                try:
                    with urllib.request.urlopen(request, timeout=15) as backend_response:
                        persisted = json.loads(backend_response.read().decode("utf-8"))
                    event["timings"]["backend_persist_ms"] = round((time.perf_counter() - persistence_started) * 1000, 1)
                    if isinstance(persisted, dict) and (persisted.get("plateNumber") or persisted.get("plate_number") or persisted.get("plate")):
                        event.update(persisted)
                        event["persisted"] = bool(event.get("id"))
                    else:
                        event["persisted"] = bool(persisted.get("duplicate"))
                except Exception as error:
                    event["timings"]["backend_persist_ms"] = round((time.perf_counter() - persistence_started) * 1000, 1)
                    event["persisted"] = False
                    error_body = ""
                    if isinstance(error, urllib.error.HTTPError):
                        try:
                            error_body = error.read().decode("utf-8", errors="replace").strip()
                        except Exception:
                            error_body = ""
                    event["persistence_error"] = f"{error}: {error_body}".strip()
                    print(f"BACKEND POST FAILED: {event['persistence_error']}")
            else:
                event["timings"]["backend_persist_ms"] = 0.0
                event["persisted"] = False
            event["timings"]["request_total_ms"] = round((time.perf_counter() - request_started) * 1000, 1)
            self._json(200, event)
        except Exception as error:
            self._json(400, {"event": "vehicle_detected", "status": "AI_ERROR", "decision": "UNKNOWN", "error": str(error)})

    def log_message(self, format: str, *args: object) -> None:
        if os.getenv("DEBUG", "false").lower() == "true":
            super().log_message(format, *args)


if __name__ == "__main__":
    port = int(os.getenv("LPRS_AI_PORT", "5001"))
    host = os.getenv("LPRS_AI_HOST", "127.0.0.1")
    print(f"Python AI frame service listening on {host}:{port}")
    ThreadingHTTPServer((host, port), FrameHandler).serve_forever()
