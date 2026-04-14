# MCP App sample: transparent, theme-aware widget

A minimal [MCP App](https://github.com/modelcontextprotocol/ext-apps) server
whose widget **blends into Claude's chat surface** instead of sitting in an
opaque box, and picks up Claude's colors, fonts, and radii automatically in
both light and dark mode.

<p align="center"><em>One tool · one HTML resource · no framework</em></p>

## Run it

```bash
npm install
npm start                 # Streamable HTTP on http://localhost:3030/mcp
# or
npm start -- --stdio      # stdio transport, for Claude Desktop config
```

### Connect from Claude.ai

Claude.ai needs an HTTPS URL. Tunnel the local server with
[ngrok](https://ngrok.com/) (or similar):

```bash
ngrok http 3030
```

Then in Claude.ai go to **Settings → Connectors → Add custom connector** and
enter `https://<your-ngrok-host>/mcp`. Start a new chat and ask Claude to
*"show the theme demo"*. Toggle your Claude theme and watch the widget follow.

### Connect from Claude Desktop

Add this to `claude_desktop_config.json` (**Settings → Developer → Edit
Config**), adjusting the path, then restart the app:

```json
{
  "mcpServers": {
    "transparent-widget-sample": {
      "command": "npm",
      "args": ["start", "--prefix", "/absolute/path/to/mcp-transparent-widget-sample", "--", "--stdio"]
    }
  }
}
```

## How the transparency works

Claude renders MCP App widgets inside a sandboxed iframe, and every frame
between your widget and the chat surface already has a transparent background.
Three things on the **widget side** keep that transparency intact:

1. **Don't paint a body background.** `src/server.ts` → `buildWidgetHtml()`
   sets `html, body { background: transparent }`. Anything opaque here hides
   the chat surface.

2. **Declare `color-scheme`.** `<meta name="color-scheme" content="light dark">`
   stops the browser from inserting its own opaque white/near-black backdrop
   behind the iframe document when the host is in the opposite mode, and makes
   `light-dark()` in the token values resolve correctly.

3. **Ask for a borderless frame.** The resource's `_meta.ui.prefersBorder` is
   set to `false`, telling the host not to wrap the widget in its own bordered
   card. Claude's default is already borderless, but other hosts vary, so the
   spec recommends being explicit.

## How the theme tokens work

Claude passes a `hostContext` object to the widget during the `ui/initialize`
handshake and sends `ui/notifications/host-context-changed` whenever the user
switches theme. `src/widget.ts` wires this up with three SDK helpers:

| `hostContext` field      | SDK helper                | Effect                                                            |
| ------------------------ | ------------------------- | ----------------------------------------------------------------- |
| `theme`                  | `applyDocumentTheme`      | Sets `<html data-theme>` + CSS `color-scheme`                     |
| `styles.variables`       | `applyHostStyleVariables` | Writes `--color-*`, `--font-*`, `--border-*` etc. onto `:root`    |
| `styles.css.fonts`       | `applyHostFonts`          | Injects the host's `@font-face` rules (Claude ships Anthropic Sans) |

Once the variables are on `:root`, the widget's CSS just references them:

```css
body  { font-family: var(--font-sans); color: var(--color-text-primary); }
.card { border: var(--border-width-regular) solid var(--color-border-primary);
        border-radius: var(--border-radius-md); }
```

The values Claude ships use CSS `light-dark()`, so when
`applyDocumentTheme("dark")` flips `color-scheme`, every token resolves to its
dark variant with no extra work.

> The `@font-face` rules Claude provides point at `https://assets.claude.ai`,
> so the resource's `_meta.ui.csp.resourceDomains` allow-lists that origin.

## File map

```
src/server.ts   MCP server: registers the tool + ui:// resource, bundles the
                widget with esbuild at startup, serves over HTTP or stdio.
src/widget.ts   Runs inside the iframe: connects via App, applies hostContext,
                re-applies on host-context-changed.
```

## References

- [MCP Apps SDK](https://github.com/modelcontextprotocol/ext-apps) ·
  [API docs](https://modelcontextprotocol.github.io/ext-apps/api/)
- [Design guidelines — style variables](https://claude.com/docs/connectors/building/mcp-apps/design-guidelines)
  for the full token list
