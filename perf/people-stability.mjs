// Screenshot /people desktop repeatedly on ONE server to see how many distinct
// renderings occur. If a single build produces multiple byte sizes, the visual
// difference between builds is image flakiness, not code.
import { chromium } from "@playwright/test"
import { createHash } from "node:crypto"
import { join } from "node:path"
import { ROOT } from "./shared.mjs"

const base = process.argv[2]
const n = Number(process.argv[3] ?? 5)
const browser = await chromium.launch()
const ctx = await browser.newContext({ storageState: join(ROOT,"perf",".auth","bench.json"), viewport:{width:1440,height:900} })
const page = await ctx.newPage()
const seen = new Map()
for (let i=0;i<n;i++) {
    await page.goto(base + "/people", { waitUntil: "networkidle" })
    await page.addStyleTag({ content: `*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}` })
    await page.evaluate(async () => {
        await Promise.all(Array.from(document.images).filter(i=>!i.complete).map(i=>new Promise(r=>{i.addEventListener("load",r,{once:true});i.addEventListener("error",r,{once:true})})))
        if (document.fonts?.ready) await document.fonts.ready
    })
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))
    const buf = await page.screenshot({ fullPage: true })
    const broken = await page.evaluate(()=>Array.from(document.images).filter(i=>i.complete && i.naturalWidth===0).length)
    const key = buf.length
    seen.set(key,(seen.get(key)??0)+1)
    console.log(`  capture ${i+1}: ${buf.length} bytes  sha ${createHash("sha256").update(buf).digest("hex").slice(0,10)}  broken images: ${broken}`)
}
console.log(`  -> ${seen.size} distinct rendering(s) from ONE build: ${[...seen.entries()].map(([k,v])=>k+" x"+v).join(", ")}`)
await browser.close()
