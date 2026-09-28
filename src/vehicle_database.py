AUTHORIZED_VEHICLES = {
    "AP39AB1234": {
        "owner": "Demo Vehicle 1",
        "state": "Andhra Pradesh"
    },

    "TS09GH3456": {
        "owner": "Demo Vehicle 2",
        "state": "Telangana"
    },

    "TN38NP1234": {
        "owner": "Demo Vehicle 3",
        "state": "Tamil Nadu"
    },

    "KA01UV4321": {
        "owner": "Demo Vehicle 4",
        "state": "Karnataka"
    }
}


def check_vehicle(plate_number):

    plate_number = plate_number.upper().strip()

    if plate_number in AUTHORIZED_VEHICLES:

        vehicle = AUTHORIZED_VEHICLES[plate_number]

        return {
            "authorized": True,
            "plate": plate_number,
            "owner": vehicle["owner"],
            "state": vehicle["state"]
        }

    return {
        "authorized": False,
        "plate": plate_number,
        "owner": "Unknown",
        "state": "Unknown"
    }