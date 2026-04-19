"use client"

import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"

const DARK = { bg: "#0d0f1a", particle: "#a78bfa", lineAlpha: 0.4 }
const LIGHT = { bg: "#ffffff", particle: "#7c3aed", lineAlpha: 0.9 }
const PARTICLE_COUNT = 70
const MAX_DIST = 120

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const colors = resolvedTheme === "dark" ? DARK : LIGHT

    const setSize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    setSize()
    window.addEventListener("resize", setSize)


    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      r: Math.random() < 0.15
        ? Math.random() * (resolvedTheme === "dark" ? 2.5 : 3) + (resolvedTheme === "dark" ? 2 : 3)
        : Math.random() * (resolvedTheme === "dark" ? 1.5 : 2) + (resolvedTheme === "dark" ? 0.5 : 1),
    }))

    let animId: number

    const draw = () => {
      const w = canvas.width
      const h = canvas.height

      ctx.fillStyle = colors.bg
      ctx.fillRect(0, 0, w, h)

      // connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < MAX_DIST) {
            ctx.globalAlpha = (1 - dist / MAX_DIST) * colors.lineAlpha
            ctx.strokeStyle = colors.particle
            ctx.lineWidth = resolvedTheme === "dark" ? 0.5 : 1.2
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }

      ctx.globalAlpha = 1
      for (const p of particles) {
        // clamp speed
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
        if (speed > 5) {
          p.vx = (p.vx / speed) * 5
          p.vy = (p.vy / speed) * 5
        }

        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1

        ctx.fillStyle = colors.particle
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
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
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
      }}
      aria-hidden="true"
    />
  )
}
