from pathlib import Path
import xml.etree.ElementTree as ET


DATASET_PATH = Path("data/dataset/State-wise_OLX/State-wise_OLX")


def convert_xml_to_yolo(xml_path):

    tree = ET.parse(xml_path)
    root = tree.getroot()

    width = int(root.find("size/width").text)
    height = int(root.find("size/height").text)

    yolo_lines = []

    for obj in root.findall("object"):

        # Class 0 = license_plate
        class_id = 0

        box = obj.find("bndbox")

        xmin = float(box.find("xmin").text)
        ymin = float(box.find("ymin").text)
        xmax = float(box.find("xmax").text)
        ymax = float(box.find("ymax").text)

        # Pascal VOC → YOLO
        center_x = ((xmin + xmax) / 2) / width
        center_y = ((ymin + ymax) / 2) / height

        box_width = (xmax - xmin) / width
        box_height = (ymax - ymin) / height

        line = (
            f"{class_id} "
            f"{center_x:.6f} "
            f"{center_y:.6f} "
            f"{box_width:.6f} "
            f"{box_height:.6f}"
        )

        yolo_lines.append(line)

    txt_path = xml_path.with_suffix(".txt")

    with open(txt_path, "w") as file:
        file.write("\n".join(yolo_lines))

    return txt_path


def main():

    print("Starting XML to YOLO conversion...")

    if not DATASET_PATH.exists():
        print("ERROR: Dataset not found!")
        return

    xml_files = list(DATASET_PATH.rglob("*.xml"))

    print(f"Found {len(xml_files)} XML files.")

    successful = 0
    failed = 0

    for xml_file in xml_files:

        try:
            txt_file = convert_xml_to_yolo(xml_file)

            successful += 1

            print(f"[OK] {xml_file.name} -> {txt_file.name}")

        except Exception as e:

            failed += 1

            print(f"[ERROR] {xml_file.name}: {e}")

    print()
    print("================================")
    print("CONVERSION COMPLETED")
    print("================================")
    print(f"Successful: {successful}")
    print(f"Failed:     {failed}")
    print(f"Total:      {len(xml_files)}")


if __name__ == "__main__":
    main()