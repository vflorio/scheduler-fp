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

export const getJson = (url: string): TE.TaskEither<HTTPError, unknown> => request(url);

// Basic auth

export interface BasicAuth {
  readonly tokenId: string;
  readonly tokenPassword: string;
}

const basicAuthHeaders = (auth: BasicAuth): Record<string, string> => ({
  Authorization: `Basic ${btoa(`${auth.tokenId}:${auth.tokenPassword}`)}`,
  "Content-Type": "application/json",
});

export const getJsonAuth = (url: string, auth: BasicAuth): TE.TaskEither<HTTPError, unknown> =>
  request(url, { headers: basicAuthHeaders(auth) });

export const postJsonBasic = (url: string, auth: BasicAuth, body?: unknown): TE.TaskEither<HTTPError, unknown> =>
  request(url, {
    method: "POST",
    headers: basicAuthHeaders(auth),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

// Bearer auth

export interface BearerAuth {
  readonly token: string;
}

const bearerAuthHeaders = (auth: BearerAuth): Record<string, string> => ({
  Authorization: `Bearer ${auth.token}`,
  "Content-Type": "application/json",
});

export const postJsonBearer = (url: string, auth: BearerAuth, body?: unknown): TE.TaskEither<HTTPError, unknown> =>
  request(url, {
    method: "POST",
    headers: bearerAuthHeaders(auth),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
