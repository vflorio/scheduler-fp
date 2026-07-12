import type * as IO from "fp-ts/IO";

export interface Logger {
  readonly info: (message: string) => IO.IO<void>;
  readonly error: (message: string) => IO.IO<void>;
}
