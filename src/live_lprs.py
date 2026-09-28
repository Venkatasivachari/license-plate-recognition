from ultralytics import YOLO

import cv2
import serial
import time
import re
from collections import Counter

from ocr import read_plate
from plate_validator import validate_plate


# ============================================================
# SETTINGS
# ============================================================

MODEL_PATH = (
    "runs/detect/runs/license_plate/"
    "plate_detector/weights/best.pt"
)

ARDUINO_PORT = "COM6"

BAUD_RATE = 9600

CAMERA_INDEX = 0


# ============================================================
# AUTHORIZED VEHICLES
# ============================================================

AUTHORIZED_PLATES = {

    "AP12JA1234",

    "AP27AB1234",

    "AP16CD5678",

    "AP09EF2468",

    "AP39GH1357",

    "AP40RS1357",

}


# ============================================================
# OCR SETTINGS
# ============================================================

OCR_ATTEMPTS = 5

MIN_OCR_CONFIDENCE = 0.30

MIN_CONSENSUS = 2


# ============================================================
# BUZZER SETTINGS
# ============================================================

BUZZER_TIME = 5

PLATE_LOST_TIME = 2


# ============================================================
# CLEAN TEXT
# ============================================================

def clean_text(text):

    if not text:

        return ""

    text = text.upper()

    text = re.sub(
        r"[^A-Z0-9]",
        "",
        text
    )

    return text


# ============================================================
# GET BEST OCR RESULT
# ============================================================

def get_best_ocr_result(plate):

    attempts = []


    print()
    print("================================")
    print("OCR LIVE ATTEMPTS")
    print("================================")


    for attempt in range(
        OCR_ATTEMPTS
    ):

        print()

        print(
            f"Attempt {attempt + 1}/{OCR_ATTEMPTS}"
        )

        print(
            "--------------------------------"
        )


        try:

            text, confidence = read_plate(
                plate
            )


            cleaned = clean_text(
                text
            )


            print(
                f"RAW OCR       : {text}"
            )

            print(
                f"NORMALIZED     : {cleaned}"
            )

            print(
                f"CONFIDENCE     : {confidence:.2f}"
            )


            if cleaned:

                attempts.append(
                    (
                        cleaned,
                        confidence
                    )
                )


        except Exception as e:

            print(
                "OCR ERROR:",
                e
            )


    print()
    print("================================")
    print("OCR SUMMARY")
    print("================================")


    if not attempts:

        print(
            "NO VALID OCR RESULT"
        )

        return (
            "",
            0.0,
            0
        )


    # ========================================================
    # COUNT OCCURRENCES
    # ========================================================

    counter = Counter(
        text
        for text, confidence
        in attempts
    )


    # Most common plate

    most_common = counter.most_common()


    best_plate = ""

    best_count = 0

    best_confidence = 0.0


    # ========================================================
    # CONSENSUS + CONFIDENCE
    # ========================================================

    for plate_text, count in most_common:

        confidences = [

            confidence

            for text, confidence
            in attempts

            if text == plate_text

        ]


        average_confidence = (

            sum(confidences)

            / len(confidences)

        )


        print(
            f"{plate_text:<20} "
            f"count={count} "
            f"avg_confidence="
            f"{average_confidence:.2f}"
        )


        if (

            count > best_count

            or (

                count == best_count

                and

                average_confidence
                > best_confidence

            )

        ):

            best_plate = plate_text

            best_count = count

            best_confidence = (
                average_confidence
            )


    print()
    print(
        "--------------------------------"
    )

    print(
        f"FINAL OCR RESULT : "
        f"{best_plate}"
    )

    print(
        f"FINAL CONFIDENCE : "
        f"{best_confidence:.2f}"
    )

    print(
        f"CONSENSUS        : "
        f"{best_count}/{OCR_ATTEMPTS}"
    )

    print(
        "--------------------------------"
    )


    return (
        best_plate,
        best_confidence,
        best_count
    )


# ============================================================
# MAIN
# ============================================================

