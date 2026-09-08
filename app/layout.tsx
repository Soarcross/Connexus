import type { Metadata, Viewport } from "next"
import { Fraunces, Google_Sans_Code } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import "@/app/globals.css"
import { ThemeProvider } from "@/app/components/theme-provider"

// Headings. Marion (the brand board's display face) has no free web licence, so
// Fraunces — a high-contrast variable serif with optical sizing — stands in.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  axes: ["opsz"],
  display: "swap",
})

// Everything else. The board pairs the serif with a monospace body; Plus Jakarta
// Sans is gone entirely. `--font-sans` and `--font-mono` both resolve here now.
const googleSansCode = Google_Sans_Code({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Connexus",
  description: "Connect with students and alumni from high schools across the country",
}

// `resizes-content` shrinks the layout viewport (and so `dvh`) when the soft
// keyboard opens, which is what keeps the DM composer above it on mobile.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fraunces.variable} ${googleSansCode.variable} antialiased`} suppressHydrationWarning>
        <ThemeProvider>
          {children}
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}