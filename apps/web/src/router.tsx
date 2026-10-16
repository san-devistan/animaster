import { authClient } from "@/lib/auth-client"
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"
import { ConvexQueryClient } from "@convex-dev/react-query"
import { QueryClient } from "@tanstack/react-query"
import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"
import type { ReactNode } from "react"

import { routeTree } from "./routeTree.gen"

let didWarnMissingConvexUrl = false

function warnMissingConvexUrl() {
  if (didWarnMissingConvexUrl) {
    return
  }

  didWarnMissingConvexUrl = true
  console.warn(
    "VITE_CONVEX_URL is not set. Convex is disabled for apps/web; set it when this app needs the Convex backend."
  )
}

export function getRouter() {
  const convexUrl = import.meta.env.VITE_CONVEX_URL
  // Queries wait for the player's token instead of running signed out first.
  const convexQueryClient = convexUrl
    ? new ConvexQueryClient(convexUrl, { expectAuth: true })
    : null

  if (!convexQueryClient) {
    warnMissingConvexUrl()
  }

  const queryClient = new QueryClient(
    convexQueryClient
      ? {
          defaultOptions: {
            queries: {
              queryKeyHashFn: convexQueryClient.hashFn(),
              queryFn: convexQueryClient.queryFn(),
            },
          },
        }
      : undefined
  )

  convexQueryClient?.connect(queryClient)
  // Opens the socket now, paused until the token comes, so its handshake runs
  // alongside the auth calls instead of after them.
  if (typeof window !== "undefined") {
    convexQueryClient?.convexClient.connectionState()
  }

  function ConvexProviderWrapper({ children }: { children: ReactNode }) {
    if (!convexQueryClient) {
      return <>{children}</>
    }

    return (
      <ConvexBetterAuthProvider
        client={convexQueryClient.convexClient}
        authClient={authClient}
      >
        {children}
      </ConvexBetterAuthProvider>
    )
  }

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    Wrap: ConvexProviderWrapper,
  })

  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
