# Autonomous Vehicle Analytics and LPRS

## Project Overview

Autonomous Vehicle Analytics is a local-first vehicle security and license plate recognition system for Indian vehicle registrations. LPRS means **License Plate Recognition System**.

The project combines:

- Computer vision for vehicle and number plate detection.
- YOLO inference for object detection.
- EasyOCR for reading plate characters.
- Indian-style plate normalization and validation.
- Authorization decisions for registered and unregistered vehicles.
- Optional Arduino buzzer control.
- CSV event and result logging.
- A Python HTTP frame gateway.
- A Node.js API with WebSocket event delivery.
- A React/Vite security operations dashboard.
- LocalStorage-based vehicle registry, visits, permissions, invitations, alerts, reports, and analytics.

This is a **working research and demonstration prototype**, not a production access-control system. Camera accuracy, full Indian registration coverage, physical buzzer behavior, durable authorization storage, and multi-vehicle tracking still require additional implementation and validation.

## Problem Statement

Manual vehicle monitoring is slow and difficult to audit. A gate, campus, office, apartment, or restricted facility needs a system that can detect a vehicle, locate its plate, read the registration number, validate the result, compare it with an authorization list, and record the event.

The system must also distinguish between:

- A valid plate that is not authorized.
- A plate that could not be read.
- A plate read with low confidence.
- A plate with an invalid or unsupported format.

A failed OCR result must never be treated as proof that a vehicle is unauthorized.

## Main Objectives

1. Capture a vehicle image or live camera frame.
2. Detect a vehicle or license plate region.
3. Crop the detected plate.
4. Improve the crop with multiple image preprocessing variants.
5. Read plate characters with EasyOCR.
6. Normalize OCR text and correct common character mistakes.
7. Validate the plate against supported Indian registration patterns.
8. Compare valid plates with authorized records.
9. Trigger optional hardware output for unauthorized vehicles.
10. Store results for review and reporting.
11. Display events and operational data in a browser dashboard.

## Current Architecture

### Connected browser camera path

```text
Browser webcam
    |
    | JPEG frame over HTTP
    v
Python AI service :5001
    |
    +--> VehicleDetector / YOLO
    +--> PlateDetector
    +--> EasyOCR
    +--> Normalization and validation
    +--> Authorization decision
    |
    | JSON event
    v
Node.js backend :4000
    |
    +--> In-memory event store, latest 100 events
    +--> Optional MongoDB detections collection
    +--> WebSocket broadcast
    v
React dashboard :5173
```

### Direct Python live path

`src/live_lprs.py` is the standalone camera prototype. It loads the trained plate model, reads frames through OpenCV, performs repeated OCR attempts, applies status rules, controls an optional Arduino buzzer, and displays diagnostic information.

This script is useful for direct hardware and camera experiments. The Python HTTP gateway is the intended path for connecting the real camera processing pipeline to the browser dashboard.

## Features

### AI and computer vision

- OpenCV image and camera input.
- YOLO-based detection using the trained license plate model.
- Vehicle detection helper using a YOLO vehicle model.
- Contour-based plate candidate detection helper.
- Plate crop extraction.
- EasyOCR English reader running on CPU.
- OCR allowlist restricted to uppercase letters and digits.
- Four-times plate image enlargement.
- Original, grayscale, CLAHE, Otsu, adaptive threshold, and sharpened OCR variants.
- OCR text normalization to uppercase alphanumeric text.
- Average OCR confidence reporting.
- Repeated OCR attempts and consensus selection in the direct live flow.
- Detection, OCR, and total processing timing in the live prototype.

### Plate validation and decisions

The current validator supports these state prefixes:

- `AP` - Andhra Pradesh
- `TS` - Telangana
- `TN` - Tamil Nadu
- `KA` - Karnataka

The general supported pattern is:

```text
STATE + 1 or 2 digits + 1 to 3 letters + 1 to 4 digits
```

