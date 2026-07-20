import type { AdbDevice } from "../../hooks/useAdbDevices";
import type { CameraView, ControlUnitView, Db, Hierarchy, TvGroup, TvView } from "./types";

// Stato di raggiungibilità ADB dell'host assegnato alla camera (fisico, via `adb devices`) -
// distinto da `camera.suitest.online`, che riflette invece lo stato dell'app suitest-camera
export function adbStatusFor(adbDevices: readonly AdbDevice[], target: string | undefined): AdbDevice["status"] | null {
  if (!target) return null;
  return adbDevices.find((d) => d.target === target)?.status ?? "disconnect";
}

// -------------------------------------------------------------------------------------
// Join lab <-> suitest (via `suitestId`) + Hierarchy - Control Unit -> TV -> Camera
// (non allocato/misto se manca il collegamento)
// -------------------------------------------------------------------------------------

function enrich(db: Db): { controlUnits: ControlUnitView[]; tvs: TvView[]; cameras: CameraView[] } {
  const controlUnits: ControlUnitView[] = Object.values(db.lab.controlUnits).map((cu) => ({
    ...cu,
    online: db.suitest.controlUnits[cu.id]?.online,
  }));

  const tvs: TvView[] = Object.values(db.lab.tvs).map((tv) => {
    const device = tv.suitestId ? db.suitest.devices[tv.suitestId] : undefined;
    return { ...tv, controlUnitIds: device?.controlUnitIds, inUseBy: device?.inUseBy };
  });

  const cameras: CameraView[] = Object.values(db.lab.cameras).map((camera) => {
    const vcd = camera.suitestId ? db.suitest.videoCaptureDevices[camera.suitestId] : undefined;
    return {
      ...camera,
      suitest: vcd
        ? {
            customName: vcd.customName,
            assignedDeviceId: vcd.assignedDeviceId,
            online: vcd.online,
            recordingActive: vcd.recordingActive,
            streamActive: vcd.streamActive,
          }
        : undefined,
    };
  });

  return { controlUnits, tvs, cameras };
}

export function buildHierarchy(db: Db): Hierarchy {
  const { controlUnits, tvs, cameras } = enrich(db);

  const camerasByTvSuitestId = new Map<string, CameraView[]>();
  const orphanCameras: CameraView[] = [];
  for (const camera of cameras) {
    const tv =
      camera.suitest?.assignedDeviceId !== undefined
        ? tvs.find((t) => t.suitestId === camera.suitest?.assignedDeviceId)
        : undefined;
    if (tv?.suitestId) {
      const list = camerasByTvSuitestId.get(tv.suitestId) ?? [];
      list.push(camera);
      camerasByTvSuitestId.set(tv.suitestId, list);
    } else {
      orphanCameras.push(camera);
    }
  }

  const tvsByCuId = new Map<string, TvView[]>();
  const orphanTvs: TvView[] = [];
  for (const tv of tvs) {
    const cuId = tv.controlUnitIds?.find((id) => controlUnits.some((cu) => cu.id === id));
    if (cuId) {
      const list = tvsByCuId.get(cuId) ?? [];
      list.push(tv);
      tvsByCuId.set(cuId, list);
    } else {
      orphanTvs.push(tv);
    }
  }

  const toGroup = (tv: TvView): TvGroup => ({ tv, cameras: camerasByTvSuitestId.get(tv.suitestId ?? "") ?? [] });

  return {
    cuGroups: controlUnits.map((cu) => ({ cu, tvs: (tvsByCuId.get(cu.id) ?? []).map(toGroup) })),
    unallocatedTvs: orphanTvs.map(toGroup),
    orphanCameras,
  };
}

// Candidati Suitest non ancora collegati a nessun'altra entry lab (riconciliazione manuale)
export function tvSuitestCandidates(db: Db, currentSuitestId: string | undefined) {
  const usedElsewhere = new Set(
    Object.values(db.lab.tvs)
      .map((t) => t.suitestId)
      .filter((id): id is string => id !== undefined && id !== currentSuitestId),
  );
  return Object.values(db.suitest.devices)
    .filter((d) => !usedElsewhere.has(d.deviceId))
    .map((d) => ({ id: d.deviceId, primary: d.customName || d.deviceId, secondary: d.ipAddress }));
}

export function cameraSuitestCandidates(db: Db, currentSuitestId: string | undefined) {
  const usedElsewhere = new Set(
    Object.values(db.lab.cameras)
      .map((c) => c.suitestId)
      .filter((id): id is string => id !== undefined && id !== currentSuitestId),
  );
  return Object.values(db.suitest.videoCaptureDevices)
    .filter((v) => !usedElsewhere.has(v.id))
    .map((v) => ({ id: v.id, primary: v.customName || v.name, secondary: v.assignedDeviceId }));
}
