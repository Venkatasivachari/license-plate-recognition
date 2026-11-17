"""Comprehensive Indian License Plate Validator and Disambiguation Engine.

Supports all 28 Indian States, 8 Union Territories, Bharat Series (BH),
and common positional OCR character confusion (e.g. O vs 0, I vs 1, B vs 8).
"""
from __future__ import annotations

import re
from typing import Any, Dict

# Complete list of Indian State and Union Territory codes
INDIAN_STATES: Dict[str, str] = {
    # 28 States
    "AP": "Andhra Pradesh",
    "AR": "Arunachal Pradesh",
    "AS": "Assam",
    "BR": "Bihar",
    "CG": "Chhattisgarh",
    "GA": "Goa",
    "GJ": "Gujarat",
    "HR": "Haryana",
    "HP": "Himachal Pradesh",
    "JH": "Jharkhand",
    "KA": "Karnataka",
    "KL": "Kerala",
    "MP": "Madhya Pradesh",
    "MH": "Maharashtra",
    "MN": "Manipur",
    "ML": "Meghalaya",
    "MZ": "Mizoram",
    "NL": "Nagaland",
    "OD": "Odisha",
    "PB": "Punjab",
    "RJ": "Rajasthan",
    "SK": "Sikkim",
    "TN": "Tamil Nadu",
    "TS": "Telangana",
    "TR": "Tripura",
    "UP": "Uttar Pradesh",
    "UK": "Uttarakhand",
    "UA": "Uttarakhand (Legacy)",
    "WB": "West Bengal",
    # 8 Union Territories
    "AN": "Andaman and Nicobar Islands",
    "CH": "Chandigarh",
    "DN": "Dadra and Nagar Haveli",
    "DD": "Daman and Diu",
    "DL": "Delhi",
    "JK": "Jammu and Kashmir",
    "LA": "Ladakh",
    "LD": "Lakshadweep",
    "PY": "Puducherry",
    # All-India Defense / Central
    "BH": "Bharat Series (All-India)",
}

# Backward compatibility alias
ALLOWED_STATES = INDIAN_STATES

# Positional substitution maps
LETTER_TO_NUMBER: Dict[str, str] = {
    "O": "0", "D": "0", "Q": "0",
    "I": "1", "L": "1", "|": "1", "J": "1",
    "Z": "2",
    "E": "3",
    "A": "4",
    "S": "5",
    "G": "6", "C": "6",
    "T": "7", "Y": "7",
    "B": "8",
    "P": "9", "g": "9", "q": "9",
}

NUMBER_TO_LETTER: Dict[str, str] = {
    "0": "O",
    "1": "I",
    "2": "Z",
    "3": "E",
    "4": "A",
    "5": "S",
    "6": "G",
    "7": "T",
    "8": "B",
    "9": "P",
}

# Common state code OCR misreads
STATE_CORRECTIONS: Dict[str, str] = {
    "A8": "AP", "A0": "AP", "4P": "AP", "48": "AP",
    "T5": "TS", "T8": "TS", "7S": "TS", "75": "TS",
    "7N": "TN", "1N": "TN",
    "K4": "KA", "I<": "KA", "1<": "KA", "K4": "KA",
    "D1": "DL", "0L": "DL", "OL": "DL",
    "M8": "MH", "NH": "MH", "M4": "MH",
    "G1": "GJ", "6J": "GJ", "0J": "GJ",
    "U9": "UP", "0P": "UP", "OP": "UP", "U8": "UP",
    "U|<": "UK", "0K": "UK",
    "H12": "HR", "H1": "HR", "4R": "HR",
    "K1": "KL", "K2": "KL",
    "P8": "PB", "P3": "PB",
    "R1": "RJ", "2J": "RJ",
    "W8": "WB", "W3": "WB",
    "8H": "BH", "B4": "BH", "84": "BH",
}


def clean_text(text: str | None) -> str:
    """Normalize input string to uppercase alphanumeric characters only."""
    if not text:
        return ""
    text = str(text).upper()
    return re.sub(r"[^A-Z0-9]", "", text)


def correct_character_position(char: str, expected_type: str) -> str:
    """Swap character using OCR confusion matrix based on positional context."""
    if not char:
        return ""
    if expected_type == "letter":
        return NUMBER_TO_LETTER.get(char, char) if char.isdigit() else char
    if expected_type == "number":
        return LETTER_TO_NUMBER.get(char, char) if char.isalpha() else char
    return char