Examples include `AP12JA1234`, `TS09GH3456`, `TN38NP1234`, and `KA01UV4321`.

Possible runtime states include:

| State | Meaning | Decision |
|---|---|---|
| `AUTHORIZED` | Valid, readable plate found in the authorization list | Authorized |
| `UNAUTHORIZED` | Valid, readable plate absent from the authorization list | Unauthorized |
| `UNREGISTERED` | Dashboard/demo label for a vehicle with no registry match | Unauthorized in demo logic |
| `OCR_FAILED` | OCR returned no usable text | Unknown |
| `OCR_UNCERTAIN` | OCR confidence or consensus is too low | Unknown |
| `INVALID_PLATE` | OCR text does not match the supported format | Unknown |
| `NO_VEHICLE` | No vehicle was detected in the frame | Unknown/no action |
| `NO_PLATE` | Vehicle was detected but no plate candidate was found | Unknown/no action |
| `AI_ERROR` | Frame processing or service error | Unknown |
| `EXPIRED` | Dashboard registry access has expired | Review/alert |
| `BLOCKED` | Dashboard registry record is blocked | Review/alert |

### Hardware integration

- Optional Arduino serial connection.
- Default serial speed: `9600` baud.
- Buzzer ON command: byte `1`.
- Buzzer OFF command: byte `0`.
- Automatic buzzer duration in the direct flow: five seconds.
- Manual buzzer OFF key in the direct flow: `O`.
- Cleanup attempts to switch the buzzer off.
- Vision processing can continue when Arduino is unavailable in the direct prototype.

### Dashboard

The React dashboard includes these navigation areas:

- Dashboard: counters, camera panel, latest detection, event table, and demo controls.
- Live Monitoring: camera and latest detection view.
- Vehicles: searchable registry with owner, driver, purpose, status, and block action.
- Register Vehicle: local registry form for vehicle and owner details.
- Permissions: create access permissions for a vehicle.
- Invitations: create visitor or host invitations.
- Visit History: entry and exit records.
- Plate Validator: manually check supported plate format and registry status.
- Alerts: review blocked and expired vehicle alerts.
- Analytics: vehicle type, status, visit, detection, and average-stay summaries.
- Reports: filter visits by date, vehicle type, and status; export CSV or print/PDF.
- Settings: camera diagnostics and AI connection status.

The dashboard explicitly labels sample records as demo data. It can request the browser webcam and send frames to the Python AI service. A browser camera preview may work even when the Python AI service is offline.

### Local data and demo mode

Browser data is stored in separate LocalStorage collections:

```text
vehicles, owners, drivers, permissions, invitations,
visits, detections, alerts, settings
```

The dashboard supports:

- Generate 30 sample vehicles.
- Simulate authorized, unauthorized, new, and temporary detections.
- Create demo visits and alerts.
- Clear demo records without removing non-demo records.
- Register local vehicle records.
- Search vehicles by plate, owner, driver, type, or purpose.
- Export vehicle history and filtered reports as CSV.

LocalStorage is not a secure or shared production database. Browser data is profile-specific and can be deleted by the user or browser.

## Repository Structure

