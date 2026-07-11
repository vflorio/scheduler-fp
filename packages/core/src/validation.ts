import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import type * as t from "io-ts";

// -------------------------------------------------------------------------------------
// Validation
// -------------------------------------------------------------------------------------

export type ValidationError = {
  type: "ValidationError";
  message: string;
};

export const createValidationError = (errors: t.Errors): ValidationError => ({
  type: "ValidationError",
  message: `Validation Failed: ${errors.map((e) => e.context.map(({ key }) => key).join(".")).join(", ")}`,
});

export const validate =
  <A>(codec: t.Type<A, unknown>) =>
  (data: unknown): E.Either<ValidationError, A> =>
    pipe(data, codec.decode, E.mapLeft(createValidationError));
