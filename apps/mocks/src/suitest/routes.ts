import type { SuitestStore } from "./store";

function notFound(message = "Not found"): Response {
  return Response.json({ error: message }, { status: 404 });
}

// -------------------------------------------------------------------------------------
// Auth
// -------------------------------------------------------------------------------------

function checkBasicAuth(req: Request, tokenId: string, tokenPassword: string): boolean {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Basic ")) return false;
  const decoded = atob(header.slice(6));
  return decoded === `${tokenId}:${tokenPassword}`;
}

// -------------------------------------------------------------------------------------
// Config
// -------------------------------------------------------------------------------------

export interface SuitestRoutesConfig {
  readonly tokenId: string;
  readonly tokenPassword: string;
}

// -------------------------------------------------------------------------------------
// Router
// -------------------------------------------------------------------------------------

const API_PREFIX = "/v1/suitest";

export function suitestRoutes(
  store: SuitestStore,
  config: SuitestRoutesConfig,
): (req: Request) => Response | Promise<Response> | null {
  return (req) => {
    const url = new URL(req.url);
    const path = url.pathname;

    // Admin routes (no auth)
    if (path === "/_admin/reset" && req.method === "POST") {
      store.reset();
      return Response.json({ ok: true });
    }
    if (req.method === "PUT" && path.startsWith("/_admin/devices/")) {
      const id = path.replace("/_admin/devices/", "").replace("/status", "");
      return handleAdminSetStatus(store, req, id);
    }

    // API routes (Basic auth)
    if (!path.startsWith(API_PREFIX)) return null;

    if (!checkBasicAuth(req, config.tokenId, config.tokenPassword)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiPath = path.replace(API_PREFIX, "");
    const method = req.method;

    if (method === "GET" && apiPath === "/devices") {
      return handleGetDevices(store, url);
    }

    const deviceMatch = apiPath.match(/^\/devices\/([^/]+)$/);
    if (method === "GET" && deviceMatch) {
      return handleGetDevice(store, deviceMatch[1]);
    }

    if (method === "GET" && apiPath === "/control-units") {
      return Response.json(store.controlUnits);
    }

    const rebootMatch = apiPath.match(/^\/control-units\/([^/]+)\/reboot$/);
    if (method === "POST" && rebootMatch) {
      return handleControlUnitAction(store, rebootMatch[1], (cu) => {
        cu.online = true;
      });
    }

    const powerOffMatch = apiPath.match(/^\/control-units\/([^/]+)\/power-off$/);
    if (method === "POST" && powerOffMatch) {
      return handleControlUnitAction(store, powerOffMatch[1], (cu) => {
        cu.online = false;
      });
    }

    const restartSdMatch = apiPath.match(/^\/control-units\/([^/]+)\/restart-sd$/);
    if (method === "POST" && restartSdMatch) {
      return handleControlUnitAction(store, restartSdMatch[1], (cu) => {
        cu.online = true;
      });
    }

    return null;
  };
}

// -------------------------------------------------------------------------------------
// Handlers
// -------------------------------------------------------------------------------------

function handleGetDevices(store: SuitestStore, url: URL): Response {
  const page = Number(url.searchParams.get("page") ?? "1");
  const pagelen = Number(url.searchParams.get("pagelen") ?? "10");

  const start = (page - 1) * pagelen;
  const end = start + pagelen;
  const values = store.devices.slice(start, end);
  const total = store.devices.length;

  const body: Record<string, unknown> = { values, total, page, pagelen };

  if (end < total) {
    const nextUrl = new URL(url);
    nextUrl.searchParams.set("page", String(page + 1));
    body.next = nextUrl.toString();
  }

  return Response.json(body);
}

function handleGetDevice(store: SuitestStore, id: string): Response {
  const device = store.getDevice(decodeURIComponent(id));
  if (!device) return notFound("Device not found");
  const { deviceId: _, ...detail } = device;
  return Response.json(detail);
}

function handleControlUnitAction(store: SuitestStore, id: string, action: (cu: { online: boolean }) => void): Response {
  const cu = store.getControlUnit(decodeURIComponent(id));
  if (!cu) return notFound("Control unit not found");
  action(cu);
  return Response.json({});
}

async function handleAdminSetStatus(store: SuitestStore, req: Request, id: string): Promise<Response> {
  const body = (await req.json()) as { status?: string };
  if (!body.status) return Response.json({ error: "Missing status" }, { status: 400 });
  const ok = store.setDeviceStatus(id, body.status as any);
  if (!ok) return notFound("Device not found");
  return Response.json({ ok: true });
}
