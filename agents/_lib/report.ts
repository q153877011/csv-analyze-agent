/**
 * Assembly layer: Build markdown + HTML reports from TaskContext.
 */
import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import type { TaskContext } from "./types.js";

export interface AssembleOptions {
  chartsOnly: boolean;
}

export interface AssembleResult {
  chartsReportPath: string;
  insightReportPath?: string;
  combinedReportPath: string;
  htmlReportPath?: string;
}

export async function assembleReports(
  ctx: TaskContext,
  opts: AssembleOptions,
): Promise<AssembleResult> {
  const chartsMd = buildChartsMd(ctx);
  const chartsReportPath = path.join(ctx.outDir, "charts.md");
  await writeFile(chartsReportPath, chartsMd, "utf-8");

  if (opts.chartsOnly) {
    return { chartsReportPath, combinedReportPath: chartsReportPath };
  }

  const insightMd = buildInsightMd(ctx);
  const insightReportPath = path.join(ctx.outDir, "insight.md");
  await writeFile(insightReportPath, insightMd, "utf-8");

  const combined = buildCombinedMd(ctx);
  const combinedReportPath = path.join(ctx.outDir, "report.md");
  await writeFile(combinedReportPath, combined, "utf-8");

  const htmlReportPath = path.join(ctx.outDir, "report.html");
  const html = await toInlineHtml(ctx);
  await writeFile(htmlReportPath, html, "utf-8");

  return {
    chartsReportPath,
    insightReportPath,
    combinedReportPath,
    htmlReportPath,
  };
}

function buildChartsMd(ctx: TaskContext): string {
  const lines: string[] = [];
  lines.push(`# Data Visualization Report`);
  lines.push(`> Auto-generated · ${ctx.charts.length} charts · Source: \`${basename(ctx.csvPath)}\``);
  lines.push("");
  ctx.charts.forEach((c, i) => {
    lines.push(`## ${i + 1}. ${c.title}`);
    lines.push("");
    if (c.description) {
      lines.push(`_${c.description}_`);
      lines.push("");
    }
    lines.push(`![${escapeAlt(c.title)}](./${c.relPath})`);
    lines.push("");
  });
  return lines.join("\n");
}

function buildInsightMd(ctx: TaskContext): string {
  const perChart = ctx.insights.filter((x) => x.kind === "per_chart");
  const summary = ctx.insights.find((x) => x.kind === "summary");

  const lines: string[] = [];
  lines.push(`# Data Insights Report`);
  lines.push(`> Source: \`${basename(ctx.csvPath)}\` · ${ctx.charts.length} charts, ${perChart.length} per-chart insights`);
  lines.push("");
  lines.push(`## Overall Conclusion`);
  lines.push(summary?.text ?? "(Insight agent did not generate a summary)");
  lines.push("");
  lines.push(`## Per-Chart Insights`);
  lines.push("");
  for (const c of ctx.charts) {
    const insights = perChart.filter((x) => x.chartId === c.id);
    if (insights.length === 0) continue;
    lines.push(`### ${c.title}`);
    lines.push("");
    for (const ins of insights) {
      lines.push(ins.text);
      lines.push("");
    }
  }
  return lines.join("\n");
}

function buildCombinedMd(ctx: TaskContext): string {
  const perChart = ctx.insights.filter((x) => x.kind === "per_chart");
  const summary = ctx.insights.find((x) => x.kind === "summary");

  const lines: string[] = [];
  lines.push(`# Data Analysis Report`);
  lines.push(`> Source: \`${basename(ctx.csvPath)}\``);
  lines.push("");
  lines.push(`## Overall Conclusion`);
  lines.push(summary?.text ?? "(Insight agent did not generate a summary)");
  lines.push("");
  ctx.charts.forEach((c, i) => {
    lines.push(`## ${i + 1}. ${c.title}`);
    lines.push("");
    if (c.description) {
      lines.push(`_${c.description}_`);
      lines.push("");
    }
    lines.push(`![${escapeAlt(c.title)}](./${c.relPath})`);
    lines.push("");
    const insights = perChart.filter((x) => x.chartId === c.id);
    for (const ins of insights) {
      lines.push(ins.text);
      lines.push("");
    }
  });
  return lines.join("\n");
}

async function toInlineHtml(ctx: TaskContext): Promise<string> {
  const perChart = ctx.insights.filter((x) => x.kind === "per_chart");
  const summary = ctx.insights.find((x) => x.kind === "summary");

  const sections: string[] = [];
  sections.push(`<h1>Data Analysis Report</h1>`);
  sections.push(
    `<p class="meta">Source: <code>${escapeHtml(basename(ctx.csvPath))}</code></p>`,
  );
  sections.push(`<h2>Overall Conclusion</h2>`);
  sections.push(`<p>${escapeHtml(summary?.text ?? "(Insight agent did not generate a summary)")}</p>`);

  for (let i = 0; i < ctx.charts.length; i++) {
    const c = ctx.charts[i]!;
    sections.push(`<h2>${i + 1}. ${escapeHtml(c.title)}</h2>`);
    if (c.description) {
      sections.push(`<p class="desc">${escapeHtml(c.description)}</p>`);
    }

    let svg = "";
    try {
      svg = await readFile(c.filePath, "utf-8");
    } catch {
      svg = `<em>[SVG not found: ${escapeHtml(c.relPath)}]</em>`;
    }
    sections.push(`<div class="chart">${svg}</div>`);

    const insights = perChart.filter((x) => x.chartId === c.id);
    for (const ins of insights) {
      sections.push(`<p class="insight">${escapeHtml(ins.text)}</p>`);
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(basename(ctx.csvPath))} — Data Analysis Report</title>
<style>
  :root {
    --bg: #ffffff;
    --fg: #222222;
    --muted: #666666;
    --desc: #555555;
    --accent: #1a73e8;
    --insight-bg: #f7faff;
    --code-bg: #f1f3f4;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0a0a0c;
      --fg: #e6e6e9;
      --muted: #9aa0a6;
      --desc: #c0c4ca;
      --accent: #00ffa3;
      --insight-bg: rgba(0,255,163,0.06);
      --code-bg: rgba(255,255,255,0.06);
    }
    .chart svg { filter: drop-shadow(0 0 0.5px rgba(255,255,255,0.3)); }
  }
  body { font-family: -apple-system, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
         max-width: 880px; margin: 40px auto; padding: 0 24px; color: var(--fg); background: var(--bg); line-height: 1.65; }
  h1 { border-bottom: 2px solid var(--accent); padding-bottom: 8px; }
  h2 { margin-top: 2em; border-left: 4px solid var(--accent); padding-left: 10px; }
  .meta { color: var(--muted); font-size: 0.9em; }
  .desc { color: var(--desc); font-style: italic; }
  .chart { margin: 1em 0; }
  .chart svg { max-width: 100%; height: auto; }
  .insight { background: var(--insight-bg); border-left: 3px solid var(--accent);
             padding: 8px 12px; border-radius: 3px; }
  code { background: var(--code-bg); padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
</style>
</head>
<body>
${sections.join("\n")}
</body>
</html>`;
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

function escapeAlt(s: string): string {
  return s.replace(/[\[\]]/g, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
