import "server-only"
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server"
import { registerTools } from "./tools"

/**
 * The MCP endpoint's server, built fresh for every request.
 *
 * `createMcpHandler` calls this factory once per serving unit and hands it the `authInfo`
 * the route passed in, which is where the deck owner comes from. Building per request is
 * what makes that safe: the tools close over one user's id for the life of one exchange,
 * so there is no shared server object whose idea of "who is calling" could be left over
 * from the previous caller.
 */

/** Stashed in `AuthInfo.extra`, which is the SDK's pass-through for exactly this. */
export const OWNER_KEY = "pptgoOwnerId"

/**
 * The origin the preview links point at.
 *
 * `AUTH_URL` is the address a person types, which behind compose is not the host name the
 * container sees on its own request — a link built from the incoming URL would send the
 * user to `http://web:3000`. The request is the fallback for a deployment that never set
 * it.
 */
function publicOrigin(request: Request | undefined): string {
  const configured = process.env.AUTH_URL
  if (configured) return configured.replace(/\/+$/, "")
  if (request) return new URL(request.url).origin
  return "http://localhost:3000"
}

export const mcpHandler = createMcpHandler((ctx) => {
  const server = new McpServer({ name: "pptgo", version: "1.0.0" })

  const ownerId = ctx.authInfo?.extra?.[OWNER_KEY]
  if (typeof ownerId !== "string") {
    // the route refuses unauthenticated requests before they reach here, so this is a
    // wiring mistake rather than a caller's — a server with no tools is a clearer symptom
    // than tools that read someone else's decks
    return server
  }

  registerTools(server, { ownerId, origin: publicOrigin(ctx.requestInfo) })
  return server
})