def main():

    print()
    print("================================")
    print("STARTING LPRS")
    print("================================")


    # ========================================================
    # YOLO
    # ========================================================

    print(
        "Loading YOLO model..."
    )

    model = YOLO(
        MODEL_PATH
    )

    print(
        "YOLO model loaded."
    )


    # ========================================================
    # ARDUINO
    # ========================================================

    arduino = None


    try:

        print(
            "Connecting to Arduino..."
        )

        arduino = serial.Serial(
            ARDUINO_PORT,
            BAUD_RATE,
            timeout=1
        )

        time.sleep(2)

        print(
            "Arduino connected."
        )


    except Exception as e:

        print()
        print(
            "WARNING: Arduino unavailable."
        )

        print(
            "Error:",
            e
        )

        print(
            "Vision system will continue."
        )


    # ========================================================
    # CAMERA
    # ========================================================

    camera = cv2.VideoCapture(
        CAMERA_INDEX
    )


    if not camera.isOpened():

        print(
            "ERROR: Camera failed."
        )

        if arduino:

            arduino.close()

        return


    camera.set(
        cv2.CAP_PROP_FRAME_WIDTH,
        1280
    )

    camera.set(
        cv2.CAP_PROP_FRAME_HEIGHT,
        720
    )


    print()
    print(
        "Camera started."
    )

    print()
    print(
        "Q = Quit"
    )

    print(
        "O = Buzzer OFF"
    )

    print()


    # ========================================================
    # STATE
    # ========================================================

    vehicle_processed = False

    last_plate_seen = time.time()

    current_plate = ""

    current_status = "WAITING"

    current_confidence = 0.0

    current_consensus = 0

    buzzer_start = None


    # ========================================================
    # FPS
    # ========================================================

    previous_time = time.time()

    fps = 0.0


    # ========================================================
    # MAIN LOOP
    # ========================================================

    while True:

        ret, frame = camera.read()


        if not ret:

            print(
                "Camera frame failed."
            )

            break


        # ====================================================
        # FPS
        # ====================================================

        current_time = time.time()

        delta = (
            current_time
            - previous_time
        )

        previous_time = current_time


        if delta > 0:

            instant_fps = 1 / delta

            fps = (
                fps * 0.9
                +
                instant_fps * 0.1
            )


        # ====================================================
        # YOLO
        # ====================================================

        yolo_start = time.time()


        results = model.predict(
            frame,
            conf=0.25,
            verbose=False
        )


        yolo_time = (
            time.time()
            - yolo_start
        ) * 1000


        plate_detected = False


        # ====================================================
        # DETECTIONS
        # ====================================================

        for result in results:

            for box in result.boxes:

                plate_detected = True

                last_plate_seen = time.time()


                # --------------------------------------------
                # Coordinates
                # --------------------------------------------

                x1, y1, x2, y2 = map(
                    int,
                    box.xyxy[0]
                )


                x1 = max(
                    0,
                    x1
                )

                y1 = max(
                    0,
                    y1
                )

                x2 = min(
                    frame.shape[1],
                    x2
                )

                y2 = min(
                    frame.shape[0],
                    y2
                )


                # --------------------------------------------
                # Draw detection
                # --------------------------------------------

                cv2.rectangle(
                    frame,
                    (x1, y1),
                    (x2, y2),
                    (0, 255, 0),
                    2
                )


                # --------------------------------------------
                # Crop
                # --------------------------------------------

                plate = frame[
                    y1:y2,
                    x1:x2
                ]


                if plate.size == 0:

                    continue


                # =================================================
                # PROCESS ONLY ONE VEHICLE SESSION
                # =================================================

                if not vehicle_processed:

                    print()
                    print()
                    print(
                        "################################"
                    )

                    print(
                        "      NEW VEHICLE DETECTED"
                    )

                    print(
                        "################################"
                    )


                    ocr_start = time.time()


                    (
                        best_plate,
                        confidence,
                        consensus
                    ) = get_best_ocr_result(
                        plate
                    )


                    ocr_time = (
                        time.time()
                        - ocr_start
                    ) * 1000


                    current_plate = (
                        best_plate
                    )

                    current_confidence = (
                        confidence
                    )

                    current_consensus = (
                        consensus
                    )


                    # =================================================
                    # OCR FAILURE
                    # =================================================

                    if not best_plate:

                        current_status = (
                            "OCR_FAILED"
                        )


                        print()
                        print(
                            "❌ OCR FAILED"
                        )

                        print(
                            "Decision : UNKNOWN"
                        )

                        print(
                            "Buzzer   : OFF"
                        )


                        if arduino:

                            try:

                                arduino.write(
                                    b"0"
                                )

                            except:

                                pass


                    # =================================================
                    # OCR UNCERTAIN
                    # =================================================

                    elif (

                        confidence
                        < MIN_OCR_CONFIDENCE

                        or

                        consensus
                        < MIN_CONSENSUS

                    ):

                        current_status = (
                            "OCR_UNCERTAIN"
                        )


                        print()
                        print(
                            "⚠️ OCR UNCERTAIN"
                        )

                        print(
                            f"Plate : "
                            f"{best_plate}"
                        )

                        print(
                            f"Confidence : "
                            f"{confidence:.2f}"
                        )

                        print(
                            f"Consensus : "
                            f"{consensus}/"
                            f"{OCR_ATTEMPTS}"
                        )

                        print(
                            "Decision : UNKNOWN"
                        )

                        print(
                            "Buzzer : OFF"
                        )


                        if arduino:

                            try:

                                arduino.write(
                                    b"0"
                                )

                            except:

                                pass


                    else:

                        # =================================================
                        # VALIDATION
                        # =================================================

                        validation = (
                            validate_plate(
                                best_plate
                            )
                        )


                        print()
                        print(
                            "================================"
                        )

                        print(
                            "PLATE VALIDATION"
                        )

                        print(
                            "================================"
                        )

                        print(
                            f"PLATE : "
                            f"{best_plate}"
                        )

                        print(
                            f"VALID : "
                            f"{validation['valid']}"
                        )

                        print(
                            f"STATE : "
                            f"{validation['state']}"
                        )


                        # =================================================
                        # INVALID PLATE
                        # =================================================

                        if not validation[
                            "valid"
                        ]:

                            current_status = (
                                "INVALID_PLATE"
                            )


                            print()
                            print(
                                "⚠️ INVALID PLATE"
                            )

                            print(
                                "Decision : UNKNOWN"
                            )

                            print(
                                "Buzzer : OFF"
                            )


                            if arduino:

                                try:

                                    arduino.write(
                                        b"0"
                                    )

                                except:

                                    pass


                        # =================================================
                        # AUTHORIZATION
                        # =================================================

                        else:

                            if (
                                best_plate
                                in AUTHORIZED_PLATES
                            ):

                                current_status = (
                                    "AUTHORIZED"
                                )


                                print()
                                print(
                                    "================================"
                                )

                                print(
                                    "✅ AUTHORIZED VEHICLE"
                                )

                                print(
                                    "================================"
                                )

                                print(
                                    f"LICENSE PLATE : "
                                    f"{best_plate}"
                                )

                                print(
                                    f"OCR CONFIDENCE : "
                                    f"{confidence:.2f}"
                                )

                                print(
                                    f"CONSENSUS : "
                                    f"{consensus}/"
                                    f"{OCR_ATTEMPTS}"
                                )

                                print(
                                    "DATABASE MATCH : FOUND"
                                )

                                print(
                                    "BUZZER : OFF"
                                )

                                print(
                                    "================================"
                                )


                                if arduino:

                                    try:

                                        arduino.write(
                                            b"0"
                                        )

                                    except:

                                        pass


                            else:

                                current_status = (
                                    "UNAUTHORIZED"
                                )


                                print()
                                print(
                                    "================================"
                                )

                                print(
                                    "❌ UNAUTHORIZED VEHICLE"
                                )

                                print(
                                    "================================"
                                )

                                print(
                                    f"LICENSE PLATE : "
                                    f"{best_plate}"
                                )

                                print(
                                    f"OCR CONFIDENCE : "
                                    f"{confidence:.2f}"
                                )

                                print(
                                    f"CONSENSUS : "
                                    f"{consensus}/"
                                    f"{OCR_ATTEMPTS}"
                                )

                                print(
                                    "DATABASE MATCH : "
                                    "NOT FOUND"
                                )

                                print(
                                    "BUZZER : "
                                    "ON FOR 5 SECONDS"
                                )

                                print(
                                    "================================"
                                )


                                if arduino:

                                    try:

                                        arduino.write(
                                            b"1"
                                        )

                                        buzzer_start = (
                                            time.time()
                                        )

                                    except:

                                        pass


                    # --------------------------------------------
                    # Lock vehicle session
                    # --------------------------------------------

                    vehicle_processed = True


                # =================================================
                # DISPLAY OCR RESULT
                # =================================================

                if current_plate:

                    label = (
                        f"{current_plate} "
                        f"OCR={current_confidence:.2f}"
                    )


                    cv2.putText(
                        frame,
                        label,
                        (
                            x1,
                            max(
                                25,
                                y1 - 10
                            )
                        ),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.7,
                        (0, 255, 0),
                        2
                    )


        # ====================================================
        # BUZZER TIMER
        # ====================================================

        if buzzer_start is not None:

            elapsed = (
                time.time()
                - buzzer_start
            )


            remaining = max(
                0,
                BUZZER_TIME
                - elapsed
            )


            if elapsed >= BUZZER_TIME:

                if arduino:

                    try:

                        arduino.write(
                            b"0"
                        )

                    except:

                        pass


                buzzer_start = None


                print()
                print(
                    "🔕 BUZZER AUTOMATICALLY OFF"
                )


        # ====================================================
        # VEHICLE LEFT
        # ====================================================

        if not plate_detected:

            time_since_seen = (
                time.time()
                - last_plate_seen
            )


            if (

                time_since_seen
                >= PLATE_LOST_TIME

            ):

                if vehicle_processed:

                    print()
                    print(
                        "--------------------------------"
                    )

                    print(
                        "VEHICLE LEFT"
                    )

                    print(
                        "SYSTEM READY FOR NEXT VEHICLE"
                    )

                    print(
                        "--------------------------------"
                    )


                vehicle_processed = False

                current_plate = ""

                current_confidence = 0.0

                current_consensus = 0

                current_status = (
                    "WAITING"
                )


        # ====================================================
        # UI
        # ====================================================

        cv2.putText(
            frame,
            f"Status: {current_status}",
            (
                20,
                40
            ),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (0, 255, 255),
            2
        )


        cv2.putText(
            frame,
            f"FPS: {fps:.1f}",
            (
                20,
                75
            ),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (255, 255, 0),
            2
        )


        cv2.putText(
            frame,
            f"YOLO: {yolo_time:.0f} ms",
            (
                20,
                105
            ),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (255, 255, 0),
            2
        )


        if buzzer_start is not None:

            remaining = max(
                0,
                BUZZER_TIME
                - (
                    time.time()
                    - buzzer_start
                )
            )


            cv2.putText(
                frame,
                f"Buzzer: {remaining:.1f}s",
                (
                    20,
                    135
                ),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.65,
                (0, 0, 255),
                2
            )


        # ====================================================
        # SHOW CAMERA
        # ====================================================

        cv2.imshow(
            "Autonomous License Plate Recognition",
            frame
        )


        # ====================================================
        # KEYBOARD
        # ====================================================

        key = (
            cv2.waitKey(1)
            & 0xFF
        )


        if key == ord("q"):

            break


        if key == ord("o"):

            if arduino:

                try:

                    arduino.write(
                        b"0"
                    )

                except:

                    pass


            buzzer_start = None


            print()
            print(
                "🔕 BUZZER MANUALLY OFF"
            )


    # ========================================================
    # CLEANUP
    # ========================================================

    camera.release()

    cv2.destroyAllWindows()


    if arduino:

        try:

            arduino.write(
                b"0"
            )

            arduino.close()

        except:

            pass


    print()
    print(
        "================================"
    )

    print(
        "LPRS SYSTEM STOPPED"
    )

    print(
        "================================"
    )


# ============================================================
# START
# ============================================================

if __name__ == "__main__":

    main()