import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import type { AdapterAccountType } from "next-auth/adapters"

/**
 * The four auth tables mirror `@auth/drizzle-adapter`'s default Postgres shape
 * (column names included — the adapter queries them by name). They live here rather
 * than being inferred so drizzle-kit can generate migrations for them.
 *
 * The adapter also knows an `authenticator` table for WebAuthn; pptgo only offers
 * Google sign-in, so it is deliberately absent.
 */
export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
})

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
)

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
})

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (token) => [primaryKey({ columns: [token.identifier, token.token] })],
)

/**
 * Deck *metadata*. The slides themselves are a JSON document in object storage —
 * a deck with embedded images runs to megabytes, which is a blob, not a row. Postgres
 * keeps what the dashboard lists and sorts by; rustfs keeps the bytes.
 */
export const decks = pgTable(
  "deck",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ownerId: text("ownerId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slideCount: integer("slideCount").notNull().default(1),
    /** size of the stored JSON document, shown in the dashboard */
    byteSize: integer("byteSize").notNull().default(0),
    /** object key of the deck JSON in the bucket */
    objectKey: text("objectKey").notNull(),
    /** object key of the first-slide PNG, null until the editor has rendered one */
    thumbnailKey: text("thumbnailKey"),
    /**
     * Bumped on every write to the document, and the value a writer has to present to be
     * allowed to write. Two editors open on one deck used to overwrite each other in
     * silence — the autosave sends the whole document, so the slower one simply won.
     * A writer now says which version it started from and is refused if that is no longer
     * current, which is also what lets a reader poll for "has this moved" without
     * fetching megabytes of slides.
     */
    version: integer("version").notNull().default(1),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // the dashboard's only query: this owner's decks, newest edit first
  (deck) => [index("deck_owner_updated_idx").on(deck.ownerId, deck.updatedAt)],
)

export type DeckRow = typeof decks.$inferSelect

/**
 * Long-lived credentials for clients that have no browser.
 *
 * Everything else here authenticates with the Auth.js session cookie, which a headless
 * client cannot hold: there is no browser to run the Google redirect and nowhere to keep
 * the cookie afterwards. A token is the same user by another door.
 *
 * Only the hash is stored. Sessions keep their token verbatim and get away with it because
 * they expire in weeks and live in one browser; these are meant to sit in a config file
 * for months, so a leaked database should not hand over working credentials. The plaintext
 * exists once, in the response that creates it.
 */
export const apiTokens = pgTable(
  "apiToken",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ownerId: text("ownerId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** what the reader called it — "Claude Desktop", "laptop" */
    name: text("name").notNull(),
    /** sha256 of the token, hex. The lookup is by this, so it is unique and indexed */
    tokenHash: text("tokenHash").notNull().unique(),
    /** the opening characters of the plaintext, so a row can be told from its siblings */
    prefix: text("prefix").notNull(),
    /** null until first use; written at most once every few minutes, never on the hot path */
    lastUsedAt: timestamp("lastUsedAt", { mode: "date", withTimezone: true }),
    /** null means it does not expire on its own */
    expiresAt: timestamp("expiresAt", { mode: "date", withTimezone: true }),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (token) => [index("apiToken_owner_idx").on(token.ownerId)],
)

export type ApiTokenRow = typeof apiTokens.$inferSelect

/**
 * One deck, opened up to people who are not signed in.
 *
 * Everything else here is owner-scoped: a deck is readable by exactly one account. A share
 * is the deliberate hole in that — a URL that carries its own permission, so a colleague
 * can look at a deck (or work on it) without an account of their own.
 *
 * **One row per deck.** Changing the mode or the password edits this row rather than
 * issuing a second link, so "is this deck shared?" has one answer and revoking is one
 * delete. Several links with different powers is a bigger idea than the dashboard's single
 * "shared" mark can honestly show.
 *
 * **The token is stored in the clear**, unlike an API token, because the owner has to be
 * able to come back tomorrow and copy their own link again. It is a capability, not a
 * credential to be proven: whoever holds it is who it was meant for.
 */
export const deckShares = pgTable(
  "deckShare",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** unique: one share per deck, so revoking is one row and the mark is one boolean */
    deckId: text("deckId")
      .notNull()
      .unique()
      .references(() => decks.id, { onDelete: "cascade" }),
    ownerId: text("ownerId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** the secret in the URL. Looked up by this, so it is unique and indexed */
    token: text("token").notNull().unique(),
    /** `read` or `edit` — what the link lets a visitor do to the deck */
    mode: text("mode").notNull().default("read"),
    /**
     * PBKDF2 of the passphrase, null when the link asks for none. Salted and slow, unlike
     * the API token's bare sha256: that hashes 256 bits of randomness, this hashes
     * something a person typed and could plausibly be guessed at.
     */
    passwordHash: text("passwordHash"),
    passwordSalt: text("passwordSalt"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (share) => [index("deckShare_owner_idx").on(share.ownerId)],
)

export type DeckShareRow = typeof deckShares.$inferSelect
