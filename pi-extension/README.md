# Logex Pi Extension

Turn a coding session into a blog-style article from inside a Pi session.

- **Tool `logex_write`** — handshake that returns the concrete CLI workflow steps (prepare → segment yourself → publish). The Pi agent IS the LLM doing segmentation and writing.
- **Command `/logex [path.jsonl]`** — resolves the newest Pi session (or takes an explicit Claude Code / Codex / Pi JSONL path) and sends the workflow prompt into the conversation, triggering a turn.

Requires the `logex` CLI (`npm install -g @touchskyer/logex`) and `GITHUB_TOKEN` for publishing. Install: copy this directory to `~/.pi/agent/extensions/logex/` (or pass `-e ./pi-extension/index.ts` while developing).
