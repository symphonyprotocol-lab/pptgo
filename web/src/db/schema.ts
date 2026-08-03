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