```text
autonomous_vehicle_analytics/
|
|-- README.md                         Existing project README
|-- PROJECT_README.md                 This detailed project guide
|-- PROJECT_AUDIT_REPORT.md           Audit findings and risk review
|-- FINAL_LPRS_REPORT.md              Final implementation report
|-- requirements.txt                  Python dependencies
|-- yolo11n.pt                        Base YOLO model artifact
|-- test_arduino.py                   Root Arduino test script
|-- test_plate_buzzer.py              Root manual buzzer test
|
|-- backend/
|   |-- package.json                  Node dependencies and start scripts
|   `-- src/
|       |-- server.js                 Express API and WebSocket server
|       `-- store.js                  In-memory event store and dashboard stats
|
|-- frontend/
|   |-- index.html                    Browser entry document
|   |-- package.json                  React/Vite dependencies and scripts
|   |-- vite.config.js                Vite React configuration
|   `-- src/
|       |-- main.jsx                  React application and dashboard pages
|       |-- styles.css                 Dashboard styles and responsive layout
|       `-- services/
|           `-- localStorageService.js LocalStorage registry and demo helpers
|
|-- src/
|   |-- __init__.py                   Python package marker
|   |-- ai_service.py                 HTTP frame gateway on port 5001
|   |-- arduino_controller.py         Safe serial buzzer wrapper
|   |-- camera.py                      OpenCV camera and image utilities
|   |-- check_annotations.py           Annotation inspection utility
|   |-- config.py                      Environment-based live configuration
|   |-- convert_xml_to_yolo.py         XML annotation conversion utility
|   |-- database.py                    CSV result database
|   |-- evaluate_ocr.py                OCR evaluation utility
|   |-- event_logger.py                One-row-per-event CSV logger
|   |-- final_ocr_evaluation.py        Ground-truth OCR evaluation script
|   |-- inspect_plate_crops.py          Plate crop inspection utility
|   |-- live_lprs.py                   Standalone live camera prototype
|   |-- lprs_controller.py             Legacy interactive serial prototype
|   |-- lprs_runtime.py                OCR summary and decision helpers
|   |-- main.py                        Older image pipeline and camera preview
|   |-- ocr.py                         EasyOCR and preprocessing functions
|   |-- plate_detection.py              Contour-based plate detector
|   |-- plate_validator.py              Indian plate cleanup and validation
|   |-- prepare_yolo_dataset.py         Dataset preparation utility
|   |-- review_annotations.py           Annotation review utility
|   |-- test_lprs_arduino.py            Interactive Arduino test
|   |-- test_lprs_runtime.py            Runtime unit tests
|   |-- test_plate_model.py             Plate model prediction smoke script
|   |-- test_plate_ocr.py               Dataset OCR test script
|   |-- test_validator.py               Validator smoke test
|   |-- test_vehicle_database.py        Authorization lookup smoke test
|   |-- test_yolo_dataset.py             YOLO dataset validation script
|   |-- train_plate_model.py             YOLO training script
|   |-- vehicle_database.py              In-memory demo authorization records
|   `-- vehicle_detection.py             YOLO vehicle detector
|
|-- data/
|   |-- images/                        General input images
|   |-- plates/                        Plate image data
|   |-- dataset/State-wise_OLX/        Source state-wise image/XML dataset
|   `-- yolo_dataset/
|       |-- data.yaml                  YOLO dataset configuration
|       |-- images/{train,val,test}/   Dataset image splits
|       `-- labels/{train,val,test}/   YOLO label splits
|
|-- logs/
|   `-- vehicle_events.csv             Direct live event log
|
|-- models/                            Model storage directory
|-- output/
|   |-- detected/                      Saved vehicle and plate crops
|   |-- ocr_test/                      OCR test outputs
|   |-- plate_crops/                   Plate crop outputs
|   `-- results/vehicle_results.csv    CSV image-processing results
|
`-- runs/
    `-- detect/runs/license_plate/     Ultralytics training and prediction artifacts
        `-- plate_detector/weights/best.pt Trained plate detector used by the pipeline
```

The dataset audit recorded 602 images and 602 label files across the YOLO train, validation, and test splits. The dataset defines one class: `license_plate`.

## Backend API

The Node service listens on port `4000` by default.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | Backend health and database mode |
| `GET` | `/api/system/status` | API, database, AI, and mode status |
| `GET` | `/api/events?limit=20` | Return recent events, capped at 100 |
| `GET` | `/api/analytics/dashboard` | Return today’s event counters |
| `POST` | `/api/events` | Store and broadcast a detection event |
| `GET` | `/health` on port 5001 | Python AI service health |
| `POST` | `/process-frame` on port 5001 | Process a base64 JPEG frame |

The backend broadcasts WebSocket messages on the same server:

```json
{"type":"snapshot","data":[]}
{"type":"vehicle_detected","data":{"status":"AUTHORIZED"}}
```

The Node backend uses Supabase PostgreSQL when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured. If Supabase is unavailable, the backend uses its in-memory fallback for local development. Legacy CSV output can be imported with `npm run migrate:csv` from the `backend` directory.

## Installation

### Python environment

From the project root:

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Python packages include OpenCV, Ultralytics, EasyOCR, NumPy, Pandas, Pillow, and pyserial.

### Backend

```powershell
cd backend
npm install
npm start
```

The backend starts at `http://localhost:4000`.

