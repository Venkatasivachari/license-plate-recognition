# License Plate Recognition

Autonomous vehicle security and license plate recognition for Indian vehicle registrations. The project combines a Python computer-vision pipeline (YOLO and EasyOCR), a Node.js API, and a React/Vite operations dashboard.

This is a research and demonstration prototype, not a production access-control system. The complete feature, workflow, API, database, setup, and troubleshooting reference is [PROJECT_GUIDE.md](PROJECT_GUIDE.md).

## Quick Start

Install the Python dependencies:

```powershell
python -m pip install -r requirements.txt
```

Install and run the backend and frontend in separate terminals:

```powershell
cd backend
npm install
npm start
```

```powershell
cd frontend
npm install
npm run dev
```

The Vite development server prints the dashboard URL when it starts. For the connected camera pipeline, Supabase setup, environment variables, service links, and end-to-end steps, follow [PROJECT_GUIDE.md](PROJECT_GUIDE.md). Backend configuration examples are in `backend/.env.example`; copy that file to `backend/.env` and set the required values locally. Never commit `.env` files or credentials.

## Camera and Model Selection

### What the system uses

The camera workflow is a staged ALPR pipeline. Object detection locates vehicles and plates; OCR reads the cropped plate; deterministic validation and the backend decide how the event is recorded. YOLO does not read the plate characters by itself.

| Stage | Current implementation | Purpose |
| --- | --- | --- |
| Camera capture | Browser `getUserMedia` in `frontend/src/main.jsx` | Requests up to 1920x1080 at 30 FPS where supported, sends a JPEG frame up to 1280 pixels wide, and keeps only one inference request in flight. Actual capture size depends on the camera/browser. |
| Vehicle detection and tracking | Ultralytics YOLO11n + ByteTrack, `yolo11n.pt` | Finds common COCO vehicle classes (car, motorcycle, bus, truck, bicycle), assigns a persistent track ID across frames, and supplies a vehicle crop. This is a general-purpose detector, not a plate recognizer. Set `LPRS_TRACKING_ENABLED=false` to disable tracking. |
| Plate detection | Project-trained, one-class YOLO plate checkpoint at `runs/detect/runs/license_plate/plate_detector/weights/best.pt` | Finds plate bounding boxes within the vehicle crop. The training dataset defines one class: `license_plate`. Inference defaults to 960 pixels (`LPRS_PLATE_IMGSZ`) to help detect small plates. If the checkpoint is missing or returns no box, OpenCV contour/edge heuristics are used as a fallback. |
| Image preparation | OpenCV | Pads the detected crop, preserves its aspect ratio while resizing, and creates grayscale, CLAHE, Otsu, adaptive-threshold, and sharpened variants for OCR. |
| Text recognition | EasyOCR (`en`, alphanumeric allowlist) | Reads candidate characters from each plate crop. CUDA is enabled when PyTorch reports it is available; otherwise it runs on CPU. |
| Plate validation | `src/plate_validator.py` | Normalizes common character confusions and checks supported Indian plate formats. This is deterministic validation, not another learned model. |
| Authorization and persistence | Node API + Supabase | Looks up the recognized plate and active permissions/invitations, records detections/visits, and returns the access decision and vehicle details. |

The model paths and thresholds are configured in [`src/config.py`](src/config.py). `LPRS_VEHICLE_MODEL_PATH` selects the general vehicle detector; `LPRS_PLATE_MODEL_PATH` selects the plate detector. `LPRS_MODEL_PATH` remains a compatibility alias for the plate model. The training entry point is [`src/train_plate_model.py`](src/train_plate_model.py), using `yolo11n.pt` as its default starting weights and `data/yolo_dataset/data.yaml` as its dataset configuration. `requirements.txt` includes `lap`, the tracker dependency used by ByteTrack.

The browser sends JPEG frames (quality `0.72`) to the Python service at `http://localhost:5001/process-frame`. Requests are single-flight in the browser, so another frame is not submitted while the previous inference is still running. The current browser polling interval is one second, but this is not a one-frame-per-second guarantee: inference time depends on the hardware and image. A verified CPU-only test of one sample frame took about 6.1 seconds. Treat this as a development measurement, not a benchmark; GPU and deployment-device performance have not been measured here.