def correct_plate(text: str) -> str:
    """Intelligently corrects positional OCR errors in standard & BH Indian plates."""
    cleaned = clean_text(text)
    if len(cleaned) < 5:
        return cleaned

    # Check for Bharat Series (YY BH #### XX)
    # Starts with 2 digits or potential digits, followed by BH
    bh_match = re.match(r"^([A-Z0-9]{2})(BH|8H|B4|84)([A-Z0-9]{4,6})$", cleaned)
    if bh_match:
        year_part = "".join(correct_character_position(c, "number") for c in bh_match.group(1))
        tail = bh_match.group(3)
        num_part = "".join(correct_character_position(c, "number") for c in tail[:4])
        alpha_part = "".join(correct_character_position(c, "letter") for c in tail[4:])
        return f"{year_part}BH{num_part}{alpha_part}"

    # Standard State-based plate: 2 letters (state) + 1-2 digits (RTO) + 0-3 letters (series) + 1-4 digits
    raw_state = cleaned[:2]
    state = STATE_CORRECTIONS.get(raw_state, "")
    if not state:
        # If not explicitly mapped, force first two chars to letters
        state = "".join(correct_character_position(c, "letter") for c in raw_state)
        state = STATE_CORRECTIONS.get(state, state)

    remaining = cleaned[2:]
    if len(remaining) < 3:
        return state + remaining

    # Extract RTO digits (1 or 2 digits)
    rto_candidate = remaining[:2]
    if rto_candidate[0].isdigit() or rto_candidate[0] in LETTER_TO_NUMBER:
        c1 = correct_character_position(rto_candidate[0], "number")
        c2 = correct_character_position(rto_candidate[1], "number")
        if c2.isdigit():
            rto = c1 + c2
            rest = remaining[2:]
        else:
            rto = c1
            rest = remaining[1:]
    else:
        rto = ""
        rest = remaining

    # Split rest into series letters and final registration digits
    # In India, registration numbers end with 1 to 4 digits
    digits_match = re.search(r"([A-Z0-9]{1,4})$", rest)
    if digits_match and len(rest) > 1:
        num_len = len(digits_match.group(1))
        # Ensure we keep at least some series if available
        if len(rest) > num_len:
            series_raw = rest[:-num_len]
            digits_raw = rest[-num_len:]
        else:
            series_raw = ""
            digits_raw = rest
        series = "".join(correct_character_position(c, "letter") for c in series_raw)
        digits = "".join(correct_character_position(c, "number") for c in digits_raw)
    else:
        series = "".join(correct_character_position(c, "letter") for c in rest)
        digits = ""

    return f"{state}{rto}{series}{digits}"


def format_plate_display(cleaned_plate: str) -> str:
    """Format a normalized plate into a human-friendly spaced Indian plate."""
    plate = clean_text(cleaned_plate)
    # BH Series: 22 BH 1234 AA
    bh = re.match(r"^(\d{2})(BH)(\d{4})([A-Z]{1,2})$", plate)
    if bh:
        return f"{bh.group(1)} {bh.group(2)} {bh.group(3)} {bh.group(4)}"

    # Standard Indian: AP 27 AB 1234
    std = re.match(r"^([A-Z]{2})(\d{1,2})([A-Z]{1,3})?(\d{1,4})$", plate)
    if std:
        parts = [std.group(1), std.group(2)]
        if std.group(3):
            parts.append(std.group(3))
        parts.append(std.group(4))
        return " ".join(parts)

    return plate


def validate_plate(text: str | None) -> Dict[str, Any]:
    """
    Validates Indian license plate text against national MoRTH standards.
    Supports all 28 states, 8 UTs, and the new Bharat (BH) Series.
    """
    cleaned = clean_text(text)
    if not cleaned:
        return {
            "valid": False,
            "plate": "",
            "formatted": "",
            "state": "Unknown",
            "series": "Unknown",
            "reason": "Empty plate string",
        }

    corrected = correct_plate(cleaned)

    # 1. Bharat Series (BH) Check
    bh_pattern = r"^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$"
    if re.match(bh_pattern, corrected):
        return {
            "valid": True,
            "plate": corrected,
            "formatted": format_plate_display(corrected),
            "state": "Bharat Series (All-India)",
            "state_code": "BH",
            "series": "BH_SERIES",
            "reason": "Valid Bharat Series registration",
        }

    # 2. Standard State Plate Check
    state_code = corrected[:2]
    if state_code not in INDIAN_STATES:
        # Check if length 8-10 looks like a plate but state is slightly off
        return {
            "valid": False,
            "plate": corrected,
            "formatted": corrected,
            "state": "Unknown",
            "state_code": state_code,
            "series": "INVALID_STATE",
            "reason": f"State code '{state_code}' is not recognized in India",
        }

    state_name = INDIAN_STATES[state_code]

    # Standard Pattern: 2 Letters (State) + 1-2 Digits (RTO) + 0-3 Letters (Series) + 1-4 Digits (Number)
    standard_pattern = r"^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$"
    strict_match = re.match(standard_pattern, corrected)

    # Length check: Indian plates are between 6 and 10 characters
    if strict_match and 6 <= len(corrected) <= 10:
        return {
            "valid": True,
            "plate": corrected,
            "formatted": format_plate_display(corrected),
            "state": state_name,
            "state_code": state_code,
            "series": "STANDARD",
            "reason": "Valid Indian registration format",
        }

    # Lenient fallback for vintage or custom formatting with valid state prefix
    if len(corrected) >= 6 and re.match(r"^[A-Z]{2}[0-9A-Z]{4,8}$", corrected):
        return {
            "valid": True,
            "plate": corrected,
            "formatted": format_plate_display(corrected),
            "state": state_name,
            "state_code": state_code,
            "series": "NON_STANDARD_OR_FANCY",
            "reason": "Recognized state prefix with non-standard series pattern",
        }

    return {
        "valid": False,
        "plate": corrected,
        "formatted": corrected,
        "state": state_name,
        "state_code": state_code,
        "series": "INVALID_FORMAT",
        "reason": "Invalid character arrangement for Indian license plate",
    }