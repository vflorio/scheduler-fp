import * as E from "fp-ts/Either";

// -------------------------------------------------------------------------------------
// Args
// -------------------------------------------------------------------------------------

export type ConfigSource = { type: "file"; path: string } | { type: "url"; url: string };

export const parseArgs = (argv: string[]): E.Either<string, ConfigSource> => {
  const args = argv.slice(2);

  let configFile: string | undefined;
  let configUrl: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--config" && args[i + 1]) {
      configFile = args[++i];
    } else if (args[i] === "--config-url" && args[i + 1]) {
      configUrl = args[++i];
    }
  }

  if (configUrl) return E.right({ type: "url", url: configUrl });
  if (configFile) return E.right({ type: "file", path: configFile });

  return E.left("Usage: service --config <path> | --config-url <url>");
};
