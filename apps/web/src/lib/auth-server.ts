import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start"

declare const process: { env: Record<string, string | undefined> }

export const { handler } = convexBetterAuthReactStart({
  convexUrl: process.env.VITE_CONVEX_URL ?? "",
  convexSiteUrl: process.env.VITE_CONVEX_SITE_URL ?? "",
})
