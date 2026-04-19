"use client"

import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"

interface Shape {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  sides: number
  rotation: number
  rotationSpeed: number
}

function getShapeCount() {
  const w = window.innerWidth
  if (w >= 1024) return 12
  if (w >= 768) return 8
  return 5
}

export function GeoBackground() {
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
    const bg = isDark ? "#0f1117" : "#ffffff"
    const stroke = isDark ? "rgba(167,139,250,0.22)" : "rgba(109,40,217,0.35)"

    const count = getShapeCount()
    const shapes: Shape[] = Array.from({ length: count }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      radius: Math.random() * 80 + 40,
      sides: Math.random() < 0.5 ? 3 : 6,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.003,
    }))

    let animId: number

    const drawPolygon = (x: number, y: number, r: number, sides: number, rot: number) => {
      ctx.beginPath()
      for (let i = 0; i < sides; i++) {
        const angle = rot + (i / sides) * Math.PI * 2
        const px = x + r * Math.cos(angle)
        const py = y + r * Math.sin(angle)
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.stroke()
    }

    const draw = () => {
      const w = canvas.width
      const h = canvas.height
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = stroke
      ctx.lineWidth = isDark ? 1.2 : 1.8
      ctx.shadowBlur = isDark ? 8 : 0
      ctx.shadowColor = isDark ? "rgba(167,139,250,0.6)" : "transparent"

      for (const s of shapes) {
        drawPolygon(s.x, s.y, s.radius, s.sides, s.rotation)
        s.x += s.vx
        s.y += s.vy
        s.rotation += s.rotationSpeed
        if (s.x < -s.radius) s.x = w + s.radius
        if (s.x > w + s.radius) s.x = -s.radius
        if (s.y < -s.radius) s.y = h + s.radius
        if (s.y > h + s.radius) s.y = -s.radius
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
