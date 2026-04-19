"use client"

import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"

const STAR_COUNT = 60
const CONNECTION_DIST = 180
const FADE_SPEED = 0.008

interface Star {
  x: number
  y: number
  r: number
}

interface Connection {
  a: number
  b: number
  alpha: number
  growing: boolean
}

export function ConstellationBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const setSize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    setSize()
    window.addEventListener("resize", setSize)

    const isDark = resolvedTheme === "dark"
    const bg = isDark ? "#0d0f1a" : "#ffffff"
    const dotColor = isDark ? "rgba(167,139,250,0.7)" : "rgba(109,40,217,0.45)"
    const lineColor = isDark ? "rgba(167,139,250," : "rgba(109,40,217,"

    // fixed star positions
    const stars: Star[] = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: isDark ? Math.random() * 1.5 + 0.5 : Math.random() * 2.5 + 1,
    }))

    // active connections that fade in and out
    const connections: Connection[] = []
    let frame = 0

    // seed a few connections every N frames
    const spawnConnection = () => {
      const a = Math.floor(Math.random() * stars.length)
      let b = Math.floor(Math.random() * stars.length)
      while (b === a) b = Math.floor(Math.random() * stars.length)

      const dx = stars[a].x - stars[b].x
      const dy = stars[a].y - stars[b].y
      if (Math.sqrt(dx * dx + dy * dy) < CONNECTION_DIST) {
        connections.push({ a, b, alpha: 0, growing: true })
      }
    }

    let animId: number

    const draw = () => {
      const w = canvas.width
      const h = canvas.height

      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      // spawn new connections periodically
      if (frame % 40 === 0) spawnConnection()

      // draw + update connections
      for (let i = connections.length - 1; i >= 0; i--) {
        const c = connections[i]
        if (c.growing) {
          c.alpha = Math.min(c.alpha + FADE_SPEED, 0.6)
          if (c.alpha >= 0.6) c.growing = false
        } else {
          c.alpha -= FADE_SPEED
        }

        if (c.alpha <= 0) {
          connections.splice(i, 1)
          continue
        }

        const sa = stars[c.a]
        const sb = stars[c.b]
        ctx.beginPath()
        ctx.moveTo(sa.x, sa.y)
        ctx.lineTo(sb.x, sb.y)
        ctx.strokeStyle = `${lineColor}${c.alpha})`
        ctx.lineWidth = isDark ? 0.8 : 1.4
        ctx.stroke()
      }

      // draw stars
      for (const s of stars) {
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = dotColor
        ctx.fill()
      }

      frame++
      animId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener("resize", setSize)
    }
  }, [resolvedTheme])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 0 }}
      aria-hidden="true"
    />
  )
}
