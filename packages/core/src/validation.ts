import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import type * as t from "io-ts";
import { type AppError, of } from "./errors";

// -------------------------------------------------------------------------------------
// Validation
//
// Errore condiviso per ogni decodifica io-ts fallita nel progetto (config, db, risposte
// paginate, ...): un solo tag "ValidationError" per un'unica causa semantica, invece di
// un tipo diverso per ogni modulo che decodifica qualcosa.
// -------------------------------------------------------------------------------------

export interface ValidationError extends AppError<"ValidationError"> {}

export const createValidationError = (errors: t.Errors): ValidationError =>
  of("ValidationError")(
    `Validation Failed: ${errors.map((e) => e.context.map(({ key }) => key).join(".")).join(", ")}`,
  );

export const validate =
  <A>(codec: t.Type<A, unknown>) =>
  (data: unknown): E.Either<ValidationError, A> =>
    pipe(data, codec.decode, E.mapLeft(createValidationError));
