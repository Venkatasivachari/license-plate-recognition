from __future__ import annotations

from pathlib import Path
from typing import Optional, Union

import cv2
import numpy as np


class Camera:
    """Handles camera input and simple frame saving for the project."""

    def __init__(
        self,
        source: Union[int, str] = 0,
        output_dir: Optional[Union[str, Path]] = None,
    ) -> None:
        project_root = Path(__file__).resolve().parent.parent
        self.output_dir = Path(output_dir) if output_dir else project_root / "output" / "detected"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.source = source
        self.capture = cv2.VideoCapture(source)

    def open(self) -> bool:
        return self.capture.isOpened()

    def read_frame(self) -> Optional[np.ndarray]:
        success, frame = self.capture.read()
        if not success:
            return None
        return frame

    def save_frame(self, frame: np.ndarray, file_name: str) -> Path:
        file_path = self.output_dir / file_name
        cv2.imwrite(str(file_path), frame)
        return file_path

    def release(self) -> None:
        self.capture.release()

    @staticmethod
    def load_image(image_path: Union[str, Path]) -> np.ndarray:
        image = cv2.imread(str(image_path))
        if image is None:
            raise FileNotFoundError(f"Image was not found or could not be read: {image_path}")
        return image

    @staticmethod
    def resize_image(frame: np.ndarray, width: int = 1280) -> np.ndarray:
        height = int(frame.shape[0] * width / frame.shape[1])
        return cv2.resize(frame, (width, height), interpolation=cv2.INTER_AREA)


if __name__ == "__main__":
    camera = Camera(source=0)
    if camera.open():
        frame = camera.read_frame()
        if frame is not None:
            camera.save_frame(frame, "camera_test.jpg")
    camera.release()
