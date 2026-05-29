/**
 * Hero image generation with gradient fallback.
 *
 * Tries `image-x` skill if available. Falls back to a gradient SVG generated
 * from the project palette in `src/lib/gradients.ts` so the pipeline never
 * blocks on a missing optional dep.
 *
 * Style system: 10 visual categories matched by tags/project, each with
 * distinct color mood, visual motif, and composition direction. Based on
 * brand research (Stripe, Linear, Vercel patterns via ask-ux-expert).
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

// ─── Style taxonomy ──────────────────────────────────────────────────

export interface HeroStyle {
  id: string
  palette: string        // color mood for the prompt
  motif: string          // visual motif / composition
  composition: string    // layout / framing direction
}

const STYLES: HeroStyle[] = [
  {
    id: 'debugging',
    palette: 'warm amber and deep red tones on charcoal background, warning signal atmosphere',
    motif: 'fractured circuit board traces, broken connection nodes, glitch artifacts, error signal waves',
    composition: 'asymmetric, off-center focal point, tension and disruption',
  },
  {
    id: 'architecture',
    palette: 'cool blueprint blue and silver-grey on deep navy, technical precision',
    motif: 'layered architectural planes, isometric grid structures, node-and-edge graphs, modular blocks',
    composition: 'structured grid layout, orthographic perspective, clean alignment',
  },
  {
    id: 'frontend',
    palette: 'vibrant gradient from magenta #FF71CE through violet to electric blue, creative energy',
    motif: 'frosted glass panels, rounded UI cards, color swatches, pixel grid fragments',
    composition: 'overlapping translucent layers, depth-of-field blur, playful angles',
  },
  {
    id: 'testing',
    palette: 'teal #059669 and forest green with subtle gold accents on dark background, confidence',
    motif: 'pipeline flow arrows, checkmark sequences, parallel test lanes, green status indicators',
    composition: 'horizontal flow left-to-right, parallel tracks, orderly progression',
  },
  {
    id: 'security',
    palette: 'neon cyan #00FFFF and electric blue on near-black #0A0E27, high-tech surveillance',
    motif: 'shield geometry, encrypted mesh patterns, lock mechanisms, hexagonal grid cells',
    composition: 'centered radial symmetry, scanning line effects, contained and protected',
  },
  {
    id: 'ai-agent',
    palette: 'deep purple #5E6AD2 and soft violet with luminous glow accents, intelligent and alive',
    motif: 'neural constellation dots and lines, brain-like wave patterns, particle networks, data streams',
    composition: 'expanding from center, organic network growth, gentle radial glow',
  },
  {
    id: 'infra',
    palette: 'warm orange #F59E0B through ember red #EF4444 on dark grey, industrial power',
    motif: 'terminal window frames, pipeline arrows, gear mechanisms, container stack shapes',
    composition: 'mechanical precision, stacked layers, vertical hierarchy',
  },
  {
    id: 'content',
    palette: 'cool indigo #6366F1 and slate blue on warm cream undertone, editorial sophistication',
    motif: 'abstract book page shapes, flowing pen stroke curves, markdown syntax symbols, text blocks',
    composition: 'horizontal reading flow, layered paper depth, typographic negative space',
  },
  {
    id: 'data',
    palette: 'teal #0D9488 and emerald #10B981 with clean white accents, structured clarity',
    motif: 'spreadsheet cell grids, stacked document layers, bar chart silhouettes, table structures',
    composition: 'grid-based, tabular alignment, structured compartments',
  },
  {
    id: 'product',
    palette: 'coral #FF5577 through pink #EC4899 to magenta #D44DF0 on deep purple, launch energy',
    motif: 'lightbulb sparks, upward trajectory arrows, market trend curves, rocket trail streaks',
    composition: 'dynamic diagonal upward sweep, ascending energy, expansive',
  },
]

const DEFAULT_STYLE: HeroStyle = {
  id: 'default',
  palette: 'deep blue to purple gradient on dark background, modern developer aesthetic',
  motif: 'abstract geometric shapes, subtle grid patterns, floating polygons',
  composition: 'balanced, centered, clean negative space',
}

/** Tag → style ID mapping. First match wins. */
const TAG_STYLE_MAP: Record<string, string> = {
  // debugging
  debugging: 'debugging', error: 'debugging', fix: 'debugging', bugfix: 'debugging',
  // architecture
  architecture: 'architecture', 'multi-agent': 'architecture', refactoring: 'architecture',
  'design-pattern': 'architecture', 'agent-workflow': 'architecture',
  // frontend
  frontend: 'frontend', 'design-system': 'frontend', UI: 'frontend', css: 'frontend',
  accessibility: 'frontend', responsive: 'frontend',
  // testing
  testing: 'testing', playwright: 'testing', vitest: 'testing', e2e: 'testing',
  ci: 'testing', 'code-review': 'testing',
  // security
  security: 'security', auth: 'security', oauth: 'security', jwt: 'security',
  // ai-agent
  AI: 'ai-agent', 'ai-agent': 'ai-agent', 'claude-code': 'ai-agent', llm: 'ai-agent',
  // infra
  cli: 'infra', git: 'infra', devops: 'infra', docker: 'infra',
  opc: 'infra', 'opc-loop': 'infra',
  // content
  logex: 'content', blog: 'content', memex: 'content', 'silicon-team': 'content',
  publishing: 'content',
  // data
  ooxml: 'data', 'python-docx': 'data', 'python-pptx': 'data', excel: 'data',
  'chart-agent': 'data', visualization: 'data',
  // product
  'hn-pain-point': 'product', 'idea-factory': 'product', 'dream-works': 'product',
  startup: 'product', product: 'product', business: 'product',
}

