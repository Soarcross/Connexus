"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"

const QUOTES = [
  "Discover opportunities.",
  "Connect with your chapter.",
  "Find your next mentor.",
  "Build meaningful connections.",
  "Explore internships and more.",
  "Grow your network.",
]

const SYMBOLS = "!@#$%^&*+=[]{}|;<>?~`0123456789"

const SCRAMBLE_CYCLES = 4   // how many symbol flips before settling on a letter
const SCRAMBLE_MS = 18      // ms per symbol flip
const PAUSE_MS = 2200       // ms to hold the full quote
const ERASE_MS = 15         // ms per character erased

const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms))

export function HeroTypewriter() {
  const [settled, setSettled] = useState("")
  const [scramble, setScramble] = useState("")
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    let cancelled = false
    let idx = 0

    const run = async () => {
      while (!cancelled) {
        const quote = QUOTES[idx % QUOTES.length]

        // type each character with scramble effect
        for (let i = 0; i < quote.length; i++) {
          if (cancelled) return

          // skip scramble for spaces — just add them instantly
          if (quote[i] === " ") {
            setSettled(quote.slice(0, i + 1))
            continue
          }

          for (let s = 0; s < SCRAMBLE_CYCLES; s++) {
            if (cancelled) return
            setScramble(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)])
            await sleep(SCRAMBLE_MS)
          }

          setScramble("")
          setSettled(quote.slice(0, i + 1))
        }

        setScramble("")
        await sleep(PAUSE_MS)

        // erase
        for (let i = quote.length; i >= 0; i--) {
          if (cancelled) return
          setSettled(quote.slice(0, i))
          await sleep(ERASE_MS)
        }

        await sleep(300)
        idx++
      }
    }

    run()
    return () => { cancelled = true }
  }, [])

  return (
    <p className="text-lg max-w-xl min-h-[1.75rem] font-bold text-red-500">
      {settled}
      <span className="font-mono">{scramble}</span>
      <span className={`inline-block w-[2px] h-[1.1em] align-middle ml-[1px] animate-pulse ${resolvedTheme === "dark" ? "bg-white" : "bg-black"}`} suppressHydrationWarning />
    </p>
  )
}
