"""One-row-per-vehicle event logging for the live pipeline."""

import csv
from datetime import datetime
from pathlib import Path


class VehicleEventLogger:
    fields = [
        "timestamp", "plate", "raw_ocr", "confidence", "consensus",
        "state", "decision", "buzzer_action", "processing_ms",
    ]

    def __init__(self, log_dir: Path):
        self.log_dir = log_dir
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.path = log_dir / "vehicle_events.csv"
        if not self.path.exists():
            with self.path.open("w", newline="", encoding="utf-8") as file:
                csv.DictWriter(file, fieldnames=self.fields).writeheader()

    def record(self, **event):
        row = {field: event.get(field, "") for field in self.fields}
        row["timestamp"] = row["timestamp"] or datetime.now().isoformat(timespec="seconds")
        try:
            with self.path.open("a", newline="", encoding="utf-8") as file:
                csv.DictWriter(file, fieldnames=self.fields).writerow(row)
        except OSError as error:
            print(f"LOGGING ERROR: {error}")