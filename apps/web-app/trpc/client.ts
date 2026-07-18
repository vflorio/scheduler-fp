import type { AppRouter } from "@supervisor/trpc/server";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";

const getBaseUrl = () => (typeof window !== "undefined" ? "" : `http://localhost:${import.meta.env.PORT ?? 3000}`);

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${getBaseUrl()}/api/trpc`,
    }),
  ],
});
