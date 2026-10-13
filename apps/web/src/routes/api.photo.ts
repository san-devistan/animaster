import { createFileRoute } from "@tanstack/react-router"

const HOSTS = new Set([
  "commons.wikimedia.org",
  "en.wikipedia.org",
  "upload.wikimedia.org",
  "inaturalist-open-data.s3.amazonaws.com",
  "static.inaturalist.org",
])

// Species photos are drawn into WebGL canvases. Some hosts (and Wikipedia's
// redirect hops) do not send CORS headers, so serve them from this origin.
export const Route = createFileRoute("/api/photo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url).searchParams.get("url")
        const target = url ? URL.parse(url) : null
        if (target?.protocol !== "https:" || !HOSTS.has(target.hostname)) {
          return new Response("Unsupported photo URL", { status: 400 })
        }
        const response = await fetch(target, {
          headers: { "user-agent": "Animaster/0.1 (https://animaster.app)" },
        })
        if (
          !response.ok ||
          !response.headers.get("content-type")?.startsWith("image/")
        ) {
          return new Response("Photo unavailable", { status: 502 })
        }
        return new Response(response.body, {
          headers: {
            "cache-control": "public, max-age=86400",
            "content-type":
              response.headers.get("content-type") ?? "image/jpeg",
          },
        })
      },
    },
  },
})
