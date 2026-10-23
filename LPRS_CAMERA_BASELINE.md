# LPRS Camera Baseline - Part 1

Date: 2026-10-06

## Scope

Instrument the current YOLO11 + EasyOCR pipeline and camera monitor without changing model weights, thresholds, crop strategy, OCR variants, or consensus behavior.

## Environment

- Frontend: Vite on port 5173.
- Backend: Node.js API on port 4000; Supabase reported connected.
- AI service: Python on port 5001.
- OCR execution: CPU; no CUDA device was available to EasyOCR.
- Models: existing vehicle detector and plate detector; no model was retrained or replaced.

## Smoke Measurement

This was a 640 x 360 synthetic solid-gray frame sent through the live AI HTTP endpoint. It is useful for measuring the no-vehicle path, but it is **not** a real-camera plate accuracy test.

| Stage | Time |
| --- | ---: |
| EasyOCR startup load | 10.094 s |
| Plate detector startup load | 0.315 s |
| Vehicle model load on first frame | 0.152 s |
| Image decode | 0.053 s |
| Vehicle detection | 0.552 s |
| Vehicle crop | 0.000 s |
| Plate detection | 0.490 s |
| Plate crop | 0.000 s; no plate candidate |
| OCR | 7.430 s |
| Frame inference total | 8.624 s |
| AI request total | 8.677 s |
| Browser round trip | 9.266 s |

Result: `NO_VEHICLE`. No database write was attempted.

## Finding

When YOLO finds no vehicle, the current code uses the full frame as the plate crop. If that frame contains no plate text, EasyOCR still evaluates up to six preprocessing variants (`original`, `gray`, `clahe`, `otsu`, `adaptive`, and `sharpened`). In this smoke test, that OCR work took 7.430 seconds.

The browser sends frames on a one-second interval but permits only one in-flight request. While an 8-9 second request is running, later timer ticks are skipped. This explains the measured lack of continuous updates for this no-vehicle path. It does not establish how quickly a clear, correctly framed plate will be recognized.

## Instrumentation Added

- AI timing fields for model initialization, vehicle inference, vehicle crop, plate detection/crop, OCR, consensus, decode, backend persistence, and request total.
- Health endpoint startup timings for EasyOCR and the plate detector.
- Camera overlay for vehicle/plate boxes, OCR text, confidence, decision, plate pixel width, persistence errors, and elapsed stages.
- Client-disconnect handling so an abandoned frame response does not trigger a second socket-write traceback.

## Not Yet Measured

The shared browser session remained at login, and browser automation could not switch it into the admin camera screen or grant camera permission. No physical laptop-camera frames or test plates were available to this measurement run. Therefore real-plate latency, recognition accuracy, angle/lighting performance, and close/medium/far ranges remain unverified. Do not use the synthetic-frame timing as the expected plate-recognition time.

## Validation

- Frontend production build passed.
- Python compilation passed.
- The smoke endpoint returned the timing payload and frame dimensions successfully.

Next Part 1 action: open the app in the visible browser, sign in as admin, allow the laptop camera, and show a test plate. Record several runs before tuning any model or threshold.