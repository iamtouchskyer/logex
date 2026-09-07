/**
 * Logex Extension for Pi
 *
 * Registers a `logex_write` tool and a `/logex` command so Pi agents can
 * turn a coding session (Pi, Claude Code, or Codex JSONL) into a
 * blog-style article via the `logex` CLI. The Pi agent IS the LLM that
 * does topic segmentation and writing — the CLI is scaffolding.
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import { readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const WORKFLOW = [
  'logex prepare <session.jsonl> --mode article  → JSON with chunkSummaries + segmentationPrompt',
  'Execute the segmentationPrompt yourself: group chunks into topics, mark worthWriting per group',
  'Write one bilingual (zh + en) article per selected group; shape documented in skills/extract/skill.md',
  'logex publish prepare-match --session-id <id> --articles <tmp.json>',
  'If needsLlm, execute the matchingPrompt yourself and save the decisions JSON',
  'logex publish execute --session-id <id> --articles <tmp.json> --decisions <decisions.json>',
]

/** Newest session JSONL under ~/.pi/agent/sessions/<dir>/*.jsonl, or null. */
export function newestPiSession(): string | null {
  const root = join(homedir(), '.pi', 'agent', 'sessions')
  let files: Array<{ path: string; mtime: number }> = []
  try {
    for (const dir of readdirSync(root)) {
      const projectDir = join(root, dir)
      let stat
      try {
        stat = statSync(projectDir)
      } catch {
        continue
      }
      if (!stat.isDirectory()) continue
      for (const f of readdirSync(projectDir)) {
        if (!f.endsWith('.jsonl')) continue
        const p = join(projectDir, f)
        try {
          files.push({ path: p, mtime: statSync(p).mtimeMs })
        } catch {
          /* skip */
        }
      }
    }
  } catch {
    return null
  }
  files = files.sort((a, b) => b.mtime - a.mtime)
  return files[0]?.path ?? null
}

function workflowPayload(jsonlPath: string | null): string {
  return JSON.stringify({
    status: 'ok',
    jsonl_path: jsonlPath,
    workflow: WORKFLOW,
    hint: 'No API key needed — you are the LLM. Run the steps with the logex CLI; full procedure: skills/extract/skill.md (shipped in the npm package).',
  })
}

export default function logexExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'logex_write',
    label: 'Logex Write',
    description:
      'Handshake for the article-writing workflow. Returns the concrete steps any LLM agent executes with the logex CLI — the calling agent IS the LLM that segments topics and writes the articles.',
    parameters: Type.Object({
      jsonl_path: Type.Optional(
        Type.String({
          description: 'Path to a session JSONL (Claude Code, Codex, or Pi format)',
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      return {
        content: [{ type: 'text', text: workflowPayload(params.jsonl_path ?? null) }],
        details: {},
      }
    },
  })

  pi.registerCommand('logex', {
    description: 'Turn a coding session into a blog article (logex workflow)',
    handler: async (args, ctx) => {
      const explicit = args?.trim()
      const path = explicit || newestPiSession()
      if (!path) {
        ctx.ui.notify(
          'No session JSONL found. Pass one: /logex <path.jsonl>',
          'warning',
        )
        return
      }
      pi.sendUserMessage(
        'Run the logex article workflow on session JSONL: '
        + path
        + '\n\nSteps: run `logex prepare <path> --mode article`, execute the returned segmentationPrompt yourself to pick topics, write one bilingual (zh + en) article per worthwhile topic, then publish via `logex publish prepare-match` and `logex publish execute`. Present the topic candidates and let me choose before writing.',
      )
    },
  })
}
