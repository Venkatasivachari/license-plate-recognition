import argparse
from pathlib import Path

from ultralytics import YOLO

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def parse_args():
    parser = argparse.ArgumentParser(description="Train the license plate detector")
    parser.add_argument("--model", default=str(PROJECT_ROOT / "yolo11n.pt"))
    parser.add_argument("--data", default=str(PROJECT_ROOT / "data" / "yolo_dataset" / "data.yaml"))
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--patience", type=int, default=10)
    parser.add_argument("--device", default=None, help="cpu, 0, or another Ultralytics device value")
    parser.add_argument("--name", default="plate_detector")
    return parser.parse_args()


def validate_dataset(data_path):
    dataset_root = Path(data_path).resolve().parent
    missing = []
    for split in ("train", "val", "test"):
        image_dir = dataset_root / "images" / split
        label_dir = dataset_root / "labels" / split
        image_stems = {path.stem for path in image_dir.glob("*") if path.is_file()}
        label_stems = {path.stem for path in label_dir.glob("*.txt") if path.is_file()}
        missing.extend(f"{split}: missing label for {stem}" for stem in sorted(image_stems - label_stems))
    if missing:
        raise SystemExit("Dataset validation failed:\n" + "\n".join(missing[:20]))


def main():
    args = parse_args()
    validate_dataset(args.data)
    train_options = {
        "data": args.data,
        "epochs": args.epochs,
        "imgsz": args.imgsz,
        "batch": args.batch,
        "patience": args.patience,
        "project": "runs/license_plate",
        "name": args.name,
        "exist_ok": True,
    }
    if args.device:
        train_options["device"] = args.device
    results = YOLO(args.model).train(**train_options)
    print(f"Training completed: {results.save_dir}")


if __name__ == "__main__":
    main()