import { ThemeProvider } from "@/components/theme-provider"
import type { QueryClient } from "@tanstack/react-query"
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router"
import appCss from "@workspace/ui/globals.css?url"
import { useEffect } from "react"

const edgeSwipeZone = 24

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      {
        title: "Musi Master",
      },
      { name: "theme-color", content: "#d5c3f8" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Musi Master" },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "black-translucent",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
    ],
  }),
  notFoundComponent: () => (
    <main className="p-4 pt-16 container mx-auto">
      <h1>404</h1>
      <p>The requested page could not be found.</p>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // iOS Safari only skips its edge back/forward swipe when the edge touchstart is cancelled.
    const blockEdgeSwipe = (event: TouchEvent) => {
      const x = event.touches[0]?.clientX
      if (x === undefined) return
      if (x < edgeSwipeZone || x > window.innerWidth - edgeSwipeZone) {
        event.preventDefault()
      }
    }
    document.addEventListener("touchstart", blockEdgeSwipe, { passive: false })
    return () => document.removeEventListener("touchstart", blockEdgeSwipe)
  }, [])

  return (
    <html lang="en" className="game-backdrop-floor" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="h-dvh overflow-hidden overscroll-none bg-lavender text-foreground antialiased">
        <ThemeProvider defaultTheme="light" enableSystem={false}>
          {children}
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}
