"use server"

import { redirect } from "next/navigation"
import { signIn, signOut } from "@/auth"

/**
 * `next` reaches this from a query string, so it is treated as hostile: only a
 * single-slash absolute path gets through, which rules out `//evil.com` and anything
 * carrying a scheme.
 */
function safePath(next: unknown): string {
  if (typeof next !== "string") return "/dashboard"
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard"
  return next
}

export async function signInWithGoogle(formData: FormData) {
  // Without a client id Auth.js still builds the redirect and hands the user to Google,
  // which answers with its own `invalid_client` page. Catching it here keeps the
  // explanation on our own sign-in page instead.
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    redirect("/login?error=Configuration")
  }

  await signIn("google", { redirectTo: safePath(formData.get("next")) })
}

export async function signOutEverywhere() {
  await signOut({ redirectTo: "/" })
}
