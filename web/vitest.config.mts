import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  test: {
    // sanitising, rich-text parsing and media export all use real DOM APIs
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws on import outside a React Server Component. It is a build-time
      // guard rail, and under vitest there is no client bundle for it to be guarding — so
      // it is stubbed out rather than allowed to fail every server module's tests.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
})
