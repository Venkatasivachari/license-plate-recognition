from src.arduino_controller import ArduinoController

arduino = ArduinoController("COM6")

try:

    plate = input("Enter detected plate: ").strip().upper()

    authorized_plates = {
        "AP27AB1234",
        "TS09CD5678",
        "KA01EF9012"
    }

    if plate in authorized_plates:
        print("✅ Authorized vehicle")
        arduino.buzzer_off()

    else:
        print("🚨 Unauthorized vehicle")
        arduino.buzzer_on()

finally:
    arduino.close()