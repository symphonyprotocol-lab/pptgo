/** What a share link lets its holder do. Shared by client and server. */
export type ShareMode = "read" | "edit"

/**
 * A deck's share link, as the owner's dashboard sees it.
 *
 * The passphrase is a boolean here and nowhere a string: the server keeps a PBKDF2 hash
 * and could not send the original back even if a screen wanted to show it.
 */
export interface Share {
  deckId: string
  mode: ShareMode
  hasPassword: boolean
  /** the path a visitor opens; the client puts its own origin in front of it */
  path: string
  createdAt: string
  updatedAt: string
}
