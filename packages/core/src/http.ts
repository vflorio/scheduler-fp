import * as TE from "fp-ts/TaskEither";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export type HTTPError = {
  type: "HTTPError";
  error: string;
};

// -------------------------------------------------------------------------------------
// Constructors
// -------------------------------------------------------------------------------------

const toHTTPError = (error: unknown): HTTPError => ({
  type: "HTTPError",
  error: error instanceof Error ? error.message : `${error}`,
});

const request = (url: string, init?: RequestInit): TE.TaskEither<HTTPError, unknown> =>
  TE.tryCatch(async () => {
    const response = await fetch(url, init);
    if (!response.ok) throw new Error(`Status: ${response.status} Message: ${await response.text()}`);
    const text = await response.text();
    return text.length > 0 ? JSON.parse(text) : undefined;
  }, toHTTPError);

// -------------------------------------------------------------------------------------
// Clients
// -------------------------------------------------------------------------------------

// Unauthenticated

export const getJson = (url: string): TE.TaskEither<HTTPError, unknown> => request(url);

// Authenticated

export interface BasicAuth {
  readonly tokenId: string;
  readonly tokenPassword: string;
}

const authHeaders = (auth: BasicAuth): HeadersInit => ({
  Authorization: `Basic ${btoa(`${auth.tokenId}:${auth.tokenPassword}`)}`,
  "Content-Type": "application/json",
});

export const getJsonAuth = (url: string, auth: BasicAuth): TE.TaskEither<HTTPError, unknown> =>
  request(url, { headers: authHeaders(auth) });

export const postJsonAuth = (url: string, auth: BasicAuth, body?: unknown): TE.TaskEither<HTTPError, unknown> =>
  request(url, {
    method: "POST",
    headers: authHeaders(auth),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

// Bearer token

export const postJsonBearer = (url: string, token: string, body?: unknown): TE.TaskEither<HTTPError, unknown> =>
  request(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
