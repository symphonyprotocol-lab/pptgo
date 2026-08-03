/** What the dashboard needs about a deck, without its slides. Shared by client and server. */
export interface DeckSummary {
  id: string
  title: string
  slideCount: number
  byteSize: number
  /** bumped on every write to the document; a writer has to present the one it started from */
  version: number
  hasThumbnail: boolean
  createdAt: string
  updatedAt: string
}
