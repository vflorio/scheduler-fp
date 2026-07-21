import * as Logger from "@supervisor/core/logger";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as Args from "./args";
import * as Config from "./config";
import * as ServiceLogger from "./logger";
import type * as Node from "./node";
import * as SupervisorService from "./service";

const initLogger: Logger.Tagged = pipe(ServiceLogger.create({ level: "debug" }), Logger.tagged("Service"));

const nodeProcess: Node.Process = {
  onSignal: (signal, handler) => process.on(signal, handler),
  exit: (code) => process.exit(code),
};

// -------------------------------------------------------------------------------------
// Entry point
// -------------------------------------------------------------------------------------

const main = () => {
  const argsResult = Args.parse(process.argv);

  if (E.isLeft(argsResult)) {
    initLogger.error(argsResult.left)();
    nodeProcess.exit(1);
  }

  const args = argsResult.right;

  const env: SupervisorService.Env = {
    logger: initLogger,
    process: nodeProcess,
    configFetcher: Config.toFetcher(args.config),
  };

  env.logger.info(
    `Starting service (config: ${args.config.type}://${args.config.type === "file" ? args.config.path : args.config.url})`,
  )();

  const run = async (): Promise<void> => {
    const result = await SupervisorService.create(env)();

    if (E.isLeft(result)) {
      env.logger.error(JSON.stringify(result.left))();
      env.process.exit(1);
    }

    const handle = result.right;

    // Restart: SIGHUP ferma il runner corrente e rilancia
    env.process.onSignal("SIGHUP", () => {
      env.logger.info("Received SIGHUP - triggering restart")();
      handle.stop();
      run();
    });

    // Shutdown: SIGINT ferma e termina il processo
    env.process.onSignal("SIGINT", () => {
      env.logger.info("Received SIGINT - shutting down")();
      handle.stop();
      env.process.exit(0);
    });
  };

  run();
};

main();