/** Project → style ID fallback (when no tag matches). */
const PROJECT_STYLE_MAP: Record<string, string> = {
  mitsein: 'architecture',
  dumare: 'frontend',
  logex: 'content',
  opc: 'infra',
  memex: 'content',
  'silicon-team': 'content',
  'silicon-team-book': 'content',
  'dream-works': 'product',
  'idea-factory': 'product',
  'chart-agent': 'data',
  'ooxml-core': 'data',
  'ooxml-stack': 'data',
  'python-docx': 'data',
  'python-pptx': 'data',
  'suri-counsel': 'security',
  'cli-x': 'infra',
  'ink-flow': 'content',
  societas: 'architecture',
  'explore-projects': 'product',
}

/** Pick the best style for an article based on tags, then project. */
export function pickStyle(tags?: string[], project?: string): HeroStyle {
  if (tags) {
    for (const tag of tags) {
      const id = TAG_STYLE_MAP[tag]
      if (id) {
        const style = STYLES.find((s) => s.id === id)
        if (style) return style
      }
    }
  }
  if (project) {
    const id = PROJECT_STYLE_MAP[project]
    if (id) {
      const style = STYLES.find((s) => s.id === id)
      if (style) return style
    }
  }
  return DEFAULT_STYLE
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
  if (await resolveDashscopeKey(env, env === process.env)) return true
  return false
}

/** Look up DASHSCOPE_API_KEY in env, falling back to ~/.claude/.env. */
async function resolveDashscopeKey(
  env: NodeJS.ProcessEnv = process.env,
  fallbackToDotEnv = true,
): Promise<string | null> {
  if (env.DASHSCOPE_API_KEY) return env.DASHSCOPE_API_KEY
  if (!fallbackToDotEnv) return null
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
    tags?: string[]
    project?: string
  } = {},
): Promise<HeroImage> {
  const env = opts.env ?? process.env
  const key = await resolveDashscopeKey(env, opts.env == null)
  if (!key) throw new Error('DASHSCOPE_API_KEY not set')

  const scriptPath = opts.scriptPath
    ?? join(homedir(), '.claude', 'skills', 'image-x', 'scripts', 'generate_image.py')
  const model = opts.model ?? 'wanx2.1-t2i-turbo'
  const size = opts.size ?? '1200*630'
  const timeoutMs = opts.timeoutMs ?? 120_000

  const style = pickStyle(opts.tags, opts.project)
  const prompt = buildHeroPrompt(title, style)

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

/** Build a style-aware prompt for hero image generation. */
export function buildHeroPrompt(title: string, style: HeroStyle): string {
  return (
    `Abstract illustration for a technical blog post titled "${title.slice(0, 140)}". `
    + `Color: ${style.palette}. `
    + `Motif: ${style.motif}. `
    + `Composition: ${style.composition}. `
    + `No text, no words, no letters in the image. Clean, modern, editorial quality.`
  )
}

/** Top-level entry: image-x if available & working, else gradient. */
export async function generateHeroImage(
  slug: string,
  title: string,
  opts: {
    detect?: typeof detectImageX
    viaImageX?: typeof generateWithImageX
    viaGradient?: typeof generateGradientHero
    tags?: string[]
    project?: string
  } = {},
): Promise<HeroImage> {
  const detect = opts.detect ?? detectImageX
  const viaImageX = opts.viaImageX ?? generateWithImageX
  const viaGradient = opts.viaGradient ?? generateGradientHero

  if (await detect()) {
    try {
      return await viaImageX(slug, title, {
        tags: opts.tags,
        project: opts.project,
      })
    } catch {
      // fall through to gradient
    }
  }
  return viaGradient(slug, title)
}
