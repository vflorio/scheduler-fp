import { router } from "./instance";

// Questi dipendono dall'instanza del router ma non possono stare in una closure
import { androidRouter } from "./routers/android";
import { registryRouter } from "./routers/device-registry";
import { logsRouter } from "./routers/logs";
import { settingsRouter } from "./routers/settings";

export * from "./instance";
export * from "./result";

// -------------------------------------------------------------------------------------
// Main App Router
// -------------------------------------------------------------------------------------

export const appRouter = router({
  android: androidRouter,
  registry: registryRouter,
  logs: logsRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;

// Questo risolve il type-error:
export type { TrackedData } from "@trpc/server/unstable-core-do-not-import";
// The inferred type of 'appRouter' cannot be named without a reference to 'TrackedData' from '../node_modules/@trpc/server/dist/unstable-core-do-not-import.d-BdVSvUCr.mjs'.
// This is likely not portable. A type annotation is necessary.ts(2883)
