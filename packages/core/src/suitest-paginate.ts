import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import * as t from "io-ts";
import { type BasicAuth, getJsonAuth, type HTTPError } from "./http";

// -------------------------------------------------------------------------------------
// Model - Paginated response
// -------------------------------------------------------------------------------------

const PaginatedResponseSchema = <C extends t.Mixed>(itemCodec: C) =>
  t.intersection([
    t.type({ values: t.array(itemCodec) }),
    t.partial({
      total: t.number,
      page: t.number,
      pagelen: t.number,
      next: t.string,
      previous: t.string,
    }),
  ]);

export interface PaginatedResponse<A> {
  readonly values: readonly A[];
  readonly total?: number;
  readonly page?: number;
  readonly pagelen?: number;
  readonly next?: string;
  readonly previous?: string;
}

// -------------------------------------------------------------------------------------
// Errors
// -------------------------------------------------------------------------------------

export type PaginationError = HTTPError | { type: "PaginationError"; message: string };

const createPaginationError = (errors: t.Errors): PaginationError => ({
  type: "PaginationError",
  message: `Pagination failed: ${errors.map((e) => e.context.map(({ key }) => key).join(".")).join(", ")}`,
});

// -------------------------------------------------------------------------------------
// Single page - fetch and validate by URL
// -------------------------------------------------------------------------------------

const fetchPage = <A>(
  url: string,
  auth: BasicAuth,
  itemCodec: t.Type<A, unknown>,
): TE.TaskEither<PaginationError, PaginatedResponse<A>> =>
  pipe(
    getJsonAuth(url, auth),
    TE.flatMapEither((data) => pipe(PaginatedResponseSchema(itemCodec).decode(data), E.mapLeft(createPaginationError))),
  );

// -------------------------------------------------------------------------------------
// Auto-pagination - accumulates all pages following "next"
// -------------------------------------------------------------------------------------

// Recupera tutti gli elementi iterando automaticamente sulle pagine
export const fetchAllPages = <A>(
  initialUrl: string,
  auth: BasicAuth,
  itemCodec: t.Type<A, unknown>,
): TE.TaskEither<PaginationError, readonly A[]> => {
  const go = (url: string, acc: readonly A[]): TE.TaskEither<PaginationError, readonly A[]> =>
    pipe(
      fetchPage(url, auth, itemCodec),
      TE.flatMap((page) => {
        const merged = [...acc, ...page.values];
        return page.next ? go(page.next, merged) : TE.right(merged);
      }),
    );

  return go(initialUrl, []);
};
