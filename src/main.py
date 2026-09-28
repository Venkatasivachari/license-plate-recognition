from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np

from camera import Camera
from database import ResultDatabase
from ocr import read_plate
from plate_detection import PlateDetector
from plate_validator import validate_plate
from vehicle_detection import VehicleDetector


def process_single_image(image_path: str | Path) -> dict:
    image_path = Path(image_path)
    frame = Camera.load_image(image_path)

    detector = VehicleDetector()
    detections = detector.detect(frame)
    if not detections:
        return {
            "image_name": image_path.name,
            "vehicle_class": "NONE",
            "plate_text": "",
            "status": "NO_VEHICLE",
            "confidence": 0.0,
        }

    best = max(detections, key=lambda item: item["confidence"])
    vehicle_crop = detector.crop_vehicle(frame, best["bbox"])

    plate_detector = PlateDetector()
    plate_bbox = plate_detector.detect(vehicle_crop)
    if plate_bbox is None:
        return {
            "image_name": image_path.name,
            "vehicle_class": best["class_name"],
            "plate_text": "",
            "status": "NO_PLATE",
            "confidence": best["confidence"],
        }

    plate_crop = plate_detector.crop_plate(vehicle_crop, plate_bbox)
    plate_text, _ = read_plate(plate_crop)
    validation = validate_plate(plate_text)

    result = {
        "image_name": image_path.name,
        "vehicle_class": best["class_name"],
        "plate_text": validation["plate"] if plate_text else "",
        "status": "VALID" if validation["valid"] else "INVALID",
        "confidence": float(best["confidence"]),
    }

    output_dir = Path(__file__).resolve().parent.parent / "output" / "detected"
    output_dir.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_dir / f"{image_path.stem}_vehicle.jpg"), vehicle_crop)
    cv2.imwrite(str(output_dir / f"{image_path.stem}_plate.jpg"), plate_crop)

    db = ResultDatabase()
    db.save_result(
        image_name=result["image_name"],
        vehicle_class=result["vehicle_class"],
        plate_text=result["plate_text"],
        status=result["status"],
        confidence=result["confidence"],
    )

    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Autonomous Vehicle Analytics")
    parser.add_argument("--image", type=str, help="Path to an image file to analyze")
    parser.add_argument("--camera", type=int, default=None, help="Camera index for live video feed")
    args = parser.parse_args()

    if args.image:
        result = process_single_image(args.image)
        print(result)
        return

    if args.camera is not None:
        camera = Camera(source=args.camera)
        if not camera.open():
            print(f"Failed to open camera {args.camera}")
            return

        while True:
            frame = camera.read_frame()
            if frame is None:
                break
            cv2.imshow("Vehicle Analytics", frame)
            if cv2.waitKey(1) & 0xFF == 27:
                break

        camera.release()
        cv2.destroyAllWindows()
        return

    print("Please pass --image <path> or --camera <index>.")


if __name__ == "__main__":
    main()
