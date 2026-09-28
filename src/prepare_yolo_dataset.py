from pathlib import Path
import shutil
import random


# Original dataset
SOURCE_DIR = Path("data/dataset/State-wise_OLX/State-wise_OLX")

# New YOLO dataset
OUTPUT_DIR = Path("data/yolo_dataset")

# Split percentages
TRAIN_RATIO = 0.70
VAL_RATIO = 0.20
TEST_RATIO = 0.10


def create_folders():

    folders = [
        OUTPUT_DIR / "images" / "train",
        OUTPUT_DIR / "images" / "val",
        OUTPUT_DIR / "images" / "test",

        OUTPUT_DIR / "labels" / "train",
        OUTPUT_DIR / "labels" / "val",
        OUTPUT_DIR / "labels" / "test",
    ]

    for folder in folders:
        folder.mkdir(parents=True, exist_ok=True)


def get_image_label_pairs():

    pairs = []

    # Find all JPG images
    image_files = list(SOURCE_DIR.rglob("*.jpg"))

    for image_path in image_files:

        # Find corresponding TXT file
        label_path = image_path.with_suffix(".txt")

        # Only use images that have YOLO annotations
        if label_path.exists():

            pairs.append((image_path, label_path))

    return pairs


def copy_files(pairs, split):

    image_destination = OUTPUT_DIR / "images" / split
    label_destination = OUTPUT_DIR / "labels" / split

    for image_path, label_path in pairs:

        shutil.copy2(
            image_path,
            image_destination / image_path.name
        )

        shutil.copy2(
            label_path,
            label_destination / label_path.name
        )


def main():

    print("Preparing YOLO dataset...")

    if not SOURCE_DIR.exists():

        print("ERROR: Source dataset not found!")

        return

    create_folders()

    pairs = get_image_label_pairs()

    print(f"Found {len(pairs)} image-label pairs.")

    if len(pairs) == 0:

        print("ERROR: No image-label pairs found!")

        return

    # Randomize dataset
    random.seed(42)
    random.shuffle(pairs)

    total = len(pairs)

    train_end = int(total * TRAIN_RATIO)

    val_end = train_end + int(total * VAL_RATIO)

    train_pairs = pairs[:train_end]
    val_pairs = pairs[train_end:val_end]
    test_pairs = pairs[val_end:]

    print()
    print("Dataset split:")
    print(f"Train: {len(train_pairs)}")
    print(f"Validation: {len(val_pairs)}")
    print(f"Test: {len(test_pairs)}")

    # Copy files
    copy_files(train_pairs, "train")
    copy_files(val_pairs, "val")
    copy_files(test_pairs, "test")

    print()
    print("================================")
    print("DATASET PREPARATION COMPLETED")
    print("================================")


if __name__ == "__main__":
    main()