The current quality gates are intentionally conservative: a plate crop below `LPRS_PLATE_MIN_WIDTH_PIXELS` (default `40` pixels) is not sent to OCR; OCR confidence below `LPRS_OCR_CONFIDENCE` (default `0.30`), failed OCR, or an invalid plate format stays `UNKNOWN`/uncertain. Valid reads below `LPRS_OCR_SINGLE_FRAME_CONFIDENCE` (default `0.88`) must agree across `LPRS_OCR_CONSENSUS_FRAMES` reads (default `2`) for the same ByteTrack ID inside `LPRS_OCR_CONSENSUS_WINDOW_SECONDS` (default `30`). `UNKNOWN`/uncertain must not be turned into unauthorized or authorized. For a recognized plate, the backend remains the authority for current registration, permission, invitation, and access status. The project currently uses Supabase; a MongoDB client is not configured in this repository.

### Comparison and suitability

This is a suitability comparison for this codebase and its current CPU-oriented setup, not a measured accuracy leaderboard. Results can change with camera angle, plate size, lighting, motion blur, training data, and hardware. Detector-only and OCR-only models solve different stages and are not direct substitutes.

| Rank for this project | Model or approach | Main purpose | Why it is or is not selected |
| --- | --- | --- | --- |
| 1 | **Current: YOLO11n + ByteTrack, custom YOLO plate detector, EasyOCR/OpenCV, two-read consensus** | Full vehicle-to-plate-to-text pipeline | Already integrated with the camera service, custom plate dataset, validator, and Supabase authorization flow. This is the working baseline; CPU latency and exact-string accuracy still need a representative camera benchmark. |
| 2 | **YOLO26n vehicle detector + custom YOLO26-P2 plate detector + PaddleOCR** | Candidate small-plate/real-time pipeline | A reasonable experiment target because the installed Ultralytics package contains YOLO26 and P2 configs. It is not the current model: no trained YOLO26 plate checkpoint or PaddleOCR package is present. Train/evaluate before switching. |
| 3 | **Current plate detector + PaddleOCR** | Replace only the OCR recognizer | A useful controlled A/B test because it preserves plate detection and the backend contract. PaddleOCR is not installed or integrated; test on the same labeled camera crops before selecting it. |
| 4 | **YOLOv8 plate detector + PaddleOCR/EasyOCR** | Plate localization plus OCR | A reasonable alternative if existing YOLO11-based weights or tooling prove unsuitable. It requires replacement weights and evaluation; no local benchmark currently justifies switching. |
| 5 | **YOLOv10 plate detector + OCR** | Real-time plate localization | Worth testing if detector latency is the bottleneck. It adds checkpoint and training work; speed or accuracy gains are not established for this dataset. |
| 6 | **YOLOv5 plate detector + EasyOCR/Tesseract** | Older detector-plus-OCR pipeline | Useful as a reproducible baseline or when inheriting YOLOv5 weights. It is not selected because the project already has YOLO11-family weights and a trained plate checkpoint. |
| 7 | **LPRNet or CRNN + CTC** | Recognize a cropped plate as a character sequence | Specialized recognition experiments that need plate-image/text labels and training or fine-tuning. Neither is wired into this project. |
| 8 | **TrOCR** | Transformer-based text recognition | A research candidate for difficult text when compute and latency budgets allow. It is not integrated or locally evaluated, and CPU latency is already a concern. |
| 9 | **Tesseract OCR** | Traditional OCR baseline | Lightweight and useful for a baseline comparison. It is not the current recognizer; compare it on the same crops instead of assuming it is always worse. |

**Recommendation:** Keep YOLO11n + ByteTrack + the trained YOLO plate detector + EasyOCR as the working baseline. The implemented next step is track-based consensus and plate-size gating. The future model experiment is YOLO26n for vehicle detection plus a trained YOLO26-P2 plate detector and PaddleOCR, but only after the custom checkpoint and PaddleOCR dependency are installed and evaluated. Compare on the same held-out camera clips using exact plate-string accuracy, character error rate, plate recall at medium range, false authorization rate, and end-to-end latency. Keep the confidence/format gates fixed during the comparison; never replace the baseline based only on vendor benchmark figures.

OpenCV is preprocessing and image handling, not an OCR model. Likewise, YOLOv8/YOLOv10/YOLOv11 are detector choices, while EasyOCR/PaddleOCR/Tesseract/TrOCR/LPRNet/CRNN are recognition choices. A fair evaluation should compare complete pipelines on the same camera frames and hardware, and should report detection recall, exact-string recognition accuracy, false accepts, and latency separately.

## Repository Contents

- `src/` - Python detection, OCR, validation, camera, and runtime modules.
- `backend/` - Node.js API and Supabase integration.
- `frontend/` - React/Vite dashboard.
- `data/` - vehicle and license-plate datasets and related SQL/CSV files.
- `supabase/` - database schema and migrations.

Dataset images may contain visible vehicle registration plates.
