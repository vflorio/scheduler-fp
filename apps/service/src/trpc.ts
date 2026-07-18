import type { Logger } from "@supervisor/core/logger";
import type { Services } from "@supervisor/trpc/context";
import { appRouter, t } from "@supervisor/trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/TaskEither";

// -------------------------------------------------------------------------------------
// Server
// -------------------------------------------------------------------------------------

export interface ServerConfig {
  readonly services: Services;
  readonly logger: Logger;
  readonly port: number;
  readonly hostname: string;
}

export const startServer = (config: ServerConfig) => {
  const { services, logger, port, hostname } = config;

  // Middleware is available for future use (e.g. authedProcedure)
  const _loggingMiddleware = createLoggingMiddleware(logger);

  const server = Bun.serve({
    port,
    hostname,
    fetch(request) {
      return fetchRequestHandler({
        endpoint: "/trpc",
        req: request,
        router: appRouter,
        createContext() {
          return {
            services,
            isLocalhost: true, //TODO: determina se è un servizio locale a fare la richiesta
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
      TE.flatMap(() => TE.fromIO(logger.info("tRPC server stopped"))),
    ),
  };
};

// -------------------------------------------------------------------------------------
// Middleware
// -------------------------------------------------------------------------------------

const createLoggingMiddleware = (logger: Logger) =>
  t.middleware(async ({ path, type, next }) => {
    const start = Date.now();
    const result = await next();
    const ms = Date.now() - start;

    if (result.ok) {
      logger.debug(`${type} ${path} - OK (${ms}ms)`)();
    } else {
      logger.error(`${type} ${path} - ERROR (${ms}ms)`)();
    }

    return result;
  });
