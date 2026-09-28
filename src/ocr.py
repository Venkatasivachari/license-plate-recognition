import cv2
import easyocr
import numpy as np
import os


# ============================================================
# EASY OCR READER
# ============================================================

print("Loading EasyOCR...")

reader = easyocr.Reader(
    ["en"],
    gpu=False
)

print("EasyOCR loaded.")


# ============================================================
# OCR SETTINGS
# ============================================================

OCR_ALLOWLIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

PLATE_WIDTH = 800

PLATE_HEIGHT = 300
OCR_EARLY_STOP_CONFIDENCE = float(os.getenv("LPRS_OCR_EARLY_STOP", "0.88"))


# ============================================================
# IMAGE PREPROCESSING
# ============================================================

def create_variants(image):
    """
    Create several preprocessing versions of the
    detected license plate.
    """

    variants = []

    if image is None or image.size == 0:
        return variants


    # --------------------------------------------------------
    # Resize
    # --------------------------------------------------------

    resized = cv2.resize(
        image,
        (PLATE_WIDTH, PLATE_HEIGHT),
        interpolation=cv2.INTER_CUBIC
    )

    variants.append(
        ("original", resized)
    )


    # --------------------------------------------------------
    # Grayscale
    # --------------------------------------------------------

    gray = cv2.cvtColor(
        resized,
        cv2.COLOR_BGR2GRAY
    )

    variants.append(
        ("gray", gray)
    )


    # --------------------------------------------------------
    # CLAHE
    # --------------------------------------------------------

    clahe = cv2.createCLAHE(
        clipLimit=2.0,
        tileGridSize=(8, 8)
    )

    clahe_image = clahe.apply(
        gray
    )

    variants.append(
        ("clahe", clahe_image)
    )


    # --------------------------------------------------------
    # OTSU threshold
    # --------------------------------------------------------

    _, otsu = cv2.threshold(
        gray,
        0,
        255,
        cv2.THRESH_BINARY
        + cv2.THRESH_OTSU
    )

    variants.append(
        ("otsu", otsu)
    )


    # --------------------------------------------------------
    # Adaptive threshold
    # --------------------------------------------------------

    adaptive = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        11
    )

    variants.append(
        ("adaptive", adaptive)
    )


    # --------------------------------------------------------
    # Sharpen
    # --------------------------------------------------------

    kernel = np.array([
        [0, -1, 0],
        [-1, 5, -1],
        [0, -1, 0]
    ])

    sharpened = cv2.filter2D(
        gray,
        -1,
        kernel
    )

    variants.append(
        ("sharpened", sharpened)
    )


    return variants


# ============================================================
# NORMALIZE OCR TEXT
# ============================================================

def normalize_text(text):

    if not text:
        return ""

    text = text.upper()

    cleaned = ""

    for char in text:

        if char.isalnum():

            cleaned += char

    return cleaned


# ============================================================
# RUN OCR ON ONE IMAGE
# ============================================================

def run_ocr(image):

    try:

        results = reader.readtext(
            image,
            detail=1,
            paragraph=False,
            allowlist=OCR_ALLOWLIST
        )

    except Exception as e:

        print(
            "EasyOCR error:",
            e
        )

        return "", 0.0


    if not results:

        return "", 0.0


    texts = []

    confidences = []


    for item in results:

        if len(item) < 3:
            continue

        text = item[1]

        confidence = float(
            item[2]
        )

        cleaned = normalize_text(
            text
        )

        if cleaned:

            texts.append(
                cleaned
            )

            confidences.append(
                confidence
            )


    if not texts:

        return "", 0.0


    # Join detected pieces

    final_text = "".join(
        texts
    )


    # Average confidence

    confidence = sum(
        confidences
    ) / len(
        confidences
    )


    return (
        final_text,
        confidence
    )


# ============================================================
# READ LICENSE PLATE
# ============================================================

def read_plate(plate):

    if plate is None:

        return "", 0.0


    if plate.size == 0:

        return "", 0.0


    variants = create_variants(
        plate
    )


    best_text = ""

    best_confidence = 0.0


    for name, image in variants:

        text, confidence = run_ocr(
            image
        )


        print(
            f"    OCR variant={name:<10} "
            f"text={text:<20} "
            f"confidence={confidence:.2f}"
        )


        if confidence > best_confidence:

            best_text = text

            best_confidence = confidence

        if text and confidence >= OCR_EARLY_STOP_CONFIDENCE and len(text) >= 6:
            break


    return (
        best_text,
        best_confidence
    )