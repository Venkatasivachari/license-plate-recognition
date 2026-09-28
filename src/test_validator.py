from plate_validator import validate_plate


tests = [
    "AP39AB1234",
    "TS09GH3456",
    "TN38NP1234",
    "KA01UV4321",
    "AP39A81234",
    "TSO9GH3456",
    "XYZ12345"
]


for text in tests:

    result = validate_plate(text)

    print(
        f"{text:15} -> "
        f"{result['plate']:15} | "
        f"State={result['state']:20} | "
        f"Valid={result['valid']}"
    )