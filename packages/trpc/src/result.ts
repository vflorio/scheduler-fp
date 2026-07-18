import * as E from "fp-ts/Either";
import type * as TE from "fp-ts/TaskEither";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

/**
 * Base constraint for all API errors.
 * Every error must carry a literal `type` discriminant for exhaustive matching.
 */
export interface TaggedError {
  readonly type: string;
  readonly message: string;
}

export type ApiResult<A, Err extends TaggedError = TaggedError> =
  | { readonly ok: true; readonly data: A }
  | { readonly ok: false; readonly error: Err };

// -------------------------------------------------------------------------------------
// Constructors
// -------------------------------------------------------------------------------------

export const ok = <A>(data: A): ApiResult<A, never> => ({ ok: true, data });

export const fail = <Err extends TaggedError>(error: Err): ApiResult<never, Err> => ({
  ok: false,
  error,
});

// -------------------------------------------------------------------------------------
// Smart Constructors
// -------------------------------------------------------------------------------------

export const fromTaskEither = <Err extends TaggedError, A>(te: TE.TaskEither<Err, A>): Promise<ApiResult<A, Err>> =>
  te().then(
    E.fold(
      (e): ApiResult<A, Err> => ({ ok: false, error: e }),
      (a): ApiResult<A, Err> => ({ ok: true, data: a }),
    ),
  );
