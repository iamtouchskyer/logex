# Logex VS Code Extension

Drive the logex workflow from the command palette. The extension registers **Logex: Prepare Session for Article**:

1. Lists recent sessions from `logex list` (Claude Code + Codex + Pi).
2. Lets you pick one via QuickPick.
3. Runs `logex prepare <jsonl>` and opens the JSON output (chunk summaries + segmentation prompt) in an editor tab.

The segmentation and writing steps need an LLM - feed the `segmentationPrompt` to your in-editor agent, or run `/logex` in Claude Code. Publish with `logex publish prepare-match` and `logex publish execute` (needs `GITHUB_TOKEN`).

Requires the `logex` CLI (`npm install -g @touchskyer/logex`), with an npx fallback.
