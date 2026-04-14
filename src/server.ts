/**
 * Minimal MCP App server demonstrating a transparent, theme-aware widget.
 *
 * One tool (`show_theme_demo`) is registered with a UI resource. When Claude
 * calls the tool, the host fetches the `ui://` resource and renders the
 * returned HTML in a sandboxed iframe inside the conversation.
 *
 * Run with `npm start` (Streamable HTTP on :3030, for Claude.ai custom
 * connectors) or `npm start -- --stdio` (for Claude Desktop config).
 */
import { fileURLToPath } from "node:url";
import * as path from "node:path";

import * as esbuild from "esbuild";
import express from "express";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import type { McpUiResourceMeta } from "@modelcontextprotocol/ext-apps";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WIDGET_URI = "ui://transparent-widget-sample/widget.html";

// ---------------------------------------------------------------------------
// Widget HTML
// ---------------------------------------------------------------------------

/**
 * Bundle src/widget.ts (and the ext-apps SDK it imports) into a single IIFE
 * so the widget HTML is fully self-contained — no CDN, no separate build step.
 */
async function bundleWidgetJs(): Promise<string> {
  const result = await esbuild.build({
    entryPoints: [path.join(HERE, "widget.ts")],
    bundle: true,
    format: "esm",
    target: "es2022",
    minify: true,
    write: false,
  });
  return result.outputFiles[0].text;
}

/**
 * The widget HTML shell.
 *
 * Key points for transparency:
 *   • `<meta name="color-scheme" content="light dark">` — without this the
 *     browser paints an opaque white (light) or black (dark) backdrop behind
 *     the iframe's document, defeating transparency.
 *   • `html, body { background: transparent }` — don't paint a background;
 *     let the host's chat surface show through.
 *
 * Everything else is styled with `var(--color-*)` / `var(--font-*)` tokens
 * that the host supplies via `hostContext.styles.variables`. Fallback values
 * keep things readable outside a host.
 */
async function buildWidgetHtml(): Promise<string> {
  const js = await bundleWidgetJs();
  return /* html */ `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="light dark" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        background: transparent; /* <- lets Claude's surface show through */
      }
      body {
        font-family: var(--font-sans, system-ui, sans-serif);
        font-size: var(--font-text-sm-size, 14px);
        line-height: var(--font-text-sm-line-height, 1.4);
        color: var(--color-text-primary, light-dark(#141413, #faf9f5));
      }
      .card {
        border: var(--border-width-regular, 0.5px) solid
          var(--color-border-primary, light-dark(rgba(31,30,29,.4), rgba(222,220,209,.4)));
        border-radius: var(--border-radius-md, 8px);
        padding: 16px;
      }
      .heading {
        margin: 0 0 8px;
        font-size: var(--font-heading-md-size, 16px);
        font-weight: var(--font-weight-semibold, 600);
      }
      .note {
        margin: 8px 0 0;
        color: var(--color-text-secondary, light-dark(#3d3d3a, #c2c0b6));
      }
      .swatches {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }
      .swatch {
        flex: 1;
        height: 28px;
        border-radius: var(--border-radius-sm, 6px);
        border: var(--border-width-regular, 0.5px) solid var(--color-border-tertiary);
      }
      .pill {
        display: inline-block;
        padding: 2px 8px;
        border-radius: var(--border-radius-full, 9999px);
        background: var(--color-background-inverse);
        color: var(--color-text-inverse);
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: var(--font-text-xs-size, 12px);
      }
    </style>
  </head>
  <body>
    <div class="card">
      <p class="heading">
        Host theme: <span class="pill" id="theme-label">…</span>
      </p>
      <p class="note">
        This widget has a <strong>transparent background</strong> — you're
        seeing Claude's chat surface behind it. Text, borders and the swatches
        below use the host's style tokens, so they flip automatically when you
        toggle light/dark mode.
      </p>
      <div class="swatches">
        <div class="swatch" style="background: var(--color-background-primary)"></div>
        <div class="swatch" style="background: var(--color-background-secondary)"></div>
        <div class="swatch" style="background: var(--color-background-tertiary)"></div>
        <div class="swatch" style="background: var(--color-background-info)"></div>
        <div class="swatch" style="background: var(--color-background-success)"></div>
      </div>
    </div>
    <script type="module">${js.replace(/<\/script>/gi, "<\\/script>")}</script>
  </body>
</html>`;
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

/**
 * UI metadata attached to the resource (listing-level) and each content item.
 *   • `prefersBorder: false` asks the host to render the widget *without* its
 *     own border/background chrome. Claude defaults to borderless already,
 *     but the spec recommends being explicit since other hosts differ.
 *   • `csp.resourceDomains` allows the Anthropic Sans @font-face URLs that
 *     Claude injects via `hostContext.styles.css.fonts`.
 */
const UI_META: McpUiResourceMeta = {
  prefersBorder: false,
  csp: {
    resourceDomains: ["https://assets.claude.ai"],
  },
};

function buildServer(widgetHtml: string): McpServer {
  const server = new McpServer({
    name: "transparent-widget-sample",
    version: "1.0.0",
  });

  registerAppTool(
    server,
    "show_theme_demo",
    {
      title: "Show theme demo",
      description:
        "Render a small transparent widget that shows the current host theme " +
        "and a handful of host style tokens. Use this when the user asks to " +
        "see the MCP App theme demo.",
      _meta: { ui: { resourceUri: WIDGET_URI } },
    },
    async () => ({
      content: [
        {
          type: "text",
          text: "Rendered the transparent theme-token demo widget.",
        },
      ],
    })
  );

  registerAppResource(
    server,
    "Transparent Theme Demo",
    WIDGET_URI,
    { _meta: { ui: UI_META } },
    async () => ({
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml,
          _meta: { ui: UI_META },
        },
      ],
    })
  );

  return server;
}

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

const widgetHtml = await buildWidgetHtml();

if (process.argv.includes("--stdio")) {
  // Claude Desktop: one long-lived stdio connection.
  const server = buildServer(widgetHtml);
  await server.connect(new StdioServerTransport());
  console.error("[transparent-widget-sample] ready on stdio");
} else {
  // Claude.ai custom connector: Streamable HTTP. A fresh McpServer + transport
  // is created per request (stateless mode) to keep the sample minimal.
  const PORT = Number(process.env.PORT ?? 3030);
  const app = express();
  app.use(express.json({ limit: "4mb" }));

  app.all("/mcp", async (req, res) => {
    const server = buildServer(widgetHtml);
    // Stateless mode: each HTTP request gets its own server+transport, so
    // there's no session to track across requests.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.listen(PORT, () => {
    console.error(
      `[transparent-widget-sample] Streamable HTTP ready on http://localhost:${PORT}/mcp`
    );
    console.error(
      `[transparent-widget-sample] (or run \`npm start -- --stdio\` for Claude Desktop)`
    );
  });
}
