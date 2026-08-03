import NextAuth, { type Session } from "next-auth"
import Google from "next-auth/providers/google"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "@/db"
import { accounts, sessions, users, verificationTokens } from "@/db/schema"

/**
 * Cookie-signing key for a machine that has no `.env.local` yet. A fresh clone is supposed
 * to reach the editor with `npm install && npm run dev`, and without this Auth.js throws
 * `MissingSecret` on every page that reads a session — which is `/` and `/login`.
 *
 * It is deliberately named to be unusable by accident: it only applies outside production,
 * and compose refuses to start without a real `AUTH_SECRET`. Anything signed with this is
 * forgeable, so never run a reachable server with `NODE_ENV=development`.
 */
const DEV_SECRET = "pptgo-development-only-insecure-secret"

/**
 * Google is the only provider. Auth.js picks up `AUTH_GOOGLE_ID` /
 * `AUTH_GOOGLE_SECRET` / `AUTH_SECRET` from the environment on its own.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret:
    process.env.AUTH_SECRET ||
    (process.env.NODE_ENV === "production" ? undefined : DEV_SECRET),
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [Google],
  // sessions are rows in Postgres, not a self-contained JWT: signing out or deleting a
  // user takes effect immediately, and the dashboard can join decks to the session user
  session: { strategy: "database" },
  pages: { signIn: "/login", error: "/login" },
  // behind compose the app sees an internal host name; without this Auth.js refuses to
  // build the OAuth callback URL
  trustHost: true,
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id
      return session
    },
  },
})

export interface SessionUser {
  id: string
  name: string | null
  email: string | null
  image: string | null
}

/**
 * The signed-in user, or null. Callers decide what to do when absent.
 *
 * In development a broken auth config resolves to "signed out" rather than a 500: a fresh
 * clone has no `.env.local`, and `npm run dev` is supposed to get you into the editor
 * without first registering an OAuth client. `/` and `/login` only *optionally* show a
 * signed-in state, so there is nothing for them to fail over.
 *
 * In production the same failure is a deployment error and rethrows — silently serving a
 * signed-out app to everyone is far worse than a loud one. (compose already refuses to
 * start without AUTH_SECRET, so this is the second line, not the first.)
 */
export async function currentUser(): Promise<SessionUser | null> {
  // not `ReturnType<typeof auth>` — `auth` is overloaded and that picks its middleware form
  let session: Session | null = null
  try {
    session = await auth()
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error
    console.warn(
      `[auth] 会话读取失败，按未登录继续：${(error as Error).message}\n` +
        `        需要登录功能的话，复制 web/.env.example 到 web/.env.local 并填好 AUTH_SECRET。`,
    )
    return null
  }

  const user = session?.user
  if (!user?.id) return null
  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    image: user.image ?? null,
  }
}
