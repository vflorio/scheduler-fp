import type { AndroidBridge } from "@supervisor/core/services/android-bridge";

// -------------------------------------------------------------------------------------
// tRPC Context
// -------------------------------------------------------------------------------------

export interface Services {
  readonly android: AndroidBridge;
}

export interface Context {
  readonly services: Services;
  readonly isLocalhost: boolean;
}
