from pathlib import Path

IMAGE_DIRS = [
    Path("data/yolo_dataset/images/train"),
    Path("data/yolo_dataset/images/val"),
    Path("data/yolo_dataset/images/test")
]

LABEL_DIRS = [
    Path("data/yolo_dataset/labels/train"),
    Path("data/yolo_dataset/labels/val"),
    Path("data/yolo_dataset/labels/test")
]


def check_dataset():

    total_images = 0
    total_labels = 0
    missing_labels = 0
    invalid_labels = 0

    for image_dir, label_dir in zip(IMAGE_DIRS, LABEL_DIRS):

        images = list(image_dir.glob("*.jpg"))

        print(f"\nChecking: {image_dir}")
        print(f"Images: {len(images)}")

        total_images += len(images)

        for image in images:

            label = label_dir / f"{image.stem}.txt"

            if not label.exists():

                print(f"[MISSING LABEL] {image.name}")
                missing_labels += 1
                continue

            total_labels += 1

            with open(label, "r") as file:

                lines = file.readlines()

            for line in lines:

                values = line.strip().split()

                if len(values) != 5:

                    print(f"[INVALID] {label}")
                    invalid_labels += 1
                    continue

                try:

                    class_id = int(values[0])
                    x = float(values[1])
                    y = float(values[2])
                    w = float(values[3])
                    h = float(values[4])

                    if class_id != 0:
                        print(f"[INVALID CLASS] {label}")
                        invalid_labels += 1

                    if not (0 <= x <= 1 and
                            0 <= y <= 1 and
                            0 < w <= 1 and
                            0 < h <= 1):

                        print(f"[INVALID COORDINATES] {label}")
                        invalid_labels += 1

                except ValueError:

                    print(f"[INVALID VALUES] {label}")
                    invalid_labels += 1

    print("\n================================")
    print("YOLO DATASET TEST RESULT")
    print("================================")

    print("Total images :", total_images)
    print("Total labels :", total_labels)
    print("Missing labels:", missing_labels)
    print("Invalid labels:", invalid_labels)

    if missing_labels == 0 and invalid_labels == 0:

        print("\n✅ DATASET IS READY FOR YOLO TRAINING")

    else:

        print("\n⚠️ DATASET NEEDS CORRECTION")


if __name__ == "__main__":
    check_dataset()