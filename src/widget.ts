/**
 * MCP App widget (runs in the sandboxed iframe inside the chat).
 *
 * Demonstrates how to:
 *   1. Leave the widget background transparent so Claude's chat surface shows
 *      through (every frame between your widget and the chat surface already
 *      has a transparent background).
 *   2. Read `hostContext` from the host (theme + style tokens) and re-apply it
 *      when the user switches light/dark mode.
 *   3. Style elements with the host's CSS custom properties
 *      (`--color-text-primary`, `--font-sans`, `--border-radius-md`, …) so the
 *      widget looks native in any host.
 */
import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";

const themeLabel = document.getElementById("theme-label")!;

/** Apply the parts of hostContext that affect styling. Safe to call with partial updates. */
function applyHostContext(ctx: Partial<McpUiHostContext>): void {
  if (ctx.theme) {
    // Sets <html data-theme="…"> and CSS `color-scheme` so `light-dark()` and
    // native controls (scrollbars, form inputs) follow the host theme.
    applyDocumentTheme(ctx.theme);
    themeLabel.textContent = ctx.theme;
  }
  if (ctx.styles?.variables) {
    // Exposes the host's design tokens as CSS custom properties on :root.
    applyHostStyleVariables(ctx.styles.variables);
  }
  if (ctx.styles?.css?.fonts) {
    // Injects the host's @font-face rules (Claude provides Anthropic Sans).
    applyHostFonts(ctx.styles.css.fonts);
  }
}

const app = new App({ name: "transparent-widget-sample", version: "1.0.0" });

// Register the change listener *before* connect() so no updates are missed.
// The host sends only the fields that changed; getHostContext() stays merged.
app.addEventListener("hostcontextchanged", (changed) => applyHostContext(changed));

await app.connect();

// Initial context is available once the initialize handshake completes.
const initial = app.getHostContext();
if (initial) applyHostContext(initial);
