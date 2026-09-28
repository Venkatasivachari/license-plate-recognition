from pathlib import Path
import xml.etree.ElementTree as ET
import re
from difflib import SequenceMatcher


# Original dataset containing XML files
DATASET_PATH = Path(
    "data/dataset/State-wise_OLX/State-wise_OLX"
)


def clean_text(text):
    """
    Convert text into a comparable format.
    """

    text = text.upper()

    text = re.sub(
        r"[^A-Z0-9]",
        "",
        text
    )

    return text


def get_ground_truth(image_name):
    """
    Find the XML file for an image
    and extract the actual plate number.
    """

    xml_files = list(
        DATASET_PATH.rglob(
            Path(image_name).with_suffix(".xml").name
        )
    )

    if not xml_files:
        return None

    xml_path = xml_files[0]

    try:

        tree = ET.parse(xml_path)

        root = tree.getroot()

        obj = root.find("object")

        if obj is None:
            return None

        plate_number = obj.find("name").text

        return clean_text(plate_number)

    except Exception:
        return None


def similarity(actual, predicted):

    if not actual or not predicted:
        return 0.0

    return SequenceMatcher(
        None,
        actual,
        predicted
    ).ratio()


def main():

    print("OCR evaluation started...")

    print(
        f"Dataset: {DATASET_PATH}"
    )

    print()

    # IMPORTANT:
    # We will use OCR result files later.
    # For now, this checks the ground-truth
    # XML structure.

    image_files = list(
        Path("data/yolo_dataset/images/test")
        .glob("*.jpg")
    )

    print(
        f"Test images found: {len(image_files)}"
    )

    total = 0

    found = 0

    for image_path in image_files:

        actual = get_ground_truth(
            image_path.name
        )

        total += 1

        if actual:

            found += 1

            print(
                f"{image_path.name} → "
                f"Actual plate: {actual}"
            )

    print()

    print("================================")
    print("GROUND TRUTH CHECK")
    print("================================")

    print(
        f"Test images: {total}"
    )

    print(
        f"XML ground truth found: {found}"
    )

    print(
        f"Missing ground truth: {total - found}"
    )


if __name__ == "__main__":
    main()