### Frontend

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`.

## Running the Connected Camera Dashboard

Start the services in three terminals from the project root:

```powershell
python src\ai_service.py
```

```powershell
cd backend
npm start
```

```powershell
cd frontend
npm run dev
```

Then open the dashboard, turn on the camera, and grant browser camera permission.

The browser captures a frame approximately every 1.5 seconds and sends a base64 JPEG to the Python service. The Python service detects the best vehicle and plate candidate, performs OCR and validation, and posts completed events to the Node backend. The backend stores the event and broadcasts it to connected dashboard clients.

### Useful environment variables

| Variable | Default | Purpose |
|---|---:|---|
| `LPRS_AI_PORT` | `5001` | Python AI service port |
| `LPRS_BACKEND_URL` | `http://localhost:4000/api/events` | Event destination for Python AI |
| `PORT` | `4000` | Node backend port |
| `DEMO_MODE` | `false` | Backend reported mode label |
| `VITE_AI_URL` | `http://localhost:5001` | Frontend AI service URL |
| `VITE_API_URL` | `http://localhost:4000` | Frontend API/WebSocket URL |
| `LPRS_MODEL_PATH` | Trained plate model path | Python model override |
| `LPRS_CAMERA_INDEX` | `0` | Direct OpenCV camera index |
| `LPRS_SERIAL_PORT` | `COM6` | Arduino serial port |
| `LPRS_BAUD_RATE` | `9600` | Arduino baud rate |
| `LPRS_YOLO_CONFIDENCE` | `0.25` | YOLO confidence threshold |
| `LPRS_OCR_CONFIDENCE` | `0.30` | OCR confidence threshold |
| `LPRS_BUZZER_SECONDS` | `5` | Buzzer duration |
| `LPRS_RESET_DELAY` | `2` | Vehicle session reset delay |
| `LPRS_OCR_FRAME_COUNT` | `5` | OCR frame count for configured runtime |
| `LPRS_AUTHORIZED_PLATES` | Two demo plates | Comma-separated authorized plates |

Note: the current standalone `src/live_lprs.py` still contains some direct constants such as `COM6`, camera index `0`, model path, and its own authorization set. Use the HTTP gateway/configuration path for centralized deployment configuration, or reconcile the standalone script before treating it as the single production entry point.

## Running the Standalone Python Prototype

From the project root:

```powershell
$env:PYTHONPATH="src"
python src\live_lprs.py
```

Required hardware for the full path:

- A camera visible to OpenCV.
- An Arduino or compatible serial board on the configured port.
- Firmware that accepts byte `1` for buzzer ON and byte `0` for buzzer OFF.
- Correct buzzer wiring and appropriate driver circuitry.

Press `O` to switch the buzzer off and `Q` to quit. The vision path can continue when Arduino is unavailable, but physical buzzer timing and wiring are not verified by this repository.

## Image Pipeline and Older Entry Point

The older `src/main.py` exposes an image-processing function and a camera preview:

```powershell
$env:PYTHONPATH="src"
python src\main.py --image data\images\sample_vehicle.jpg
python src\main.py --camera 0
```

The image path is intended to perform vehicle detection, plate detection, OCR, validation, crop saving, and CSV result storage. The audit identified stale API assumptions in this entry point, so it should be reconciled with the current function-based OCR and validator modules before relying on it for a complete run.

