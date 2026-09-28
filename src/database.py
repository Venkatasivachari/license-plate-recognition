from __future__ import annotations

import csv
from pathlib import Path
from typing import Dict, List, Optional


class ResultDatabase:
    """Stores processed vehicle results in CSV format for Phase 1."""

    def __init__(self, output_dir: Optional[str | Path] = None) -> None:
        project_root = Path(__file__).resolve().parent.parent
        self.output_dir = Path(output_dir) if output_dir else project_root / "output" / "results"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.file_path = self.output_dir / "vehicle_results.csv"

        if not self.file_path.exists():
            with open(self.file_path, "w", newline="", encoding="utf-8") as csv_file:
                writer = csv.writer(csv_file)
                writer.writerow(["image_name", "vehicle_class", "plate_text", "status", "confidence"])

    def save_result(self, image_name: str, vehicle_class: str, plate_text: str, status: str, confidence: float) -> Path:
        with open(self.file_path, "a", newline="", encoding="utf-8") as csv_file:
            writer = csv.writer(csv_file)
            writer.writerow([image_name, vehicle_class, plate_text, status, confidence])
        return self.file_path

    def read_results(self) -> List[Dict[str, str]]:
        rows: List[Dict[str, str]] = []
        if not self.file_path.exists():
            return rows

        with open(self.file_path, "r", newline="", encoding="utf-8") as csv_file:
            reader = csv.DictReader(csv_file)
            for row in reader:
                rows.append(row)
        return rows


if __name__ == "__main__":
    db = ResultDatabase()
    db.save_result("sample.jpg", "car", "TN01AB1234", "VALID", 0.92)
    print("Database initialized and sample result saved.")
