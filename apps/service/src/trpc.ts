import type * as Logger from "@supervisor/core/logger";
import type { Services } from "@supervisor/core/services";
import type * as Trpc from "@supervisor/trpc/server";
import { appRouter } from "@supervisor/trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/TaskEither";

// -------------------------------------------------------------------------------------
// Server
// -------------------------------------------------------------------------------------

export interface Deps {
  readonly services: Services;
  readonly logger: Logger.Tagged;
  readonly port: number;
  readonly hostname: string;
}

export const startServer = (deps: Deps) => {
  const { services, logger, port, hostname } = deps;

  const server = Bun.serve({
    port,
    hostname,
    fetch(request) {
      const url = new URL(request.url);
      return fetchRequestHandler({
        endpoint: "/trpc",
        req: request,
        router: appRouter,
        createContext(): Trpc.Context {
          return {
            services,
            logger: logger.child("http"),
            isLocalhost: url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1",
          };
        },
      });
    },
  });

  logger.info(`listening on http://${hostname}:${port}/trpc`)();

  return {
    stop: pipe(
      TE.tryCatch(
        () => server.stop(),
        (reason) => ({
          type: "ServerStopError" as const,
          message: String(reason),
        }),
      ),
      TE.flatMapIO(() => logger.info("tRPC server stopped")),
    ),
  };
};
