
from ultralytics import YOLO
import cv2
from pathlib import Path

from ocr import read_plate

from plate_validator import validate_plate


MODEL_PATH = "runs/detect/runs/license_plate/plate_detector/weights/best.pt"

TEST_IMAGES = Path("data/yolo_dataset/images/test")

OUTPUT_DIR = Path("output/ocr_test")


def main():

    print("Loading YOLO model...")

    model = YOLO(MODEL_PATH)

    print("YOLO model loaded.")

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    images = list(TEST_IMAGES.glob("*.jpg"))

    print("Test images:", len(images))

    for image_path in images:

        image = cv2.imread(str(image_path))

        if image is None:
            continue

        results = model.predict(
            image,
            conf=0.25,
            verbose=False
        )

        for result in results:

            boxes = result.boxes

            for box in boxes:

                x1, y1, x2, y2 = map(
                    int,
                    box.xyxy[0]
                )

                confidence = float(
                    box.conf[0]
                )

                # Crop license plate
                plate = image[
                    y1:y2,
                    x1:x2
                ]

                if plate.size == 0:
                    continue

                # OCR
                text, ocr_confidence = read_plate(
                    plate
                )
                validation = validate_plate(text)
                

                print(
                        f"{image_path.name} → "
                        f"{validation['plate']} | "
                        f"State={validation['state']} | "
                        f"Valid={validation['valid']} | "
                        f"OCR={ocr_confidence:.2f}"
                    )

                # Draw detection box
                cv2.rectangle(
                    image,
                    (x1, y1),
                    (x2, y2),
                    (0, 255, 0),
                    2
                )

                label = (
                    f"{text} "
                    f"({ocr_confidence:.2f})"
                )

                cv2.putText(
                    image,
                    label,
                    (x1, max(y1 - 10, 20)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (0, 255, 0),
                    2
                )

                print(
                    f"{image_path.name} → "
                    f"{text} "
                    f"OCR={ocr_confidence:.2f}"
                )

        output_path = OUTPUT_DIR / image_path.name

        cv2.imwrite(
            str(output_path),
            image
        )

    print()
    print("================================")
    print("YOLO + OCR TEST COMPLETED")
    print("================================")

    print("Results saved to:")
    print(OUTPUT_DIR)


if __name__ == "__main__":
    main()