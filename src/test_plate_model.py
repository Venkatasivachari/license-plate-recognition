from ultralytics import YOLO
from pathlib import Path
from config import PLATE_MODEL_PATH


TEST_IMAGES = "data/yolo_dataset/images/test"

OUTPUT_DIR = "output/plate_test"


def main():

    print("Loading trained model...")

    model = YOLO(str(PLATE_MODEL_PATH))

    print("Model loaded successfully!")

    results = model.predict(
        source=TEST_IMAGES,
        conf=0.25,
        save=True,
        project=OUTPUT_DIR,
        name="results",
        exist_ok=True
    )

    print("\n================================")
    print("PLATE DETECTION TEST COMPLETED")
    print("================================")

    print("Test images:", len(results))

    print("\nResults saved in:")
    print(f"{OUTPUT_DIR}/results")


if __name__ == "__main__":
    main()