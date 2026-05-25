# CSV Analyze

A full-stack web application that uses a two-agent AI pipeline (via `@anthropic-ai/claude-agent-sdk`) to automatically analyze uploaded CSV files — generating Vega-Lite charts and written insights.

Runs on [EdgeOne Pages Functions](https://edgeone.ai/) (Tencent Cloud) with a React + Tailwind frontend.

## Features

- **Drag & drop CSV upload** with automatic encoding detection (UTF-8, GBK, UTF-16)
- **Two-agent pipeline**:
  - **Chart Agent** — profiles CSV data and generates 3–6 Vega-Lite charts rendered as SVG
  - **Insight Agent** — reads chart metadata and writes data-driven insights with specific numbers
- **Real-time SSE streaming** — watch agents think and work in real time
- **Markdown + HTML reports** — downloadable analysis reports with embedded SVGs
- **Analysis history** — persistent history with full artifact retrieval via EdgeOne store
- **Demo mode** — faster analysis with fewer charts for quick previews

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Tailwind CSS v4, Framer Motion, CSS Modules |
| Backend | EdgeOne Pages Functions (file-based routing) |
| AI | `@anthropic-ai/claude-agent-sdk` (MCP tools) |
| Charts | Vega-Lite (server-side SVG rendering) |
| CSV | PapaParse, iconv-lite, simple-statistics |

## Getting Started

### Prerequisites

- Node.js 18+
- An AI gateway or Anthropic API key

### Install

```bash
npm install
```

### Environment Variables

Create a `.env` file:

```env
AI_GATEWAY_BASE_URL=https://your-gateway-url
AI_GATEWAY_API_KEY=your-api-key
```

### Development

Both servers must run simultaneously:

```bash
edgeone pages dev
```

### Build

```bash
edgeone pages build
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React SPA)                                        │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐  │
│  │DropZone │→ │ PassCard │→ │AgentCanvas│→ │ReportView │  │
│  └─────────┘  └──────────┘  └───────────┘  └───────────┘  │
│        │              SSE stream ↑                           │
└────────┼──────────────────────┼─────────────────────────────┘
         ↓ POST /upload         ↓ POST /analyze/stream
┌─────────────────────────────────────────────────────────────┐
│  EdgeOne Pages Functions                                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  analyze()                                             │ │
│  │  ┌─────────────┐         ┌──────────────┐             │ │
│  │  │ Chart Agent │ ──MCP──→│ Insight Agent│             │ │
│  │  │ (3-6 charts)│         │ (insights)   │             │ │
│  │  └─────────────┘         └──────────────┘             │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### API Routes

All routes use POST (EdgeOne runtime limitation):

| Route | Purpose |
|-------|---------|
| `/upload` | Multipart CSV upload; returns taskId + profile |
| `/analyze` | `action: "get"\|"start"\|"cancel"\|"delete"` |
| `/analyze/stream` | SSE stream (body: `{taskId}`) |
| `/analyze/rerun-insights` | Re-run insight agent on existing charts |
| `/analyze/download` | Download report files |
| `/static` | Serve generated SVG/chart files |
| `/history` | Per-conversation analysis history |
| `/history/detail` | Full analysis artifacts |

### Project Structure

```
csv-analyze/
├── agents/                  # Backend (EdgeOne Pages Functions)
│   ├── _lib/               # Shared libraries
│   │   ├── analyze.ts      # Two-agent orchestration
│   │   ├── system-prompt.ts # Agent system prompts
│   │   ├── report.ts       # Markdown/HTML report assembly
│   │   ├── session.ts      # In-memory session management
│   │   ├── events.ts       # Typed event protocol
│   │   ├── tools/
│   │   │   ├── chart-agent/   # MCP tools for Chart Agent
│   │   │   ├── insight-agent/ # MCP tools for Insight Agent
│   │   │   └── shared/       # Shared utilities (CSV stats, cache)
│   │   └── ...
│   ├── analyze/            # /analyze routes
│   ├── history/            # /history routes
│   ├── upload/             # /upload route
│   └── static/             # /static route
├── src/                    # Frontend (React SPA)
│   ├── components/         # UI components with CSS Modules
│   ├── hooks/              # useAgentStream (SSE state machine)
│   ├── lib/                # API client, event types, formatters
│   └── types.ts            # Frontend type definitions
├── index.html
├── package.json
└── CLAUDE.md               # AI assistant instructions
```
