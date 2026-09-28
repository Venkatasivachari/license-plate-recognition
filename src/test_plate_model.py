from ultralytics import YOLO
from pathlib import Path


# MODEL_PATH = "runs/license_plate/plate_detector/weights/best.pt"
MODEL_PATH = "runs/detect/runs/license_plate/plate_detector/weights/best.pt"
TEST_IMAGES = "data/yolo_dataset/images/test"

OUTPUT_DIR = "output/plate_test"


def main():

    print("Loading trained model...")

    model = YOLO(MODEL_PATH)

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