/**
 * Stands in for the `server-only` package under vitest. The real module throws when it is
 * imported from anywhere but a React Server Component, which is a bundler-level guard with
 * nothing to protect in a test run.
 */
export {}
