from __future__ import annotations

from pathlib import Path
from typing import List, Optional, Tuple

import cv2
import numpy as np


class PlateDetector:
    """Detects license plate regions in a vehicle image."""

    def __init__(self) -> None:
        self.project_root = Path(__file__).resolve().parent.parent

    def detect_plate_candidates(self, vehicle_image: np.ndarray) -> List[Tuple[int, int, int, int]]:
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
