from ultralytics import YOLO
import cv2
from pathlib import Path


MODEL_PATH = (
    "runs/detect/runs/license_plate/"
    "plate_detector/weights/best.pt"
)

TEST_IMAGES = Path(
    "data/yolo_dataset/images/test"
)

OUTPUT_DIR = Path(
    "output/plate_crops"
)


def main():

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    model = YOLO(MODEL_PATH)

    images = list(
        TEST_IMAGES.glob("*.jpg")
    )

    print("Images:", len(images))

    count = 0

    for image_path in images:

        image = cv2.imread(
            str(image_path)
        )

        if image is None:
            continue

        results = model.predict(
            image,
            conf=0.25,
            verbose=False
        )

        for result in results:

            for i, box in enumerate(
                result.boxes
            ):

                x1, y1, x2, y2 = map(
                    int,
                    box.xyxy[0]
                )

                plate = image[
                    max(0, y1):y2,
                    max(0, x1):x2
                ]

                if plate.size == 0:
                    continue

                # Add a little padding
                h, w = plate.shape[:2]

                plate = cv2.copyMakeBorder(
                    plate,
                    int(h * 0.15),
                    int(h * 0.15),
                    int(w * 0.15),
                    int(w * 0.15),
                    cv2.BORDER_CONSTANT,
                    value=(255, 255, 255)
                )

                output_name = (
                    f"{image_path.stem}_plate_{i}.jpg"
                )

                cv2.imwrite(
                    str(
                        OUTPUT_DIR / output_name
                    ),
                    plate
                )

                count += 1

    print()
    print("================================")
    print("PLATE CROP EXTRACTION COMPLETED")
    print("================================")

    print("Crops created:", count)

    print("Saved to:")
    print(OUTPUT_DIR)


if __name__ == "__main__":
    main()