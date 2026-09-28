from pathlib import Path
import cv2


IMAGE_DIR = Path("data/yolo_dataset/images/train")
LABEL_DIR = Path("data/yolo_dataset/labels/train")

WINDOW_NAME = "License Plate Annotation Review"

drawing = False
start_point = None
end_point = None
new_box = None


def mouse_callback(event, x, y, flags, param):
    global drawing, start_point, end_point, new_box

    if event == cv2.EVENT_LBUTTONDOWN:
        drawing = True
        start_point = (x, y)
        end_point = (x, y)

    elif event == cv2.EVENT_MOUSEMOVE and drawing:
        end_point = (x, y)

    elif event == cv2.EVENT_LBUTTONUP:
        drawing = False
        end_point = (x, y)

        x1 = min(start_point[0], end_point[0])
        y1 = min(start_point[1], end_point[1])
        x2 = max(start_point[0], end_point[0])
        y2 = max(start_point[1], end_point[1])

        new_box = (x1, y1, x2, y2)


def yolo_to_pixel(values, width, height):

    _, cx, cy, box_width, box_height = values

    cx *= width
    cy *= height
    box_width *= width
    box_height *= height

    x1 = int(cx - box_width / 2)
    y1 = int(cy - box_height / 2)
    x2 = int(cx + box_width / 2)
    y2 = int(cy + box_height / 2)

    return x1, y1, x2, y2


def pixel_to_yolo(box, width, height):

    x1, y1, x2, y2 = box

    center_x = ((x1 + x2) / 2) / width
    center_y = ((y1 + y2) / 2) / height

    box_width = (x2 - x1) / width
    box_height = (y2 - y1) / height

    return (
        0,
        center_x,
        center_y,
        box_width,
        box_height
    )


def read_label(label_path):

    if not label_path.exists():
        return None

    with open(label_path, "r") as file:
        line = file.readline().strip()

    if not line:
        return None

    values = list(map(float, line.split()))

    if len(values) != 5:
        return None

    return values


def save_label(label_path, box, width, height):

    values = pixel_to_yolo(box, width, height)

    class_id, cx, cy, bw, bh = values

    with open(label_path, "w") as file:

        file.write(
            f"{int(class_id)} "
            f"{cx:.6f} "
            f"{cy:.6f} "
            f"{bw:.6f} "
            f"{bh:.6f}\n"
        )


def main():

    global new_box

    images = sorted(IMAGE_DIR.glob("*.jpg"))

    print("Images found:", len(images))

    if not images:
        print("No images found!")
        return

    cv2.namedWindow(WINDOW_NAME)
    cv2.setMouseCallback(WINDOW_NAME, mouse_callback)

    for index, image_path in enumerate(images, start=1):

        label_path = LABEL_DIR / f"{image_path.stem}.txt"

        image = cv2.imread(str(image_path))

        if image is None:
            print("Cannot read:", image_path.name)
            continue

        height, width = image.shape[:2]

        label = read_label(label_path)

        new_box = None

        while True:

            display = image.copy()

            # Draw existing annotation
            if label is not None:

                old_box = yolo_to_pixel(
                    label,
                    width,
                    height
                )

                x1, y1, x2, y2 = old_box

                cv2.rectangle(
                    display,
                    (x1, y1),
                    (x2, y2),
                    (0, 255, 0),
                    2
                )

                cv2.putText(
                    display,
                    "Existing box",
                    (x1, max(y1 - 10, 20)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (0, 255, 0),
                    1
                )

            # Draw new box while selecting
            if new_box is not None:

                x1, y1, x2, y2 = new_box

                cv2.rectangle(
                    display,
                    (x1, y1),
                    (x2, y2),
                    (0, 0, 255),
                    2
                )

            cv2.putText(
                display,
                f"{index}/{len(images)}  {image_path.name}",
                (10, 25),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (255, 255, 255),
                2
            )

            cv2.putText(
                display,
                "C=correct  R=redraw  S=skip  Q=quit",
                (10, height - 15),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (255, 255, 255),
                1
            )

            cv2.imshow(WINDOW_NAME, display)

            key = cv2.waitKey(30) & 0xFF

            # Correct annotation
            if key == ord("c"):

                print(f"[CORRECT] {image_path.name}")
                break

            # Redraw annotation
            elif key == ord("r"):

                print(f"Draw new box around plate: {image_path.name}")

                new_box = None

                while new_box is None:

                    display = image.copy()

                    cv2.putText(
                        display,
                        "CLICK + DRAG around license plate",
                        (10, 25),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.6,
                        (0, 255, 255),
                        2
                    )

                    cv2.imshow(WINDOW_NAME, display)

                    cv2.waitKey(30)

                save_label(
                    label_path,
                    new_box,
                    width,
                    height
                )

                print(f"[FIXED] {image_path.name}")

                label = read_label(label_path)

                new_box = None

                break

            # Skip
            elif key == ord("s"):

                print(f"[SKIPPED] {image_path.name}")
                break

            # Quit
            elif key == ord("q"):

                print("Review stopped.")
                cv2.destroyAllWindows()
                return

    cv2.destroyAllWindows()

    print()
    print("================================")
    print("ANNOTATION REVIEW COMPLETED")
    print("================================")


if __name__ == "__main__":
    main()