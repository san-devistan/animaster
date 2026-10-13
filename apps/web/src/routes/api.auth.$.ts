import { handler } from "@/lib/auth-server"
import { createFileRoute } from "@tanstack/react-router"

// Better Auth's endpoints, forwarded to Convex. Connection-level headers are
// dropped: HTTP/2 forbids them, and the local https proxy can reject them.
const forward = async (request: Request) => {
  const response = await handler(request)
  const headers = new Headers(response.headers)
  for (const name of ["connection", "keep-alive", "transfer-encoding"]) {
    headers.delete(name)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => forward(request),
      POST: ({ request }) => forward(request),
    },
  },
})
