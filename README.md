# logex

Write blog-style session papers from coding-agent session transcripts (Claude Code, Codex). One session → N articles, one per topic. The LLM (your agent) decides topic segmentation and writes the articles in-session — no extra API key needed.

- [English](#english) · [中文](#中文) · [日本語](#日本語) · [한국어](#한국어) · [Español](#español)

---

## English

### What is logex

`logex` turns coding-agent session JSONL transcripts (Claude Code, Codex) into blog-quality technical articles. It does the boring work (parse, chunk, score, group by signal) as a pure pipeline, then hands the actual **topic segmentation** and **writing** to the LLM that's already in the loop. One long session typically yields 1–3 articles — the agent reads chunk summaries, decides what's worth writing, and produces structured JSON articles that get published to a separate data repo (`logex-data`).

The webapp (React + Vite SPA) reads that data repo and renders the blog at [logex-io.vercel.app](https://logex-io.vercel.app).

### Install

```bash
npm install -g @touchskyer/logex
```

Requires Node.js 18+.

### Quick Start — the `/logex` workflow

In Claude Code, just run:

```
/logex                    # write articles from the current session
/logex <path.jsonl>       # write from a specific JSONL file
/logex --list             # list recent session JSONLs
```

Under the hood the skill runs:

```bash
logex write                # /logex entry point — points at the workflow below
logex list                 # recent sessions (Claude Code + Codex)
logex prepare <jsonl>      # parse → chunk → score → segmentation prompt (no LLM)
logex publish ...          # publish articles to the logex-data repo
logex mcp                  # start MCP server for other agents
```

The agent is the one deciding topic boundaries and drafting the prose — `logex` is the scaffolding around it.

**Supported transcripts.** The parser reads both Claude Code and Codex session JSONL. Auto-discovery (`logex list`) scans both `~/.claude/projects/` and `~/.codex/sessions/`; you can also pass any JSONL path directly: `/logex <path.jsonl>`.

### Claude Code integration (plugin + skill + hook)

Install the plugin once, get the skill and the Stop-hook reminder automatically:

```
/plugin marketplace add iamtouchskyer/logex
/plugin install logex@logex
```

This registers:

- **Skill `logex`** — the `/logex` slash command and the full segmentation + writing procedure.
- **Stop hook** — on session end, a friendly reminder "consider writing a logex article from this session".
- **`.claude-plugin/plugin.json`** — declares the skill and hook paths so the plugin travels as one unit.

No global `npm install` required when you use the plugin — the skill ships with it.

### MCP for other agents (Cursor / Codex / Windsurf)

Any MCP-capable client can drive logex via:

```bash
logex mcp
```

Client-side config:

| Client | Setup |
|--------|-------|
| Cursor | `npm install -g @touchskyer/logex`, then add MCP server: command `logex`, args `["mcp"]` |
| Codex | `npm install -g @touchskyer/logex && codex mcp add logex -- logex mcp` |
| Windsurf / others | Same pattern — command `logex`, args `["mcp"]` |

Cursor reads `~/.cursor/mcp.json` (or `.cursor/mcp.json` per project); most MCP clients use the same shape:

```json
{
  "mcpServers": {
    "logex": { "command": "logex", "args": ["mcp"] }
  }
}
```

Articles are stored in the `iamtouchskyer/logex-data` repo on GitHub — logex publishes directly via the Contents API. Ensure `GITHUB_TOKEN` is set in `~/.claude/.env` with `repo` scope.

### Experimental integrations

The repo also ships minimal integrations that are not part of the stable surface yet: a **VS Code extension** (`vscode-extension/`, command palette → `Logex: Prepare Session for Article` — picks a session, runs `logex prepare`, opens the JSON result) and a **Pi extension** skeleton (`pi-extension/`, no runtime behavior yet).

### License

MIT.

---

## 中文

### 什么是 logex

`logex` 把 coding agent(Claude Code、Codex)session 的 JSONL transcript 变成 blog 级的技术文章。它把"枯燥的部分"（parse、chunk、score、按信号分组）做成纯 pipeline，把**话题切分**和**写作**交给当前在 session 里的 LLM —— 不需要额外 API key。一次长 session 通常产 1–3 篇文章：agent 读 chunk summaries，自己决定哪些值得写，产出结构化的 JSON 文章，发布到独立的 data 仓库 `logex-data`。

Webapp 是 React + Vite SPA，从 data 仓库读文章，部署在 [logex-io.vercel.app](https://logex-io.vercel.app)。

### 安装

```bash
npm install -g @touchskyer/logex
```

需要 Node.js 18+。

### Quick Start — `/logex` workflow

在 Claude Code 里：

```
/logex                    # 从当前 session 写文章
/logex <path.jsonl>       # 从指定 JSONL 写
/logex --list             # 列最近的 session
```

背后调用：

```bash
logex write                # /logex 入口 —— 指向下面的工作流命令
logex list                 # 最近 session（Claude Code + Codex）
logex prepare <jsonl>      # parse → chunk → score → 切分 prompt（无 LLM）
logex publish ...          # 发布文章到 logex-data 仓库
logex mcp                  # 给其它 agent 暴露 MCP server
```

话题切分和正文都是 agent 自己决定，`logex` 只做周边脚手架。

**支持的 transcript 格式。** parser 同时认 Claude Code 和 Codex 的 session JSONL。自动发现（`logex list`）同时扫描 `~/.claude/projects/` 和 `~/.codex/sessions/`；也可以直接传任意 JSONL 路径：`/logex <path.jsonl>`。

### Claude Code 集成（plugin + skill + hook）

一次安装，skill 和 Stop hook 自动就绪：

```
/plugin marketplace add iamtouchskyer/logex
/plugin install logex@logex
```

会注册：

- **Skill `logex`** —— `/logex` slash command 和完整切分 + 写作流程
- **Stop hook** —— session 结束时提醒"可以考虑把这次 session 写成一篇 logex 文章"
- **`.claude-plugin/plugin.json`** —— plugin 的入口，skill 和 hook 作为一个整体打包

走 plugin 就不需要再 `npm install -g` —— skill 随 plugin 走。

### 给其它 agent 用 MCP（Cursor / Codex / Windsurf）

任意支持 MCP 的 client：

```bash
logex mcp
```

客户端配置：

| 客户端 | 配置 |
|--------|------|
| Cursor | `npm install -g @touchskyer/logex`，添加 MCP server：command `logex`，args `["mcp"]` |
| Codex | `npm install -g @touchskyer/logex && codex mcp add logex -- logex mcp` |
| Windsurf / 其它 | 同样的 pattern：command `logex`，args `["mcp"]` |

Cursor 读取 `~/.cursor/mcp.json`（或项目级 `.cursor/mcp.json`），其它 MCP client 同构：

```json
{
  "mcpServers": {
    "logex": { "command": "logex", "args": ["mcp"] }
  }
}
```

文章保存在 `iamtouchskyer/logex-data` 仓库（直接通过 GitHub Contents API 发布；在 `~/.claude/.env` 中配好带 `repo` scope 的 `GITHUB_TOKEN`）。

### 实验性集成

仓库里还有两个尚未进入稳定面的集成：**VS Code 扩展**（`vscode-extension/`，命令面板 → `Logex: Prepare Session for Article`——选 session、跑 `logex prepare`、打开 JSON 结果）和 **Pi 扩展**骨架（`pi-extension/`，暂无运行时行为）。

### License

MIT.

---

## 日本語

### logex とは

`logex` はコーディング agent（Claude Code・Codex）のセッション JSONL トランスクリプトを、ブログ品質の技術記事に変換します。退屈な処理（parse・chunk・score・シグナル単位でのグルーピング）はピュアな pipeline で処理し、**トピック分割**と**執筆**は、セッション内にすでにいる LLM に任せます — 追加の API key は不要。長めのセッション 1 回で通常 1〜3 本の記事が出ます。agent が chunk summaries を読み、書く価値のある話題を判断し、構造化された JSON 記事を別 repo (`logex-data`) に publish します。

Webapp は React + Vite SPA で、その data repo を読んで [logex-io.vercel.app](https://logex-io.vercel.app) に表示されます。

### インストール

```bash
npm install -g @touchskyer/logex
```

Node.js 18+ が必要。

### Quick Start — `/logex` ワークフロー

Claude Code 内で:

```
/logex                    # 現在のセッションから記事を書く
/logex <path.jsonl>       # 指定 JSONL から書く
/logex --list             # 最近のセッション一覧
```

内部的に呼ぶコマンド:

```bash
logex write                # /logex エントリポイント —— 下記ワークフローへの導線
logex list                 # 最近のセッション（Claude Code + Codex）
logex prepare <jsonl>      # parse → chunk → score → 分割プロンプト（LLM 不要）
logex publish ...          # 記事を logex-data リポジトリへ publish
logex mcp                  # 他 agent 向け MCP server
```

**対応トランスクリプト。** parser は Claude Code と Codex の両方のセッション JSONL を読めます。自動検出（`logex list`）は `~/.claude/projects/` と `~/.codex/sessions/` の両方を走査します。任意の JSONL パスを直接指定することもできます：`/logex <path.jsonl>`。

### Claude Code 連携 (plugin + skill + hook)

plugin を入れれば skill と Stop hook が自動で有効になります:

```
/plugin marketplace add iamtouchskyer/logex
/plugin install logex@logex
```

含まれるもの:

- **Skill `logex`** — `/logex` スラッシュコマンド
- **Stop hook** — セッション終了時のリマインダ
- **`.claude-plugin/plugin.json`** — skill/hook をまとめるエントリ

### 他の agent 向け MCP (Cursor / Codex / Windsurf)

```bash
logex mcp
```

| Client | 設定 |
|--------|------|
| Cursor | `npm install -g @touchskyer/logex`、MCP server: command `logex`, args `["mcp"]` |
| Codex | `npm install -g @touchskyer/logex && codex mcp add logex -- logex mcp` |
| Windsurf / その他 | command `logex`, args `["mcp"]` |

Cursor は `~/.cursor/mcp.json`（プロジェクト単位なら `.cursor/mcp.json`）を読みます。他の MCP client も同様の形です：

```json
{
  "mcpServers": {
    "logex": { "command": "logex", "args": ["mcp"] }
  }
}
```

### 実験的インテグレーション

リポジトリには安定版前の最小統合も含まれます：**VS Code 拡張**（`vscode-extension/`、コマンドパレット → `Logex: Prepare Session for Article`——セッションを選び `logex prepare` を実行し、JSON 結果を開く）と **Pi 拡張**の skeleton（`pi-extension/`、ランタイム動作は未実装）。

### License

MIT.

---

## 한국어

### logex 란

`logex` 는 코딩 agent(Claude Code, Codex) 세션의 JSONL 트랜스크립트를 블로그 품질의 기술 기사로 바꿉니다. 지루한 작업(parse, chunk, score, 시그널별 그룹핑)은 순수 pipeline 으로 처리하고, **토픽 분할**과 **작성**은 이미 세션 안에 있는 LLM 에게 맡깁니다 — 별도 API key 불필요. 긴 세션 하나로 보통 1〜3 개의 기사가 나옵니다. agent 가 chunk summary 를 읽고 쓸 가치가 있는 것을 고른 뒤, 구조화된 JSON 기사를 별도 data repo (`logex-data`) 로 publish 합니다.

Webapp 은 React + Vite SPA 로, data repo 를 읽어 [logex-io.vercel.app](https://logex-io.vercel.app) 에서 렌더링됩니다.

### 설치

```bash
npm install -g @touchskyer/logex
```

Node.js 18+ 필요.

### Quick Start — `/logex` workflow

Claude Code 에서:

```
/logex                    # 현재 세션으로 기사 작성
/logex <path.jsonl>       # 지정 JSONL 로 작성
/logex --list             # 최근 세션 목록
```

내부 실행 명령:

```bash
logex write                # /logex 진입점 —— 아래 워크플로 명령 안내
logex list                 # 최근 세션 (Claude Code + Codex)
logex prepare <jsonl>      # parse → chunk → score → 분할 프롬프트 (LLM 불필요)
logex publish ...          # logex-data 저장소에 기사 publish
logex mcp                  # 다른 agent 를 위한 MCP server
```

**지원 트랜스크립트.** parser 는 Claude Code 와 Codex 세션 JSONL 을 모두 읽습니다. 자동 탐색(`logex list`)은 `~/.claude/projects/` 와 `~/.codex/sessions/` 를 모두 스캔합니다. 임의의 JSONL 경로를 직접 지정할 수도 있습니다: `/logex <path.jsonl>`.

### Claude Code 통합 (plugin + skill + hook)

```
/plugin marketplace add iamtouchskyer/logex
/plugin install logex@logex
```

포함:

- **Skill `logex`** — `/logex` slash command
- **Stop hook** — 세션 종료 시 리마인더
- **`.claude-plugin/plugin.json`** — 통합 entry point

### 다른 agent 를 위한 MCP (Cursor / Codex / Windsurf)

```bash
logex mcp
```

| Client | 설정 |
|--------|-----|
| Cursor | `npm install -g @touchskyer/logex`, MCP: command `logex`, args `["mcp"]` |
| Codex | `npm install -g @touchskyer/logex && codex mcp add logex -- logex mcp` |
| Windsurf / 기타 | command `logex`, args `["mcp"]` |

Cursor 은 `~/.cursor/mcp.json`(프로젝트 단위는 `.cursor/mcp.json`)을 읽습니다. 다른 MCP client 도 같은 구조입니다:

```json
{
  "mcpServers": {
    "logex": { "command": "logex", "args": ["mcp"] }
  }
}
```

### 실험적 통합

저장소에는 아직 안정 버전이 아닌 최소 통합도 있습니다: **VS Code 확장**(`vscode-extension/`, 커맨드 팔레트 → `Logex: Prepare Session for Article`——세션을 고르고 `logex prepare`를 실행해 JSON 결과를 엽니다)과 **Pi 확장** skeleton(`pi-extension/`, 런타임 동작 미구현).

### License

MIT.

---

## Español

### Qué es logex

`logex` convierte los transcripts JSONL de sesiones de agentes de código (Claude Code, Codex) en artículos técnicos con calidad de blog. La parte aburrida (parse, chunk, score, agrupación por señal) vive en un pipeline puro; la **segmentación por tema** y la **redacción** las hace el LLM que ya está en la sesión — sin API key adicional. Una sesión larga típicamente produce 1–3 artículos: el agent lee los resúmenes de chunk, decide qué vale la pena escribir y publica artículos JSON estructurados en un repo de datos aparte (`logex-data`).

La webapp es una SPA React + Vite que lee ese repo y se despliega en [logex-io.vercel.app](https://logex-io.vercel.app).

### Instalación

```bash
npm install -g @touchskyer/logex
```

Requiere Node.js 18+.

### Quick Start — el workflow `/logex`

En Claude Code:

```
/logex                    # escribir artículos desde la sesión actual
/logex <path.jsonl>       # desde un JSONL específico
/logex --list             # listar sesiones recientes
```

Comandos subyacentes:

```bash
logex write                # punto de entrada de /logex — apunta al flujo de abajo
logex list                 # sesiones recientes (Claude Code + Codex)
logex prepare <jsonl>      # parse → chunk → score → prompt de segmentación (sin LLM)
logex publish ...          # publica artículos en el repo logex-data
logex mcp                  # servidor MCP para otros agentes
```

**Transcripts admitidos.** El parser lee tanto JSONL de Claude Code como de Codex. El autodescubrimiento (`logex list`) escanea `~/.claude/projects/` y `~/.codex/sessions/`; también puedes pasar cualquier ruta JSONL directamente: `/logex <path.jsonl>`.

### Integración Claude Code (plugin + skill + hook)

```
/plugin marketplace add iamtouchskyer/logex
/plugin install logex@logex
```

Incluye:

- **Skill `logex`** — comando `/logex` y procedimiento completo
- **Stop hook** — recordatorio al final de la sesión
- **`.claude-plugin/plugin.json`** — entry point del plugin

### MCP para otros agentes (Cursor / Codex / Windsurf)

```bash
logex mcp
```

| Cliente | Configuración |
|---------|---------------|
| Cursor | `npm install -g @touchskyer/logex`, MCP: command `logex`, args `["mcp"]` |
| Codex | `npm install -g @touchskyer/logex && codex mcp add logex -- logex mcp` |
| Windsurf / otros | command `logex`, args `["mcp"]` |

Cursor lee `~/.cursor/mcp.json` (o `.cursor/mcp.json` por proyecto); la mayoría de clientes MCP usan la misma forma:

```json
{
  "mcpServers": {
    "logex": { "command": "logex", "args": ["mcp"] }
  }
}
```

### Integraciones experimentales

El repo también incluye integraciones mínimas que aún no son parte de la superficie estable: una **extensión de VS Code** (`vscode-extension/`, paleta de comandos → `Logex: Prepare Session for Article` — elige una sesión, ejecuta `logex prepare` y abre el JSON resultante) y un esqueleto de **extensión Pi** (`pi-extension/`, sin comportamiento en runtime todavía).

### Licencia

MIT.
