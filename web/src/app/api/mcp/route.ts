import { bearerToken, userFromBearer } from "@/lib/api-token"
import { OWNER_KEY, mcpHandler } from "@/lib/mcp/server"

/**
 * The MCP endpoint.
 *
 * `WebStandardStreamableHTTPServerTransport` takes a `Request` and resolves a `Response`,
 * which is already what a route handler is — so the protocol needs no adapter here, and
 * the tools behind it call `lib/decks.ts` directly instead of coming back in through the
 * HTTP API. One process, one set of owner-scoped queries.
 *
 * Authentication is this route's job, not the handler's: the SDK is explicit that
 * `authInfo` is strictly pass-through and that it verifies nothing itself.
 */

/** Only the session cookie reaches the rest of the app; only a token reaches this. */
async function serve(request: Request): Promise<Response> {
  const user = await userFromBearer(request)
  if (!user) {
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32001, message: "A valid pptgo API token is required." },
        id: null,
      },
      {
        status: 401,
        // says how to authenticate rather than only that you did not; clients that follow
        // the MCP authorization spec look for this header before giving up
        headers: { "WWW-Authenticate": 'Bearer realm="pptgo"' },
      },
    )
  }

  return mcpHandler.fetch(request, {
    authInfo: {
      // already verified above; the SDK keeps it for handlers that want the raw token
      token: bearerToken(request) ?? "",
      clientId: "pptgo-api-token",
      scopes: [],
      extra: { [OWNER_KEY]: user.id },
    },
  })
}

export const POST = serve
export const GET = serve
export const DELETE = serve
