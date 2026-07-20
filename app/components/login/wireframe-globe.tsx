"use client"

import { useEffect, useRef } from "react"

export function WireframeGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const setSize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    setSize()
    window.addEventListener("resize", setSize)

    const LINES = 18       // latitude + longitude line count
    // mirrors the rebrand palette: dark canvas oklch(0.21 0.006 286), violet primary #A78BFA
    const COLOR = "rgba(166,132,255,"
    let angle = 0
    let animId: number

    const project = (lat: number, lon: number, r: number, cx: number, cy: number, rotY: number) => {
      const phi = (lat * Math.PI) / 180
      const theta = (lon * Math.PI) / 180 + rotY
      const x = r * Math.cos(phi) * Math.sin(theta)
      const y = r * Math.sin(phi)
      const z = r * Math.cos(phi) * Math.cos(theta)
      // simple perspective
      const scale = (r * 2.2) / (r * 2.2 + z)
      return { sx: cx + x * scale, sy: cy - y * scale, z }
    }

    const draw = () => {
      const w = canvas.width
      const h = canvas.height
      const cx = w / 2
      const cy = h / 2
      const r = Math.min(w, h) * 0.38

      ctx.fillStyle = "#18181b"
      ctx.fillRect(0, 0, w, h)

      // latitude lines
      for (let lat = -80; lat <= 80; lat += 180 / LINES) {
        ctx.beginPath()
        let first = true
        for (let lon = 0; lon <= 360; lon += 3) {
          const { sx, sy, z } = project(lat, lon, r, cx, cy, angle)
          const alpha = z > 0 ? 0.55 : 0.1
          ctx.strokeStyle = `${COLOR}${alpha})`
          if (first) { ctx.moveTo(sx, sy); first = false }
          else ctx.lineTo(sx, sy)
        }
        ctx.lineWidth = 0.7
        ctx.stroke()
      }

      // longitude lines
      for (let lon = 0; lon < 360; lon += 180 / (LINES / 2)) {
        ctx.beginPath()
        let first = true
        for (let lat = -90; lat <= 90; lat += 3) {
          const { sx, sy, z } = project(lat, lon, r, cx, cy, angle)
          const alpha = z > 0 ? 0.55 : 0.1
          ctx.strokeStyle = `${COLOR}${alpha})`
          if (first) { ctx.moveTo(sx, sy); first = false }
          else ctx.lineTo(sx, sy)
        }
        ctx.lineWidth = 0.7
        ctx.stroke()
      }

      // draw nodes at intersections
      for (let lat = -80; lat <= 80; lat += 180 / LINES) {
        for (let lon = 0; lon < 360; lon += 180 / (LINES / 2)) {
          const { sx, sy, z } = project(lat, lon, r, cx, cy, angle)
          const alpha = z > 0 ? 0.8 : 0.1
          ctx.beginPath()
          ctx.arc(sx, sy, 1.5, 0, Math.PI * 2)
          ctx.fillStyle = `${COLOR}${alpha})`
          ctx.fill()
        }
      }

      angle += 0.003
      animId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener("resize", setSize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      aria-hidden="true"
    />
  )
}
