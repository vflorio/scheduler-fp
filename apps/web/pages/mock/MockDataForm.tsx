import type { ControlUnit, Device, DeviceStatus, VideoCaptureDevice } from "@supervisor/core/services/suitest";
import { useEffect, useState } from "react";

// -------------------------------------------------------------------------------------
// Form di debug volutamente minimale: serve solo a smanettare a runtime con i dati del
// mock server (apps/mocks) per vedere i predicati di tracking (apps/service/src/tracking)
// cambiare in tempo reale. Nessuna cura estetica, HTML grezzo.
// -------------------------------------------------------------------------------------

const BASE = "/api/mocks";

interface MockState {
  readonly devices: readonly Device[];
  readonly videoCaptureDevices: readonly VideoCaptureDevice[];
  readonly controlUnits: readonly ControlUnit[];
}

const DEVICE_STATUSES: readonly DeviceStatus[] = [
  "CONTROLLABLE",
  "OFF",
  "OFFLINE",
  "READY",
  "API_CONTROLLED",
  "CANDYBOX_UPDATE",
  "CLEANUP",
  "INTERACTIVE_MODE",
  "MAINTENANCE",
  "MANUAL_RUN",
  "POWER_ON",
  "RESTARTING",
  "SHUTDOWN",
  "SUITEST_DRIVE_UPDATE",
  "TESTING",
  "BLASTER_ERROR",
  "CANDYBOX_OFFLINE",
  "CANNOT_TURN_ON",
  "DISABLED",
  "DRIVER_FAILURE",
  "DRIVER_INIT_FAILURE",
  "INTERNAL_FAILURE",
  "NOT_CONFIGURED",
  "SUITESTDRIVE_OFFLINE",
  "SUITESTDRIVE_SERVICE_OFFLINE",
];

const fetchState = (): Promise<MockState> =>
  fetch(`${BASE}/_admin/state`).then((res) => {
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  });

const putJson = (path: string, body: unknown): Promise<void> =>
  fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(() => undefined);

export function MockDataForm() {
  const [state, setState] = useState<MockState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    fetchState()
      .then((s) => {
        setState(s);
        setError(null);
      })
      .catch((e: unknown) => setError(String(e)));
  };

  useEffect(refresh, []);

  const applyVcd = (id: string, patch: Partial<VideoCaptureDevice>) =>
    putJson(`/_admin/video-capture-devices/${id}`, patch).then(refresh);
  const applyCu = (id: string, patch: Partial<ControlUnit>) =>
    putJson(`/_admin/control-units/${id}`, patch).then(refresh);
  const applyDevice = (id: string, patch: { status?: DeviceStatus; inUseBy?: { email: string } | null }) =>
    putJson(`/_admin/devices/${id}`, patch).then(refresh);
  const reset = () => fetch(`${BASE}/_admin/reset`, { method: "POST" }).then(refresh);

  if (error) {
    return (
      <p style={{ color: "crimson" }}>
        Mock server unreachable ({error}). È in esecuzione <code>bun mock-services:start</code> su :3002?
      </p>
    );
  }

  if (!state) return <p>Loading…</p>;

  return (
    <div style={{ fontFamily: "monospace", fontSize: 13 }}>
      <h2>Mock data (debug)</h2>
      <button type="button" onClick={reset}>
        Reset all to seed
      </button>

      <h3>Video Capture Devices</h3>
      <table border={1} cellPadding={4} style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>id</th>
            <th>name</th>
            <th>online</th>
            <th>recording</th>
            <th>streaming</th>
          </tr>
        </thead>
        <tbody>
          {state.videoCaptureDevices.map((vcd) => (
            <tr key={vcd.id}>
              <td>{vcd.id}</td>
              <td>{vcd.customName ?? vcd.name}</td>
              <td>
                <input
                  type="checkbox"
                  checked={vcd.online}
                  onChange={(e) => applyVcd(vcd.id, { online: e.target.checked })}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={vcd.recordingActive}
                  onChange={(e) => applyVcd(vcd.id, { recordingActive: e.target.checked })}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={vcd.streamActive}
                  onChange={(e) => applyVcd(vcd.id, { streamActive: e.target.checked })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Control Units</h3>
      <table border={1} cellPadding={4} style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>id</th>
            <th>name</th>
            <th>online</th>
          </tr>
        </thead>
        <tbody>
          {state.controlUnits.map((cu) => (
            <tr key={cu.id}>
              <td>{cu.id}</td>
              <td>{cu.name}</td>
              <td>
                <input
                  type="checkbox"
                  checked={cu.online}
                  onChange={(e) => applyCu(cu.id, { online: e.target.checked })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Devices (TV)</h3>
      <table border={1} cellPadding={4} style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>id</th>
            <th>name</th>
            <th>status</th>
            <th>in use</th>
          </tr>
        </thead>
        <tbody>
          {state.devices.map((d) => (
            <tr key={d.deviceId}>
              <td>{d.deviceId}</td>
              <td>{d.customName}</td>
              <td>
                <select
                  value={d.status}
                  onChange={(e) => applyDevice(d.deviceId, { status: e.target.value as DeviceStatus })}
                >
                  {DEVICE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={d.inUseBy != null}
                  onChange={(e) =>
                    applyDevice(d.deviceId, { inUseBy: e.target.checked ? { email: "debug@local" } : null })
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
