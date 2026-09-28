"""Central runtime configuration for the live LPRS application."""

import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = Path(os.getenv(
    "LPRS_MODEL_PATH",
    str(PROJECT_ROOT / "runs" / "detect" / "runs" / "license_plate" / "plate_detector" / "weights" / "best.pt"),
))
CAMERA_INDEX = int(os.getenv("LPRS_CAMERA_INDEX", "0"))
SERIAL_PORT = os.getenv("LPRS_SERIAL_PORT", "COM6")
BAUD_RATE = int(os.getenv("LPRS_BAUD_RATE", "9600"))
YOLO_CONFIDENCE_THRESHOLD = float(os.getenv("LPRS_YOLO_CONFIDENCE", "0.25"))
OCR_CONFIDENCE_THRESHOLD = float(os.getenv("LPRS_OCR_CONFIDENCE", "0.30"))
BUZZER_DURATION_SECONDS = float(os.getenv("LPRS_BUZZER_SECONDS", "5"))
VEHICLE_RESET_DELAY_SECONDS = float(os.getenv("LPRS_RESET_DELAY", "2"))
OCR_FRAME_COUNT = int(os.getenv("LPRS_OCR_FRAME_COUNT", "5"))
AUTHORIZED_PLATES = frozenset(
    value.strip().upper()
    for value in os.getenv("LPRS_AUTHORIZED_PLATES", "AP12A1234,AP27AB1234,AP16CD5678,AP09EF2468,AP39GH1357").split(",")
    if value.strip()
)
UNAUTHORIZED_PLATES = frozenset(
    value.strip().upper()
    for value in os.getenv("LPRS_UNAUTHORIZED_PLATES", "AP99ZZ9999,AP21KL4321,AP05MN7890,AP28PQ2468,AP40RS1357").split(",")
    if value.strip()
)
LOG_DIR = PROJECT_ROOT / "logs"