import * as CoreLogger from "@supervisor/core/logger";
import type { BunRequest } from "bun";
import * as IO from "fp-ts/IO";
import { pipe } from "fp-ts/lib/function";
import { slackRoutes } from "./slack/routes";
import { SlackStore } from "./slack/store";
import { suitestRoutes } from "./suitest/routes";
import { SuitestStore } from "./suitest/store";

const PORT = Number(import.meta.env.PORT ?? 4400);

const SUITEST_TOKEN_ID = import.meta.env.SUITEST_TOKEN_ID ?? "dev-suitest-token-id";
const SUITEST_TOKEN_PASSWORD = import.meta.env.SUITEST_TOKEN_PASSWORD ?? "dev-suitest-token-password";
const SLACK_BOT_TOKEN = import.meta.env.SLACK_BOT_TOKEN ?? "dev-slack-token";

// -------------------------------------------------------------------------------------
// Stores
// -------------------------------------------------------------------------------------

const suitestStore = new SuitestStore();
const slackStore = new SlackStore();

// -------------------------------------------------------------------------------------
// Service routes
// -------------------------------------------------------------------------------------

const routeSuitest = suitestRoutes(suitestStore, { tokenId: SUITEST_TOKEN_ID, tokenPassword: SUITEST_TOKEN_PASSWORD });
const routeSlack = slackRoutes(slackStore, { botToken: SLACK_BOT_TOKEN });

// -------------------------------------------------------------------------------------
// Server
// -------------------------------------------------------------------------------------

const startLogger: CoreLogger.Tagged = CoreLogger.tagged(CoreLogger.createConsoleLogger("debug"), "Service");
const logger = startLogger.child("MockServices");

const withISE = (router: (request: Request) => Response | Promise<Response> | null) => (request: BunRequest) =>
  router(request) ?? Response.json({ error: "Internal Server Error" }, { status: 500 });

pipe(
  IO.of(
    Bun.serve({
      port: PORT,
      //fetch: route,
      routes: {
        "/": () => Response.json(["/v1/suitest/*", "/v1/slack/*"]),
        "/v1/suitest/*": (request: BunRequest<"/v1/suitest/*">) => withISE(routeSuitest)(request),
        "/v1/slack/*": (request: BunRequest<"/v1/slack/*">) => withISE(routeSlack)(request),
      },
    }),
  ),
  IO.flatMap(({ port, hostname, protocol }) => logger.info(`Running on ${protocol}://${hostname}:${port}`)),
  IO.flatMap(() => logger.info(`   Suitest: /suitest/*`)),
  IO.flatMap(() => logger.info(`   Slack:   /slack/*`)),
  IO.flatMap(() => logger.info(`   Admin:   /_admin/reset | /_admin/devices/:id/status | /_admin/slack/messages`)),
)();
