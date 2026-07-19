import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import * as t from "io-ts";
import { type BasicAuth, getJsonAuth, type HTTPError } from "../http";
import type * as Logger from "../logger";

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

export interface PaginationError {
  readonly type: "PaginationError";
  readonly message: string;
}

export type PaginationFetchError = HTTPError | PaginationError;

const createPaginationError = (errors: t.Errors): PaginationFetchError => ({
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
  logger?: Logger.Tagged,
): TE.TaskEither<PaginationFetchError, PaginatedResponse<A>> =>
  pipe(
    logger ? TE.fromIO(logger.debug(`GET ${url}`)) : TE.right(undefined),
    TE.flatMap(() => getJsonAuth(url, auth)),
    TE.flatMapEither((data) => pipe(PaginatedResponseSchema(itemCodec).decode(data), E.mapLeft(createPaginationError))),
    TE.tapIO((page) =>
      logger
        ? logger.debug(`  -> page ${page.page ?? 1}: ${page.values.length} items (total: ${page.total ?? "?"})`)
        : () => {},
    ),
    TE.tapError((err) => (logger ? TE.fromIO(logger.error(`  ✗ ${err.message}`)) : TE.right(undefined))),
  );

// -------------------------------------------------------------------------------------
// Auto-pagination - accumulates all pages following "next"
// -------------------------------------------------------------------------------------

// Recupera tutti gli elementi iterando automaticamente sulle pagine
export const fetchAllPages = <A>(
  initialUrl: string,
  auth: BasicAuth,
  itemCodec: t.Type<A, unknown>,
  logger?: Logger.Tagged,
): TE.TaskEither<PaginationFetchError, readonly A[]> => {
  const go = (url: string, acc: readonly A[]): TE.TaskEither<PaginationFetchError, readonly A[]> =>
    pipe(
      fetchPage(url, auth, itemCodec, logger),
      TE.flatMap((page) => {
        const merged = [...acc, ...page.values];
        return page.next ? go(page.next, merged) : TE.right(merged);
      }),
    );

  return go(initialUrl, []);
};
