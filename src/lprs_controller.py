import serial
import time
import re


ARDUINO_PORT = "COM6"
BAUD_RATE = 9600

AUTHORIZED_PLATES = {
    "AP27AB1234",
    "TS09CD5678",
    "KA01EF9012",
    "TN38GH4567"
}


def clean_plate(text):
    """Remove spaces and special characters."""
    text = text.upper()
    text = re.sub(r"[^A-Z0-9]", "", text)
    return text


def check_vehicle(text, confidence):

    plate = clean_plate(text)

    print("\n==============================")
    print("LPRS VEHICLE CHECK")
    print("==============================")
    print("OCR Text       :", text)
    print("Cleaned Plate  :", plate)
    print("OCR Confidence :", round(confidence, 2))

    if not plate:
        print("❌ Plate not detected")
        return False

    if plate in AUTHORIZED_PLATES:
        print("✅ AUTHORIZED VEHICLE")
        return True

    print("🚨 UNAUTHORIZED VEHICLE")
    return False


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

        confidence = float(
            input("Enter OCR confidence: ")
        )

        authorized = check_vehicle(text, confidence)

        if authorized:
            arduino.write(b"0")
            print("🔕 Buzzer OFF")

        else:
            arduino.write(b"1")
            print("🔔 Buzzer ON")

finally:

    arduino.write(b"0")
    arduino.close()

    print("\nArduino disconnected.")