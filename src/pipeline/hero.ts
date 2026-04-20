/**
 * Hero image generation with gradient fallback.
 *
 * Tries `image-x` skill if available. Falls back to a gradient SVG generated
 * from the project palette in `src/lib/gradients.ts` so the pipeline never
 * blocks on a missing optional dep.
 *
 * TODO(merge): skill.md hero step should say:
 *   "hero image auto-generated (gradient fallback when image-x unavailable)"
 * Agent B owns the skill.md migration; the orchestrator will resolve in merge.
 */

import { access, readFile, readdir, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { GRADIENTS, DEFAULT_GRADIENT } from '../lib/gradients'

export interface HeroImage {
  data: Buffer
  mime: string
}

/** Parse a CSS `linear-gradient(...)` string into angle + stops. */
function parseGradient(css: string): {
  angle: number
  stops: { color: string; pos: number }[]
} {
  const inner = css.replace(/^linear-gradient\(/, '').replace(/\)\s*$/, '')
  const parts = inner.split(/,(?![^(]*\))/).map((s) => s.trim())
  let angle = 135
  let stopStart = 0
  const first = parts[0]
  if (first && /deg\s*$/.test(first)) {
    angle = parseFloat(first)
    stopStart = 1
  }
  const stops = parts.slice(stopStart).map((p) => {
    const m = p.match(/^(\S+)\s+(\d+(?:\.\d+)?)%$/)
    if (m) return { color: m[1], pos: parseFloat(m[2]) / 100 }
    return { color: p, pos: 0 }
  })
  return { angle, stops }
}

/** Pick gradient for a slug — exact match first, then prefix, else default. */
export function pickGradient(slug: string): string {
  if (GRADIENTS[slug]) return GRADIENTS[slug]
  for (const key of Object.keys(GRADIENTS)) {
    if (slug.startsWith(key)) return GRADIENTS[key]
  }
  return DEFAULT_GRADIENT
}

/** Render a gradient hero as an SVG buffer. */
export async function generateGradientHero(
  slug: string,
  title: string,
): Promise<HeroImage> {
  const css = pickGradient(slug)
  const { angle, stops } = parseGradient(css)
  const rad = ((angle - 90) * Math.PI) / 180
  const x1 = 50 - Math.cos(rad) * 50
  const y1 = 50 - Math.sin(rad) * 50
  const x2 = 50 + Math.cos(rad) * 50
  const y2 = 50 + Math.sin(rad) * 50

  const stopEls = stops
    .map(
      (s, i) =>
        `<stop offset="${s.pos || i / Math.max(stops.length - 1, 1)}" stop-color="${s.color}"/>`,
    )
    .join('')

  // Escape title for XML
  const safeTitle = title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .slice(0, 120)

  // Add filler so size easily exceeds 1KB without being wasteful.
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="g" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">
      ${stopEls}
    </linearGradient>
    <filter id="noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${slug.length}"/>
      <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.06 0"/>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect width="1200" height="630" filter="url(#noise)" opacity="0.4"/>
  <g font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" fill="#fff">
    <text x="80" y="300" font-size="64" font-weight="700">${safeTitle}</text>
    <text x="80" y="370" font-size="28" opacity="0.85">logex · ${slug}</text>
  </g>
  <!-- padding:${'·'.repeat(800)} -->
</svg>`

  return { data: Buffer.from(svg, 'utf-8'), mime: 'image/svg+xml' }
}

/**
 * Detect whether image-x is usable.
 * Requires (a) the skill dir exists, (b) DASHSCOPE_API_KEY is present
 * (checks process.env, then ~/.claude/.env).
 */
export async function detectImageX(
  env: NodeJS.ProcessEnv = process.env,
  accessFn: (p: string) => Promise<void> = access,
): Promise<boolean> {
  if (env.LOGEX_IMAGE_X === 'false') return false
  const scriptPath = join(homedir(), '.claude', 'skills', 'image-x', 'scripts', 'generate_image.py')
  try {
    await accessFn(scriptPath)
  } catch {
    return false
  }
  if (await resolveDashscopeKey(env)) return true
  return false
}

/** Look up DASHSCOPE_API_KEY in env, falling back to ~/.claude/.env. */
async function resolveDashscopeKey(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  if (env.DASHSCOPE_API_KEY) return env.DASHSCOPE_API_KEY
  try {
    const envPath = join(homedir(), '.claude', '.env')
    const raw = await readFile(envPath, 'utf-8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*DASHSCOPE_API_KEY\s*=\s*(.*?)\s*$/)
      if (m) {
        return m[1].replace(/^["']|["']$/g, '')
      }
    }
  } catch { /* ignore */ }
  return null
}

/**
 * Generate a hero image via image-x (DashScope). Spawns the skill's
 * generate_image.py script into a temp dir, reads the produced PNG,
 * and returns it as a Buffer. Throws if the skill is unavailable or
 * generation times out.
 */
export async function generateWithImageX(
  slug: string,
  title: string,
  opts: {
    model?: string
    size?: string
    timeoutMs?: number
    scriptPath?: string
    env?: NodeJS.ProcessEnv
  } = {},
): Promise<HeroImage> {
  const env = opts.env ?? process.env
  const key = await resolveDashscopeKey(env)
  if (!key) throw new Error('DASHSCOPE_API_KEY not set')

  const scriptPath = opts.scriptPath
    ?? join(homedir(), '.claude', 'skills', 'image-x', 'scripts', 'generate_image.py')
  const model = opts.model ?? 'wanx2.1-t2i-turbo'
  const size = opts.size ?? '1200*630'
  const timeoutMs = opts.timeoutMs ?? 120_000

  const prompt =
    `Minimalist, dark-themed abstract illustration for a technical blog post titled "${title.slice(0, 160)}". `
    + `Style: geometric shapes, subtle gradient, developer aesthetic, high contrast. `
    + `No text in the image. Clean, modern, editorial.`

  const outDir = mkdtempSync(join(tmpdir(), `logex-hero-${slug}-`))

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        'python3',
        [
          scriptPath,
          prompt,
          '--model', model,
          '--size', size,
          '--output', outDir,
          '--api-key', key,
          '--timeout', String(Math.floor(timeoutMs / 1000)),
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
      let stderr = ''
      child.stderr?.on('data', (d) => { stderr += d.toString() })
      child.stdout?.on('data', () => { /* drain */ })
      const killer = setTimeout(() => {
        child.kill('SIGTERM')
        reject(new Error(`image-x timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      child.on('close', (code) => {
        clearTimeout(killer)
        if (code === 0) resolve()
        else reject(new Error(`image-x exited ${code}: ${stderr.slice(-500)}`))
      })
      child.on('error', (err) => {
        clearTimeout(killer)
        reject(err)
      })
    })

    const entries = await readdir(outDir)
    const png = entries.find((f) => f.toLowerCase().endsWith('.png'))
    if (!png) throw new Error(`image-x produced no PNG in ${outDir} (got: ${entries.join(',')})`)
    const data = await readFile(join(outDir, png))
    return { data, mime: 'image/png' }
  } finally {
    try { await rm(outDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

/** Top-level entry: image-x if available & working, else gradient. */
export async function generateHeroImage(
  slug: string,
  title: string,
  opts: {
    detect?: typeof detectImageX
    viaImageX?: typeof generateWithImageX
    viaGradient?: typeof generateGradientHero
  } = {},
): Promise<HeroImage> {
  const detect = opts.detect ?? detectImageX
  const viaImageX = opts.viaImageX ?? generateWithImageX
  const viaGradient = opts.viaGradient ?? generateGradientHero

  if (await detect()) {
    try {
      return await viaImageX(slug, title)
    } catch {
      // fall through to gradient
    }
  }
  return viaGradient(slug, title)
}
