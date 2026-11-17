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
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--patience", type=int, default=10)
    parser.add_argument("--device", default=None, help="cpu, 0, or another Ultralytics device value")
    parser.add_argument("--name", default="plate_detector")
    parser.add_argument("--resume", action="store_true", help="resume training from --model checkpoint")
    return parser.parse_args()


def validate_dataset(data_path):
    dataset_root = Path(data_path).resolve().parent
    missing = []
    for split in ("train", "val", "test"):
        split_names = ("val", "valid") if split == "val" else (split,)
        directories = (
            (dataset_root / "images" / name, dataset_root / "labels" / name)
            for name in split_names
        )
        directories = list(directories) + [
            (dataset_root / name / "images", dataset_root / name / "labels")
            for name in split_names
        ]
        image_dir, label_dir = next(
            ((images, labels) for images, labels in directories if images.is_dir() and labels.is_dir()),
            (None, None),
        )
        if image_dir is None:
            missing.append(f"{split}: image/label split directories not found under {dataset_root}")
            continue

        image_stems = {
            path.stem
            for path in image_dir.iterdir()
            if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
        }
        label_stems = {path.stem for path in label_dir.glob("*.txt") if path.is_file()}
        if not image_stems:
            missing.append(f"{split}: no images found in {image_dir}")
        missing.extend(f"{split}: missing label for {stem}" for stem in sorted(image_stems - label_stems))
        missing.extend(f"{split}: label has no image for {stem}" for stem in sorted(label_stems - image_stems))
    if missing:
        raise SystemExit("Dataset validation failed:\n" + "\n".join(missing[:20]))


def main():
    args = parse_args()
    validate_dataset(args.data)
    if args.resume:
        results = YOLO(args.model).train(
            resume=True,
            device=args.device or 0,
            workers=args.workers,
        )
        print(f"Training completed: {results.save_dir}")
        return

    train_options = {
        "data": args.data,
        "epochs": args.epochs,
        "imgsz": args.imgsz,
        "batch": args.batch,
        "workers": args.workers,
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