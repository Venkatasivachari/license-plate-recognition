from pathlib import Path
import xml.etree.ElementTree as ET
import re
from difflib import SequenceMatcher

from ultralytics import YOLO
from ocr import read_plate


MODEL_PATH = (
    "runs/detect/runs/license_plate/"
    "plate_detector/weights/best.pt"
)

TEST_IMAGES = Path(
    "data/yolo_dataset/images/test"
)

ORIGINAL_DATASET = Path(
    "data/dataset/State-wise_OLX/State-wise_OLX"
)


def clean_text(text):
    """Clean OCR or XML plate text."""

    text = text.upper()

    return re.sub(
        r"[^A-Z0-9]",
        "",
        text
    )


def get_ground_truth(image_name):
    """Get actual plate number from XML."""

    xml_name = Path(image_name).with_suffix(".xml").name

    xml_files = list(
        ORIGINAL_DATASET.rglob(xml_name)
    )

    if not xml_files:
        return ""

    try:

        tree = ET.parse(xml_files[0])
        root = tree.getroot()

        obj = root.find("object")

        if obj is None:
            return ""

        plate = obj.find("name")

        if plate is None:
            return ""

        return clean_text(plate.text)

    except Exception:
        return ""


def similarity(actual, predicted):

    if not actual or not predicted:
        return 0.0

    return SequenceMatcher(
        None,
        actual,
        predicted
    ).ratio()


def main():

    print("================================")
    print("FINAL OCR EVALUATION")
    print("================================")

    print("\nLoading YOLO model...")

    model = YOLO(MODEL_PATH)

    print("YOLO model loaded.")

    images = sorted(
        TEST_IMAGES.glob("*.jpg")
    )

    print(
        f"Test images: {len(images)}"
    )

    exact_correct = 0
    evaluated = 0
    total_similarity = 0.0

    print("\nResults:\n")

    for image_path in images:

        actual = get_ground_truth(
            image_path.name
        )

        if not actual:
            print(
                f"{image_path.name} → "
                "Ground truth missing"
            )
            continue

        results = model.predict(
            str(image_path),
            conf=0.25,
            verbose=False
        )

        best_prediction = ""
        best_confidence = 0.0

        for result in results:

            for box in result.boxes:

                x1, y1, x2, y2 = map(
                    int,
                    box.xyxy[0]
                )

                confidence = float(
                    box.conf[0]
                )

                image = result.orig_img

                plate = image[
                    y1:y2,
                    x1:x2
                ]

                if plate.size == 0:
                    continue

                text, ocr_confidence = read_plate(
                    plate
                )

                if ocr_confidence > best_confidence:

                    best_prediction = clean_text(
                        text
                    )

                    best_confidence = (
                        ocr_confidence
                    )

        score = similarity(
            actual,
            best_prediction
        )

        evaluated += 1
        total_similarity += score

        if actual == best_prediction:
            exact_correct += 1
            status = "CORRECT"
        else:
            status = "WRONG"

        print(
            f"{image_path.name}: "
            f"Actual={actual} | "
            f"OCR={best_prediction} | "
            f"Similarity={score:.2f} | "
            f"{status}"
        )

    print("\n================================")
    print("FINAL RESULTS")
    print("================================")

    print(
        f"Evaluated images: {evaluated}"
    )

    print(
        f"Exact matches: {exact_correct}"
    )

    if evaluated > 0:

        exact_accuracy = (
            exact_correct / evaluated
        ) * 100

        average_similarity = (
            total_similarity / evaluated
        ) * 100

        print(
            f"Exact OCR Accuracy: "
            f"{exact_accuracy:.2f}%"
        )

        print(
            f"Average Character Similarity: "
            f"{average_similarity:.2f}%"
        )

    else:

        print("No images evaluated.")


if __name__ == "__main__":
    main()
    