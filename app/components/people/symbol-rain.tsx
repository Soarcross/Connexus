"use client"

import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"

const SYMBOLS = ["@", "#", "&", "%", "$", "!", "(", "*", "^", ".", "-", "+", "/", "<", ">"]
const DROP_COUNT = 30
const FONT_SIZE = 18
const TRAIL_LENGTH = 20
const FADE_PER_FRAME = 1 / TRAIL_LENGTH

interface TrailSegment {
  y: number
  symbol: string
  alpha: number
}

interface Drop {
  x: number
  y: number
  speed: number
  trail: TrailSegment[]
  frame: number
}

export function SymbolRain() {
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
    const bgColor = isDark ? "#10111A" : "#ffffff"
    const symbolColor = isDark ? "#a78bfa" : "#7c3aed"
    const trailColor = isDark ? "#3d2f6b" : "#c4b5fd"

    const drops: Drop[] = Array.from({ length: DROP_COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * -window.innerHeight,
      speed: Math.random() * 1 + 1.5,
      trail: [],
      frame: 0,
    }))

    let animId: number

    const draw = () => {
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.font = `${FONT_SIZE}px monospace`
      ctx.textAlign = "center"

      for (const drop of drops) {
        const h = canvas.height
        const progress = Math.max(0, Math.min(1, drop.y / h))

        // symbol at head: dense→sparse based on progress, change every 6 frames
        const maxSymIdx = Math.min(
          Math.floor(progress * SYMBOLS.length) + 2,
          SYMBOLS.length - 1
        )
        const symbol = drop.frame % 6 === 0
          ? SYMBOLS[Math.floor(Math.random() * (maxSymIdx + 1))]
          : (drop.trail[0]?.symbol ?? SYMBOLS[0])

        // add new segment at head
        drop.trail.unshift({ y: drop.y, symbol, alpha: 1 })

        // fade and trim trail
        for (const seg of drop.trail) seg.alpha -= FADE_PER_FRAME
        drop.trail = drop.trail.filter(seg => seg.alpha > 0)

        // draw trail (dimmest first so head is brightest on top)
        for (let i = drop.trail.length - 1; i >= 0; i--) {
          const seg = drop.trail[i]
          ctx.globalAlpha = Math.max(0, seg.alpha * 0.35) // cap at 35% opacity
          ctx.fillStyle = i === 0 ? symbolColor : trailColor
          ctx.fillText(seg.symbol, drop.x, seg.y)
        }

        drop.y += drop.speed
        drop.frame++

        if (drop.y > h + FONT_SIZE * TRAIL_LENGTH) {
          drop.x = Math.random() * canvas.width
          drop.y = -FONT_SIZE
          drop.speed = Math.random() * 1 + 1.5
          drop.trail = []
          drop.frame = 0
        }
      }

      ctx.globalAlpha = 1
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
