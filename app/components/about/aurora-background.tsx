"use client"

import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"

interface Blob {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  hue: number
}

function getBlobCount() {
  const w = window.innerWidth
  if (w >= 1024) return 4
  if (w >= 768) return 3
  return 2
}

export function AuroraBackground() {
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
    const alpha = isDark ? 0.12 : 0.18

    const count = getBlobCount()
    const blobs: Blob[] = Array.from({ length: count }, (_, i) => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      radius: Math.random() * 300 + 200,
      hue: 260 + i * (80 / count),
    }))

    let animId: number

    const draw = () => {
      const w = canvas.width
      const h = canvas.height

      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      for (const b of blobs) {
        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius)
        grad.addColorStop(0, `hsla(${b.hue}, 70%, 60%, ${alpha})`)
        grad.addColorStop(1, `hsla(${b.hue}, 70%, 60%, 0)`)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2)
        ctx.fill()

        b.x += b.vx
        b.y += b.vy
        if (b.x < -b.radius) b.x = w + b.radius
        if (b.x > w + b.radius) b.x = -b.radius
        if (b.y < -b.radius) b.y = h + b.radius
        if (b.y > h + b.radius) b.y = -b.radius
      }

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
