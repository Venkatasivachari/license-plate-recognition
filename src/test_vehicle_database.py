from vehicle_database import check_vehicle


test_plates = [
    "AP39AB1234",
    "TS09GH3456",
    "TN38NP1234",
    "KA01UV4321",
    "AP39XX9999"
]


for plate in test_plates:

    result = check_vehicle(plate)

    print(
        f"Plate: {result['plate']} | "
        f"Authorized: {result['authorized']} | "
        f"Owner: {result['owner']} | "
        f"State: {result['state']}"
    )