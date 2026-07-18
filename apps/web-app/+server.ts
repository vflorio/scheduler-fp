import { authjsHandler, authjsSessionMiddleware } from "./server/authjs-handler";
import { trpcHandler } from "./server/trpc-handler";
import vike, { toFetchHandler } from "@vikejs/express";
import express from "express";
import type { Server } from "vike/types";

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

function getHandler() {
  const app = express();

  vike(app, [
    // Append Auth.js session to context
    authjsSessionMiddleware,
    // Auth.js route. See https://authjs.dev/getting-started/installation
    authjsHandler,
    // tRPC route. See https://trpc.io/docs/server/adapters
    trpcHandler("/api/trpc"),
  ]);

  return toFetchHandler(app);
}

// https://vike.dev/server
export default {
  fetch: getHandler(),
  prod: { port },
} as Server;
