from __future__ import annotations

from pathlib import Path
from typing import List, Optional

import cv2
import numpy as np
from ultralytics import YOLO

from config import TRACKING_ENABLED, VEHICLE_TRACKER


class VehicleDetector:
    """Detects vehicles in frames using a YOLO model."""

    def __init__(self, model_path: Optional[str] = None) -> None:
        project_root = Path(__file__).resolve().parent.parent
        bundled_model = project_root / "yolo11n.pt"
        default_model = project_root / "models" / "yolov8n.pt"
        if not default_model.exists() and bundled_model.exists():
            default_model = bundled_model
        self.model = YOLO(str(model_path) if model_path else str(default_model))

    def detect(self, image: np.ndarray, conf_threshold: float = 0.25) -> List[dict]:
        if TRACKING_ENABLED:
            results = self.model.track(image, conf=conf_threshold, tracker=VEHICLE_TRACKER, persist=True, verbose=False)
        else:
            results = self.model(image, conf=conf_threshold, verbose=False)
        detections: List[dict] = []

        for result in results:
            for box in result.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                conf = float(box.conf[0])
                cls_id = int(box.cls[0])
                class_name = result.names.get(cls_id, "vehicle")
                track_id = int(box.id[0]) if box.id is not None else None

                if class_name.lower() in {"car", "motorcycle", "bus", "truck", "bicycle"}:
                    detections.append(
                        {
                            "bbox": (x1, y1, x2, y2),
                            "confidence": conf,
                            "class_name": class_name,
                            "track_id": track_id,
                        }
                    )

        return detections

    def crop_vehicle(self, image: np.ndarray, bbox: tuple[int, int, int, int]) -> np.ndarray:
        x1, y1, x2, y2 = bbox
        return image[y1:y2, x1:x2]


if __name__ == "__main__":
    if not (Path(__file__).resolve().parent.parent / "models" / "yolov8n.pt").exists():
        print("YOLO model file is not present yet. The project will download it on first use if available.")
    detector = VehicleDetector()
    print("VehicleDetector initialized successfully.")
