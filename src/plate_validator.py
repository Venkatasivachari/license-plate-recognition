import re


ALLOWED_STATES = {
    "AP": "Andhra Pradesh",
    "TS": "Telangana",
    "TN": "Tamil Nadu",
    "KA": "Karnataka"
}


# Common OCR mistakes
LETTER_TO_NUMBER = {
    "O": "0",
    "I": "1",
    "Z": "2",
    "S": "5",
    "G": "6",
    "T": "7",
    "B": "8"
}

NUMBER_TO_LETTER = {
    "0": "O",
    "1": "I",
    "2": "Z",
    "5": "S",
    "6": "G",
    "8": "B"
}


def clean_text(text):

    text = text.upper()

    text = re.sub(
        r"[^A-Z0-9]",
        "",
        text
    )

    return text


def correct_state(text):

    text = clean_text(text)

    if len(text) < 2:
        return text

    state = text[:2]

    # Correct common state OCR errors
    corrections = {
        "A8": "AB",
        "A0": "AO",
        "T5": "TS",
        "T8": "TB",
        "K4": "KA",
        "TN": "TN",
        "AP": "AP",
        "TS": "TS",
        "KA": "KA"
    }

    if state in corrections:
        text = corrections[state] + text[2:]

    return text


def correct_character_position(char, expected_type):

    if expected_type == "letter":

        if char.isdigit():

            return NUMBER_TO_LETTER.get(
                char,
                char
            )

        return char

    if expected_type == "number":

        if char.isalpha():

            return LETTER_TO_NUMBER.get(
                char,
                char
            )

        return char

    return char


def correct_plate(text):

    text = correct_state(text)

    if len(text) < 6:
        return text

    state = text[:2]

    if state not in ALLOWED_STATES:
        return text

    remaining = text[2:]

    # Find the first 1-2 digits after state.
    match = re.match(
        r"([A-Z0-9]{1,2})(.*)",
        remaining
    )

    if not match:
        return text

    number_part = match.group(1)
    rest = match.group(2)

    # Correct RTO number
    corrected_number = ""

    for char in number_part:

        corrected_number += (
            correct_character_position(
                char,
                "number"
            )
        )

    # Try to split remaining into:
    # letters + final numbers

    corrected_rest = ""

    for char in rest:

        corrected_rest += char

    # Find last numeric section
    number_match = re.search(
        r"([A-Z0-9]*?)([A-Z0-9]{1,4})$",
        corrected_rest
    )

    if number_match:

        body = corrected_rest

    else:

        body = corrected_rest

    result = (
        state
        + corrected_number
        + body
    )

    return result


def validate_plate(text):

    original = clean_text(text)

    corrected = correct_plate(original)

    state = corrected[:2]

    if state not in ALLOWED_STATES:

        return {
            "valid": False,
            "plate": corrected,
            "state": "Unknown",
            "reason": "Unsupported state"
        }

    # General Indian plate pattern
    pattern = (
        r"^(AP|TS|TN|KA)"
        r"[0-9]{1,2}"
        r"[A-Z]{1,3}"
        r"[0-9]{1,4}$"
    )

    if re.match(pattern, corrected):

        return {
            "valid": True,
            "plate": corrected,
            "state": ALLOWED_STATES[state],
            "reason": "Valid format"
        }

    return {
        "valid": False,
        "plate": corrected,
        "state": ALLOWED_STATES[state],
        "reason": "Invalid format"
    }