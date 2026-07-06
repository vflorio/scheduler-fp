import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as t from "io-ts";

const EnvCodec = t.type({
  VITE_LOG_LEVEL: t.keyof({
    debug: null,
    info: null,
    warning: null,
    error: null,
    silent: null,
  }),
});

const formatErrors = (errors: t.Errors): string =>
  errors
    .map(
      (e) =>
        `  ${e.context
          .map((c) => c.key)
          .filter(Boolean)
          .join(".")} : ${JSON.stringify(e.value)}`,
    )
    .join("\n");

export const config = pipe(
  EnvCodec.decode(import.meta.env),
  E.match(
    (errors) => {
      throw new Error(`Invalid environment configuration:\n${formatErrors(errors)}`);
    },
    (env) => ({
      logLevel: env.VITE_LOG_LEVEL,
    }),
  ),
);
