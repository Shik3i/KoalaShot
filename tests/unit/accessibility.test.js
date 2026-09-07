import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/../g).map((part) => Number.parseInt(part, 16) / 255);
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("actual light/dark primary button colors, including hover, meet WCAG AA", () => {
  for (const file of ["landing/styles.css", "extension/popup/popup.css", "extension/editor/editor.css"]) {
    const css = readFileSync(resolve(ROOT, file), "utf8");
    const colors = [...css.matchAll(/--button-primary(?:-hover)?:\s*(#[0-9a-f]{6})/gi)];
    assert.equal(colors.length, 4, `${file} must define normal/hover colors in both themes`);
    assert.match(css, /\.button-primary\s*\{[^}]*color:\s*#fff\s*;/);
    for (const [, background] of colors) {
      assert.ok(contrastRatio("#ffffff", background) >= 4.5, `${file}: ${background} is below 4.5:1`);
    }
  }
});

test("editor exposes a keyboard-operable annotation surface and selection list", () => {
  const html = readFileSync(resolve(ROOT, "extension/editor/editor.html"), "utf8");
  assert.match(html, /id="interaction-canvas"[^>]*tabindex="0"[^>]*role="application"/);
  assert.match(html, /aria-describedby="editor-keyboard-help"/);
  assert.match(html, /id="annotation-list"/);
  assert.match(html, /arrow keys move the selection/i);
});
