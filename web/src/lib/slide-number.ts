/**
 * A slide's number, padded to the width of the last one.
 *
 * "Slide 9 of 10" and "Slide 10 of 10" are different widths, so a counter that sits beside
 * a thumbnail rail shifts everything after it by a character as you page — visible as a
 * twitch, on every single turn, in the one part of the screen that is meant to be still.
 * Padding the number holds the column.
 *
 * Visual only. Screen readers announce a padded number as the digits it is written with,
 * so anywhere the count is read rather than seen — an aria-label, a page title — wants the
 * plain integer instead.
 */
export function slideNumber(index: number, total: number): string {
  return String(index).padStart(String(Math.max(total, 1)).length, "0")
}
