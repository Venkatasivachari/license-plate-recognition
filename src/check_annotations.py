from pathlib import Path
import cv2


IMAGE_DIR = Path("data/yolo_dataset/images/train")
LABEL_DIR = Path("data/yolo_dataset/labels/train")


def draw_annotations(image_path):

    label_path = LABEL_DIR / (image_path.stem + ".txt")

    image = cv2.imread(str(image_path))

    if image is None:
        print("Could not read:", image_path)
        return

    height, width = image.shape[:2]

    if not label_path.exists():
        print("Label not found:", label_path)
        return

    with open(label_path, "r") as file:
        lines = file.readlines()

    for line in lines:

        values = line.strip().split()

        if len(values) != 5:
            continue

        class_id, center_x, center_y, box_width, box_height = map(
            float, values
        )

        # YOLO normalized coordinates → pixel coordinates
        center_x *= width
        center_y *= height
        box_width *= width
        box_height *= height

        x1 = int(center_x - box_width / 2)
        y1 = int(center_y - box_height / 2)
        x2 = int(center_x + box_width / 2)
        y2 = int(center_y + box_height / 2)

        cv2.rectangle(
            image,
            (x1, y1),
            (x2, y2),
            (0, 255, 0),
            2
        )

        cv2.putText(
            image,
            "license_plate",
            (x1, max(y1 - 10, 20)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 0),
            2
        )

    cv2.imshow("YOLO Annotation Check", image)

    key = cv2.waitKey(0)

    if key == ord("q"):
        cv2.destroyAllWindows()


def main():

    images = list(IMAGE_DIR.glob("*.jpg"))

    print("Images found:", len(images))

    if not images:
        print("No images found!")
        return

    # Check first 5 images
    for image_path in images[:5]:

        print("Checking:", image_path.name)

        draw_annotations(image_path)

    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()