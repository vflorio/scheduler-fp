import type { AppRouter } from "@supervisor/trpc/server";
import { createTRPCProxyClient, httpBatchLink, httpSubscriptionLink, splitLink } from "@trpc/client";

const getBaseUrl = () => (typeof window !== "undefined" ? "" : `http://localhost:${import.meta.env.PORT ?? 3000}`);

const url = `${getBaseUrl()}/api/trpc`;

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === "subscription",
      true: httpSubscriptionLink({ url }),
      false: httpBatchLink({ url }),
    }),
  ],
});
