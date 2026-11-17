import serial
import time
import re

from backend_access import BackendAccessError, evaluate_plate_access

ARDUINO_PORT = "COM6"
BAUD_RATE = 9600


def clean_plate(text):
    """Remove spaces and special characters."""
    text = str(text or "").upper()
    text = re.sub(r"[^A-Z0-9]", "", text)
    return text


def check_vehicle(text, confidence, confirmation_text, confirmation_confidence):
    plate = clean_plate(text)
    confirmation = clean_plate(confirmation_text)

    print("\n==============================")
    print("LPRS VEHICLE CHECK")
    print("==============================")
    print("OCR Text       :", text)
    print("Cleaned Plate  :", plate)
    print("OCR Confidence :", round(confidence, 2))

    if not plate or plate != confirmation:
        print("UNKNOWN: two matching reads are required")
        return "UNKNOWN"

    combined_confidence = (confidence + confirmation_confidence) / 2
    try:
        result = evaluate_plate_access(
            plate,
            combined_confidence,
            consensus=2,
            camera_id="arduino-manual-check",
        )
    except (BackendAccessError, ValueError) as error:
        print(f"UNKNOWN: backend authorization unavailable ({error})")
        return "UNKNOWN"

    decision = result["decision"]
    print(f"Database decision: {decision}")
    if decision == "AUTHORIZED":
        print("✅ AUTHORIZED VEHICLE")
    elif decision == "UNAUTHORIZED":
        print("🚨 UNAUTHORIZED VEHICLE")
    else:
        print("UNKNOWN: backend could not establish access")
    return decision


arduino = serial.Serial(
    ARDUINO_PORT,
    BAUD_RATE,
    timeout=1
)

time.sleep(2)

print("Arduino connected.")

try:

    while True:

        text = input("\nEnter OCR result (q to quit): ")

        if text.lower() == "q":
            break

        confidence = float(input("Enter OCR confidence: "))
        confirmation_text = input("Enter the second OCR result: ")
        confirmation_confidence = float(input("Enter second OCR confidence: "))
        decision = check_vehicle(text, confidence, confirmation_text, confirmation_confidence)

        if decision == "AUTHORIZED":
            arduino.write(b"0")
            print("🔕 Buzzer OFF")
        elif decision == "UNAUTHORIZED":
            arduino.write(b"1")
            print("🔔 Buzzer ON")
        else:
            arduino.write(b"0")
            print("Buzzer OFF; access remains unverified")

finally:

    arduino.write(b"0")
    arduino.close()

    print("\nArduino disconnected.")