import { ImageResponse } from "next/og"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

/**
 * Home-screen icon. iOS wants a real raster, so the mark is drawn and rendered out. The
 * previous build stacked bordered boxes because the old mark was two rectangles; a pair
 * of slanted sheets is two paths, and Satori draws paths. Geometry is `logo.tsx` scaled
 * up rather than re-invented — at 180px the channel is 12px wide, so unlike the favicon
 * this one needs no widening.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#090d10",
        }}
      >
        <svg width="128" height="72" viewBox="0 0 24 13.5">
          <path d="M0 0h14.4L10.4 13.5H0z" fill="#f1f0ec" />
          <path d="M16 0h8l-4 13.5h-8z" fill="#bbe238" />
        </svg>
      </div>
    ),
    size,
  )
}
