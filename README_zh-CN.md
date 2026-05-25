# CSV Analyze

一个全栈 Web 应用，使用双 Agent AI 流水线（基于 `@anthropic-ai/claude-agent-sdk`）自动分析上传的 CSV 文件——生成 Vega-Lite 图表和文字洞察。

运行在 [EdgeOne Pages Functions](https://edgeone.ai/)（腾讯云）上，前端使用 React + Tailwind。

## 功能特性

- **拖拽上传 CSV**，自动编码检测（UTF-8、GBK、UTF-16）
- **双 Agent 流水线**：
  - **Chart Agent** — 分析 CSV 数据结构，生成 3–6 张 Vega-Lite 图表并渲染为 SVG
  - **Insight Agent** — 读取图表元数据，撰写基于数据的洞察（包含具体数字）
- **实时 SSE 流** — 实时观看 Agent 的思考和工作过程
- **Markdown + HTML 报告** — 可下载的分析报告，内嵌 SVG 图表
- **分析历史** — 通过 EdgeOne store 持久化保存历史记录和完整制品
- **Demo 模式** — 更快速的分析，生成更少图表，适合快速预览

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18, Tailwind CSS v4, Framer Motion, CSS Modules |
| 后端 | EdgeOne Pages Functions（基于文件路由） |
| AI | `@anthropic-ai/claude-agent-sdk`（MCP 工具） |
| 图表 | Vega-Lite（服务端 SVG 渲染） |
| CSV | PapaParse, iconv-lite, simple-statistics |

## 快速开始

### 前置要求

- Node.js 18+
- AI 网关或 Anthropic API 密钥

### 安装

```bash
npm install
```

### 环境变量

创建 `.env` 文件：

```env
AI_GATEWAY_BASE_URL=https://your-gateway-url
AI_GATEWAY_API_KEY=your-api-key
```

### 开发

两个服务器需要同时运行：

```bash
edgeone pages dev
```

### 构建

```bash
edgeone pages build
```

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│  浏览器 (React SPA)                                         │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐  │
│  │DropZone │→ │ PassCard │→ │AgentCanvas│→ │ReportView │  │
│  └─────────┘  └──────────┘  └───────────┘  └───────────┘  │
│        │              SSE 流 ↑                              │
└────────┼──────────────────────┼─────────────────────────────┘
         ↓ POST /upload         ↓ POST /analyze/stream
┌─────────────────────────────────────────────────────────────┐
│  EdgeOne Pages Functions                                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  analyze()                                             │ │
│  │  ┌─────────────┐         ┌──────────────┐             │ │
│  │  │ Chart Agent │ ──MCP──→│ Insight Agent│             │ │
│  │  │ (3-6 张图表) │         │ (撰写洞察)   │             │ │
│  │  └─────────────┘         └──────────────┘             │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### API 路由

所有路由使用 POST（EdgeOne 运行时限制）：

| 路由 | 用途 |
|------|------|
| `/upload` | Multipart CSV 上传；返回 taskId + profile |
| `/analyze` | `action: "get"\|"start"\|"cancel"\|"delete"` |
| `/analyze/stream` | SSE 流（body: `{taskId}`） |
| `/analyze/rerun-insights` | 基于已有图表重跑 Insight Agent |
| `/analyze/download` | 下载报告文件 |
| `/static` | 提供生成的 SVG/图表文件 |
| `/history` | 按对话维度的分析历史 |
| `/history/detail` | 完整分析制品 |

### 项目结构

```
csv-analyze/
├── agents/                  # 后端（EdgeOne Pages Functions）
│   ├── _lib/               # 共享库
│   │   ├── analyze.ts      # 双 Agent 编排
│   │   ├── system-prompt.ts # Agent 系统提示词
│   │   ├── report.ts       # Markdown/HTML 报告组装
│   │   ├── session.ts      # 内存 Session 管理
│   │   ├── events.ts       # 类型化事件协议
│   │   ├── tools/
│   │   │   ├── chart-agent/   # Chart Agent 的 MCP 工具
│   │   │   ├── insight-agent/ # Insight Agent 的 MCP 工具
│   │   │   └── shared/       # 共享工具（CSV 统计、缓存）
│   │   └── ...
│   ├── analyze/            # /analyze 路由
│   ├── history/            # /history 路由
│   ├── upload/             # /upload 路由
│   └── static/             # /static 路由
├── src/                    # 前端（React SPA）
│   ├── components/         # UI 组件 + CSS Modules
│   ├── hooks/              # useAgentStream（SSE 状态机）
│   ├── lib/                # API 客户端、事件类型、格式化工具
│   └── types.ts            # 前端类型定义
├── index.html
├── package.json
└── CLAUDE.md               # AI 助手指令
```
