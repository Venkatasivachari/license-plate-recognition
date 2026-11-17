"""Enhanced License Plate OCR Engine.

Supports color-invariant preprocessing (gold, pink, green EV, yellow commercial,
and white-on-black plates) and spatial bounding-box sorting for two-line plates
(motorcycles, scooters, and jeeps).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import List, Tuple

SRC_DIR = Path(__file__).resolve().parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

import cv2
import easyocr
import numpy as np
import torch

from plate_validator import validate_plate

# ============================================================
# EASY OCR READER
# ============================================================

print("Loading EasyOCR...")

reader = easyocr.Reader(
    ["en"],
    gpu=torch.cuda.is_available(),
)

print("EasyOCR loaded.")


# ============================================================
# OCR SETTINGS
# ============================================================

OCR_ALLOWLIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
PLATE_WIDTH = 800
PLATE_HEIGHT = 300
OCR_EARLY_STOP_CONFIDENCE = float(os.getenv("LPRS_OCR_EARLY_STOP", "0.90"))
OCR_VALID_EARLY_STOP_CONFIDENCE = float(os.getenv("LPRS_OCR_VALID_EARLY_STOP", "0.55"))


# ============================================================
# COLOR-INVARIANT IMAGE PREPROCESSING
# ============================================================

def create_variants(image: np.ndarray) -> List[Tuple[str, np.ndarray]]:
    """
    Generate multiple specialized color-space and morphology variants
    to handle gold metallic text, green EV plates, yellow commercial plates,
    embossed acrylic letters, and specular headlight glare.
    """
    variants: List[Tuple[str, np.ndarray]] = []
    if image is None or image.size == 0:
        return variants

    # 1. Base Resize (preserve aspect ratio)
    source_height, source_width = image.shape[:2]
    scale = min(PLATE_WIDTH / max(1, source_width), PLATE_HEIGHT / max(1, source_height))
    resized = cv2.resize(
        image,
        (max(1, round(source_width * scale)), max(1, round(source_height * scale))),
        interpolation=cv2.INTER_CUBIC,
    )
    variants.append(("original", resized))

    # 2. Grayscale
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    variants.append(("gray", gray))

    # 3. CLAHE (Local contrast enhancement for shadow/glare)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    clahe_img = clahe.apply(gray)
    variants.append(("clahe", clahe_img))

    # 4. Standard Otsu Binarization (black on white)
    _, otsu = cv2.threshold(clahe_img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants.append(("otsu", otsu))

    # 5. INVERTED Otsu Binarization (white text on dark: Green EV, Rental Black)
    _, otsu_inv = cv2.threshold(clahe_img, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    variants.append(("otsu_inv", otsu_inv))

    # 6. Morphological Edge Gradient (extracts letter outlines invariant to background color)
    kernel_rect = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    morph_grad = cv2.morphologyEx(clahe_img, cv2.MORPH_GRADIENT, kernel_rect)
    variants.append(("morph_grad", morph_grad))

    # 7. HSV Saturation / Value (isolates gold, pink, neon, and yellow characters)
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    sat = hsv[:, :, 1]
    val = hsv[:, :, 2]
    # Saturated contrast blend
    sat_clahe = clahe.apply(cv2.bitwise_or(sat, val))
    variants.append(("hsv_enhanced", sat_clahe))

    # 8. Adaptive Gaussian Threshold
    adaptive = cv2.adaptiveThreshold(
        clahe_img,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        29,
        9,
    )
    variants.append(("adaptive", adaptive))

    return variants


# ============================================================
# NORMALIZE OCR TEXT
# ============================================================

def normalize_text(text: str | None) -> str:
    """Strip whitespace and punctuation, keeping uppercase alphanumeric only."""
    if not text:
        return ""
    return "".join(c for c in str(text).upper() if c.isalnum())


# ============================================================
# SPATIAL BOUNDING-BOX SORTER (TWO-LINE PLATES SUPPORT)
# ============================================================

def sort_detections_reading_order(raw_results: list) -> Tuple[str, float]:
    """
    Sorts OCR bounding boxes in natural reading order:
    Top-to-Bottom row by row, and Left-to-Right within each row.
    Handles two-line motorcycle, scooter, and jeep plates reliably.
    """
    valid_items = []
    for item in raw_results:
        if len(item) < 3:
            continue
        box, text, prob = item[0], item[1], float(item[2])
        cleaned = normalize_text(text)
        if not cleaned:
            continue

        # Calculate bounding box centroid and height
        pts = np.array(box, dtype=np.float32)
        cx = float(np.mean(pts[:, 0]))
        cy = float(np.mean(pts[:, 1]))
        h = float(np.max(pts[:, 1]) - np.min(pts[:, 1]))
        valid_items.append({"box": box, "text": cleaned, "prob": prob, "cx": cx, "cy": cy, "h": max(h, 10.0)})

    if not valid_items:
        return "", 0.0

    # If only 1 detection, return directly
    if len(valid_items) == 1:
        return valid_items[0]["text"], valid_items[0]["prob"]

    # Calculate average box height for line clustering threshold
    avg_h = sum(item["h"] for item in valid_items) / len(valid_items)
    line_threshold = max(avg_h * 0.6, 15.0)

    # Sort initially by vertical position Y
    valid_items.sort(key=lambda item: item["cy"])

    # Cluster into horizontal lines
    lines: List[List[dict]] = []
    current_line: List[dict] = [valid_items[0]]

    for item in valid_items[1:]:
        if abs(item["cy"] - current_line[0]["cy"]) < line_threshold:
            current_line.append(item)
        else:
            lines.append(current_line)
            current_line = [item]
    lines.append(current_line)

    # Sort each line horizontally by X coordinate (Left to Right)
    ordered_texts: List[str] = []
    confidences: List[float] = []

    for line in lines:
        line.sort(key=lambda item: item["cx"])
        for item in line:
            ordered_texts.append(item["text"])
            confidences.append(item["prob"])

    final_text = "".join(ordered_texts)
    avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
    return final_text, avg_conf


# ============================================================
# RUN OCR ON SINGLE IMAGE
# ============================================================

def run_ocr(image: np.ndarray) -> Tuple[str, float]:
    """Execute EasyOCR with spatial reading-order bounding-box sorting."""
    try:
        results = reader.readtext(
            image,
            detail=1,
            paragraph=False,
            allowlist=OCR_ALLOWLIST,
        )
        return sort_detections_reading_order(results)
    except Exception as e:
        print("EasyOCR execution error:", e)
        return "", 0.0


# ============================================================
# PLATE STYLING & CATEGORY CLASSIFICATION (COLORS & FONTS)
# ============================================================

def analyze_plate_styling(plate: np.ndarray | None, vehicle_type: str = "Vehicle") -> dict:
    """
    Analyzes license plate background color, text color, and layout styling
    to classify vehicles by category:
    - RED: Government / Administration / Governor (Red background, white text)
    - GOLD: VIP / State Dignitary / Custom Metallic (Amber/Gold background/text)
    - GREEN: Electric Vehicles (EV) (Green background, white/yellow text)
    - YELLOW: Commercial / Taxis / Trucks / Transport (Yellow background, black text)
    - BLUE: Diplomatic / Embassy / Consular (Blue background, white text)
    - BLACK: Commercial Self-Drive Rental (Black background, yellow text)
    - WHITE: Standard Private Passenger Vehicle (White background, black text)
    """
    default_style = {
        "category": "PRIVATE",
        "label": "PRIVATE VEHICLE",
        "bg_color": "WHITE",
        "bg_hex": "#FFFFFF",
        "text_hex": "#0F172A",
        "layout": "SINGLE_LINE",
        "vehicle_type": vehicle_type or "Vehicle",
        "is_vip": False,
        "is_hsrp": True,
    }
    if plate is None or plate.size == 0 or plate.shape[0] < 5 or plate.shape[1] < 5:
        return default_style

    h, w = plate.shape[:2]
    aspect_ratio = float(w) / max(1.0, float(h))
    is_two_line = aspect_ratio < 2.05 or str(vehicle_type).lower() in ["motorcycle", "bike", "scooter"]

    # Sample inner 75% of crop to avoid bumper/mounting borders
    pad_y = int(h * 0.12)
    pad_x = int(w * 0.12)
    crop = plate[pad_y:max(pad_y + 1, h - pad_y), pad_x:max(pad_x + 1, w - pad_x)]
    if crop.size == 0:
        crop = plate

    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    hue = hsv[:, :, 0]
    sat = hsv[:, :, 1]
    val = hsv[:, :, 2]
    total_pixels = max(1, crop.shape[0] * crop.shape[1])

    # Masks for Indian plate classification colors
    # 1. Green (EV)
    green_mask = (hue >= 35) & (hue <= 85) & (sat >= 45) & (val >= 40)
    green_ratio = float(np.sum(green_mask)) / total_pixels

    # 2. Yellow (Commercial - Taxi / Truck / Bus)
    yellow_mask = (hue >= 18) & (hue <= 35) & (sat >= 60) & (val >= 85)
    yellow_ratio = float(np.sum(yellow_mask)) / total_pixels

    # 3. Red (Government / Governor / Official)
    red_mask = ((hue <= 10) | (hue >= 170)) & (sat >= 65) & (val >= 55)
    red_ratio = float(np.sum(red_mask)) / total_pixels

    # 4. Blue (Diplomatic - Embassy / Consular / UN)
    blue_mask = (hue >= 95) & (hue <= 130) & (sat >= 60) & (val >= 55)
    blue_ratio = float(np.sum(blue_mask)) / total_pixels

    # 5. Gold / Metallic Amber (VIP / State Dignitary)
    gold_mask = (hue >= 12) & (hue <= 26) & (sat >= 45) & (sat <= 170) & (val >= 140)
    gold_ratio = float(np.sum(gold_mask)) / total_pixels

    # 6. Black (Self-drive rental / Commercial luxury)
    black_mask = (val < 50)
    black_ratio = float(np.sum(black_mask)) / total_pixels

    # Determine highest matching category with minimum threshold
    if red_ratio > 0.22:
        return {
            "category": "GOVERNMENT",
            "label": "GOVERNMENT OFFICIAL",
            "bg_color": "RED",
            "bg_hex": "#DC2626",
            "text_hex": "#FFFFFF",
            "layout": "TWO_LINE" if is_two_line else "SINGLE_LINE",
            "vehicle_type": vehicle_type or "Official Vehicle",
            "is_vip": True,
            "is_hsrp": True,
        }
    if gold_ratio > 0.28:
        return {
            "category": "VIP",
            "label": "VIP / DIGNITARY",
            "bg_color": "GOLD",
            "bg_hex": "#D97706",
            "text_hex": "#FEF3C7",
            "layout": "TWO_LINE" if is_two_line else "SINGLE_LINE",
            "vehicle_type": vehicle_type or "VIP Vehicle",
            "is_vip": True,
            "is_hsrp": True,
        }
    if green_ratio > 0.20:
        return {
            "category": "ELECTRIC",
            "label": "ELECTRIC VEHICLE (EV)",
            "bg_color": "GREEN",
            "bg_hex": "#16A34A",
            "text_hex": "#FFFFFF",
            "layout": "TWO_LINE" if is_two_line else "SINGLE_LINE",
            "vehicle_type": vehicle_type or "EV",
            "is_vip": False,
            "is_hsrp": True,
        }
    if yellow_ratio > 0.22:
        return {
            "category": "COMMERCIAL",
            "label": "COMMERCIAL TRANSPORT",
            "bg_color": "YELLOW",
            "bg_hex": "#EAB308",
            "text_hex": "#0F172A",
            "layout": "TWO_LINE" if is_two_line else "SINGLE_LINE",
            "vehicle_type": vehicle_type or "Commercial",
            "is_vip": False,
            "is_hsrp": True,
        }
    if blue_ratio > 0.22:
        return {
            "category": "DIPLOMATIC",
            "label": "DIPLOMATIC MISSION",
            "bg_color": "BLUE",
            "bg_hex": "#2563EB",
            "text_hex": "#FFFFFF",
            "layout": "TWO_LINE" if is_two_line else "SINGLE_LINE",
            "vehicle_type": vehicle_type or "Diplomatic",
            "is_vip": True,
            "is_hsrp": True,
        }
    if black_ratio > 0.45:
        return {
            "category": "RENTAL",
            "label": "COMMERCIAL RENTAL",
            "bg_color": "BLACK",
            "bg_hex": "#1E293B",
            "text_hex": "#FACC15",
            "layout": "TWO_LINE" if is_two_line else "SINGLE_LINE",
            "vehicle_type": vehicle_type or "Rental",
            "is_vip": False,
            "is_hsrp": True,
        }

    return {
        "category": "PRIVATE",
        "label": "PRIVATE VEHICLE",
        "bg_color": "WHITE",
        "bg_hex": "#FFFFFF",
        "text_hex": "#0F172A",
        "layout": "TWO_LINE" if is_two_line else "SINGLE_LINE",
        "vehicle_type": vehicle_type or "Private",
        "is_vip": False,
        "is_hsrp": True,
    }


# ============================================================
# READ LICENSE PLATE WITH VARIANT EXPLORATION
# ============================================================

def read_plate(plate: np.ndarray | None, max_variants: int | None = None) -> Tuple[str, float]:
    """
    Processes the plate image across multi-channel variants,
    stopping early when an All-India valid plate is identified with high confidence.
    """
    if plate is None or plate.size == 0:
        return "", 0.0

    variants = create_variants(plate)
    if max_variants is not None:
        variants = variants[:max(1, int(max_variants))]

    best_text = ""
    best_confidence = 0.0
    best_is_valid = False

    for name, image in variants:
        text, confidence = run_ocr(image)
        if not text:
            continue

        validation = validate_plate(text)
        is_valid = bool(validation.get("valid"))

        # Prioritize valid Indian license plate formats
        if (is_valid and not best_is_valid) or (is_valid == best_is_valid and confidence > best_confidence):
            best_text = validation.get("plate", text)
            best_confidence = confidence
            best_is_valid = is_valid

        # Early stop if valid plate with sufficient confidence
        if is_valid and confidence >= OCR_VALID_EARLY_STOP_CONFIDENCE:
            break

        # Early stop if exceptionally confident
        if text and confidence >= OCR_EARLY_STOP_CONFIDENCE and len(text) >= 8:
            break

    return best_text, best_confidence