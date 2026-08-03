/**
 * What the settings page shows about a token. Shared by client and server — and
 * deliberately without the token itself, which exists only in the response that created it.
 */
export interface ApiTokenSummary {
  id: string
  name: string
  /** the opening characters of the plaintext, e.g. `pptgo_7f3a9c` */
  prefix: string
  lastUsedAt: string | null
  expiresAt: string | null
  /**
   * Whether `expiresAt` has passed, decided on the server.
   *
   * Not derived in the component: "now" during a render is neither stable nor the same on
   * both sides of hydration, and the server is where the same clock decides whether the
   * token still authenticates. A token that expires while this page sits open keeps its
   * badge until the page is reloaded, which is the right trade for a settings screen.
   */
  expired: boolean
  createdAt: string
}
