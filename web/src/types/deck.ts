/** What the dashboard needs about a deck, without its slides. Shared by client and server. */
export interface DeckSummary {
  id: string
  title: string
  slideCount: number
  byteSize: number
  hasThumbnail: boolean
  createdAt: string
  updatedAt: string
}