## Output and Persistence

### Image-processing CSV

`output/results/vehicle_results.csv` stores:

```text
image_name, vehicle_class, plate_text, status, confidence
```

### Direct live CSV

`logs/vehicle_events.csv` is intended to store one finalized vehicle event with timestamp, plate, raw OCR, confidence, consensus, state, decision, buzzer action, and processing time.

### Saved images

The pipeline may save vehicle crops, plate crops, OCR test images, and detection output under `output/` and `runs/`. These are generated artifacts and should not be treated as source code.

## Testing and Verification

Focused checks recorded by the project audit include:

```powershell
python -m py_compile src\live_lprs.py src\config.py src\event_logger.py src\arduino_controller.py src\lprs_runtime.py
python -m compileall -q src
python src\test_lprs_runtime.py -q
python src\test_validator.py
python src\test_vehicle_database.py
```

The recorded runtime result was four unit tests passed for the decision helpers. Import checks also confirmed Python 3.11.9 and the main computer vision dependencies in the audited environment.

Not fully verified:

- OCR accuracy on representative real Indian plates.
- Plate detector accuracy on live camera frames.
- Complete camera integration behavior.
- Five-second physical buzzer timing.
- Manual buzzer shutdown and disconnect recovery.
- Full dataset OCR evaluation.
- Complete frontend/backend production workflow.
- Supabase persistence in a deployed environment.

## Known Limitations and Risks

- Only four state prefixes are validated.
- Indian RTO and special registration formats are not fully implemented.
- OCR confidence is not calibrated as an end-to-end plate-read confidence.
- Perspective correction and robust denoising are missing.
- Detection presence is used as a session signal; there is no robust multi-object tracker.
- A second plate can be grouped incorrectly during one visible session.
- Camera reconnect and exponential backoff are not implemented.
- Evidence images are not consistently captured for every finalized event.
- Authorization records are demo/configuration data rather than a secured external access database.
- LocalStorage is browser-local and not suitable for shared authorization control.
- The backend’s in-memory store is limited to the most recent 100 events.
- The dashboard contains demo controls and sample records by design.
- `src/main.py` and several script-style test files are legacy or require environment-specific inputs.
- Dataset configuration contains a machine-specific absolute path and should be made portable.
- No confirmed Arduino firmware sketch or pin mapping is included.
- The project has a recorded production-readiness assessment of **35/100**.

## Recommended Next Steps

1. Reconcile `src/live_lprs.py`, `src/config.py`, and `src/lprs_runtime.py` into one canonical runtime.
2. Replace demo authorization records with a secured database and audit trail.
3. Make `data/yolo_dataset/data.yaml` portable.
4. Add camera reconnect and frame-failure backoff.
5. Add perspective correction and broader Indian state/RTO validation.
6. Add a real plate or vehicle tracker for multiple simultaneous vehicles.
7. Add fake-clock tests for buzzer timeout and session reset behavior.
8. Add evidence image capture for each finalized event.
9. Verify the complete camera, OCR, Arduino, backend, and dashboard path with representative test data.
10. Add authentication, authorization, input validation, rate limits, and deployment monitoring before production use.

## Project Status Summary

| Area | Status |
|---|---|
| YOLO plate model artifact | Present |
| Dataset and labels | Present; 602 image/label pairs audited |
| OCR pipeline | Implemented; real accuracy not verified |
| Plate validation | Implemented for AP, TS, TN, and KA |
| Authorization decision safety | Improved and unit-tested in runtime helpers |
| Direct camera prototype | Implemented; hardware/camera accuracy not fully verified |
| Python HTTP AI gateway | Implemented |
| Node API and WebSocket | Implemented |
| React dashboard | Implemented with local demo workflows |
| Supabase persistence | Backend integration for vehicles, detections, visits, and alerts |
| Arduino control | Implemented wrapper and prototype path; physical behavior not verified |
| Production readiness | Prototype only; 35/100 audit score |
