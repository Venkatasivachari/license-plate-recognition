from __future__ import annotations

from pathlib import Path
from typing import List, Optional, Tuple

import cv2
import numpy as np
from ultralytics import YOLO

from config import PLATE_CONFIDENCE_THRESHOLD, PLATE_INFERENCE_SIZE, PLATE_MODEL_PATH


class PlateDetector:
    """Detects license plate regions in a vehicle image."""

    def __init__(self, model_path: Optional[str | Path] = None) -> None:
        self.project_root = Path(__file__).resolve().parent.parent
        self.model_path = Path(model_path) if model_path else PLATE_MODEL_PATH
        self.model = YOLO(str(self.model_path)) if self.model_path.is_file() else None

    def detect_plate_candidates(self, vehicle_image: np.ndarray) -> List[Tuple[int, int, int, int]]:
        if self.model is not None:
            results = self.model.predict(vehicle_image, conf=PLATE_CONFIDENCE_THRESHOLD, imgsz=PLATE_INFERENCE_SIZE, verbose=False)
            detections = []
            for result in results:
                for box in result.boxes:
                    coordinates = tuple(map(int, box.xyxy[0].tolist()))
                    detections.append((coordinates, float(box.conf[0])))
            if detections:
                detections.sort(key=lambda detection: detection[1], reverse=True)
                return [box for box, _ in detections[:5]]

        gray = cv2.cvtColor(vehicle_image, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blur, 50, 150)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        candidates: List[Tuple[int, int, int, int]] = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            aspect_ratio = w / float(h)
            area = w * h

            if area < 500:
                continue

            if 1.5 <= aspect_ratio <= 6.0:
                candidates.append((x, y, x + w, y + h))

        candidates.sort(key=lambda box: (box[2] - box[0]) * (box[3] - box[1]), reverse=True)
        return candidates[:5]

    def detect(self, vehicle_image: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
        candidates = self.detect_plate_candidates(vehicle_image)
        if not candidates:
            return None
        return candidates[0]

    def crop_plate(self, vehicle_image: np.ndarray, bbox: Tuple[int, int, int, int]) -> np.ndarray:
        x1, y1, x2, y2 = bbox
        return vehicle_image[y1:y2, x1:x2]


if __name__ == "__main__":
    print("PlateDetector initialized successfully.")
