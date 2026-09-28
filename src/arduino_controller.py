"""Arduino Hardware Gateway for NexPlate Smart Barrier & Sensor Integration.
Supports 1 Servo Motor (Gate Barrier) and 2 IR Sensors (Entry & Exit).
"""
import time
import serial


class ArduinoController:

    def __init__(self, port="COM6", baud=9600):
        self.arduino = None
        self.gate_state = "CLOSED"
        self.last_ir_state = {"entry": False, "exit": False}
        try:
            self.arduino = serial.Serial(port, baud, timeout=1)
            time.sleep(2)
            print(f"[NexPlate IoT] Arduino connected on {port}")
        except (OSError, serial.SerialException) as error:
            print(f"[NexPlate IoT] Hardware controller offline on {port}: {error}")
            print("[NexPlate IoT] Operating in graceful mock/simulation fallback mode.")

    @property
    def connected(self):
        return self.arduino is not None and self.arduino.is_open

    def _write(self, command: bytes) -> bool:
        if not self.connected:
            return False
        try:
            self.arduino.write(command)
            return True
        except (OSError, serial.SerialException) as error:
            print(f"[NexPlate IoT] Communication error: {error}")
            return False

    def buzzer_on(self):
        if self._write(b"1\n"):
            print("[NexPlate IoT] BUZZER ON")
        else:
            print("[NexPlate IoT] Simulated BUZZER ON")

    def buzzer_off(self):
        if self._write(b"0\n"):
            print("[NexPlate IoT] BUZZER OFF")
        else:
            print("[NexPlate IoT] Simulated BUZZER OFF")

    def gate_open(self):
        """Rotate servo motor to 90 degrees to lift barrier gate."""
        self.gate_state = "OPEN"
        if self._write(b"G_OPEN\n"):
            print("[NexPlate IoT] BARRIER GATE: OPEN (Servo 90 deg)")
        else:
            print("[NexPlate IoT] Simulated BARRIER GATE: OPEN (Servo 90 deg)")

    def gate_close(self):
        """Rotate servo motor to 0 degrees to lower barrier gate."""
        self.gate_state = "CLOSED"
        if self._write(b"G_CLOSE\n"):
            print("[NexPlate IoT] BARRIER GATE: CLOSED (Servo 0 deg)")
        else:
            print("[NexPlate IoT] Simulated BARRIER GATE: CLOSED (Servo 0 deg)")

    def read_ir_sensors(self) -> dict:
        """
        Query 2 IR sensors:
        - Entry IR sensor (trigger vehicle detection)
        - Exit IR sensor (confirm vehicle cleared barrier)
        """
        if not self.connected:
            return self.last_ir_state
        try:
            self.arduino.write(b"READ_IR\n")
            line = self.arduino.readline().decode("utf-8", errors="ignore").strip()
            # Expected format: "IR:ENTRY=1,EXIT=0" or "1,0"
            if "ENTRY=" in line:
                entry = "ENTRY=1" in line
                exit_s = "EXIT=1" in line
                self.last_ir_state = {"entry": entry, "exit": exit_s}
            elif "," in line:
                parts = line.split(",")
                self.last_ir_state = {
                    "entry": parts[0].strip() == "1",
                    "exit": parts[1].strip() == "1" if len(parts) > 1 else False
                }
        except Exception:
            pass
        return self.last_ir_state

    def close(self):
        if self.connected:
            self.gate_close()
            self.buzzer_off()
            try:
                self.arduino.close()
            except Exception:
                pass
            print("[NexPlate IoT] Arduino controller disconnected.")