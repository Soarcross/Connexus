import { ImageResponse } from "next/og"

// iOS ignores alpha and composites home-screen icons onto a solid ground —
// the previous apple-icon.png was a transparent PNG with a near-black glyph,
// which iOS rendered nearly invisible. This is an opaque cream tile with the
// OFF BLACK mark instead, generated at request time so there's no binary
// asset to keep in sync with the SVG logomarks in public/brand/.
export const size = { width: 180, height: 180 }
export const contentType = "image/png"

// Base64 of an SVG carrying the same path as public/brand/connexus-logomark-*.svg,
// recolored to #1a1712 (the OFF BLACK variant, = --foreground light).
// Satori (the ImageResponse renderer) doesn't reliably rasterize inline SVG
// markup, so it's embedded as a data-URI <img> instead of inline <svg>.
const MARK_DATA_URI =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5OTMuMjcgOTkzLjE3Ij48cGF0aCBmaWxsPSIjMWExNzEyIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik04NDkuMzQsNTY4LjY5Yy0uMjYsNzcuNjgtMjEuNjQsMTUzLjQ2LTYxLjIyLDIxOS4zMy02My45NywzOC4yNy0xMzYuOSw1OC45LTIxMC41Miw2MC43M1YxNDMuOTNoMjA5LjcxTDkzMS4yNCwwaC0zMjguMjdsLTMyOC44OCwzMjkuNTF2MzU4LjQ4bDE0My45My0xNDMuOTNWMjIzLjMybDc5LjM5LTc5LjM5djY5OS4yN2MtNDEuMDYtNi43Ni04MS4zOS0xOS41OC0xMTkuNTEtMzguNzUtMTQ5LjU1LTc1LjIzLTI0Mi40Ni0yMzUuNTktMjMzLjUzLTQwMi43MSwzLjcyLTY5LjYzLDI0LjkxLTEzNy4xMyw2MC42MS0xOTYuNC4wMS0uMDIuMDMtLjA0LjA1LS4wNSw2NS45Mi0zOS42NiwxNDEuNzgtNjEuMDksMjE5LjU1LTYxLjM1TDU2OC41MSwwYy02OC44MS4yMy0xMzYuOTIsMTYuNjctMTk3Ljg0LDQ4Ljc5LTg4Ljg3LDQ2Ljg2LTIyNS42MywxOTIuNDktMjcwLjk1LDI0Ni4yM0MxMS4xOCw0MDAuMDItMjEuMjEsNTQ0LjgyLDEzLjkxLDY3Ny42MWMzNC4xOSwxMjkuMjcsMTMwLjQ1LDIzNy4yNiwyNTQuOCwyODYuMzQsMTI3Ljk0LDUwLjQ5LDI3Ni4zNCwzNC44MiwzOTAuODQtNDEuMzUsNjAuMjUtNDAuMDgsMjIyLjItMjAyLjkyLDI2MC42MS0yNTkuNTIsNzQuOC0xMTAuMjEsNzMuMDUtMjIwLjkxLDczLjExLTIzOC4zMmwtMTQzLjkzLDE0My45M1pNNTI0LjE0LDE0My45M2gyNi43M3Y3MDQuNjVjLTguOTItLjMzLTE3LjgzLS45NS0yNi43My0xLjg0VjE0My45M1oiLz48L3N2Zz4K"

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
          background: "#fff9eb",
        }}
      >
        {/* Inset to ~80% so iOS's own corner rounding never clips the mark. */}
        <img src={MARK_DATA_URI} width={144} height={144} alt="" />
      </div>
    ),
    { ...size }
  )
}
