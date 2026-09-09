import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { t, language } from "../../extension/common/i18n.js";

const extension = fileURLToPath(new URL("../../extension", import.meta.url));
function sources(directory) {
  return readdirSync(directory, {withFileTypes:true}).flatMap(entry => entry.isDirectory()
    ? sources(join(directory, entry.name)) : /\.(html|js)$/.test(entry.name) ? [join(directory, entry.name)] : []);
}

test("every static UI catalog reference exists and English is the only shipping language", () => {
  assert.equal(language, "en");
  assert.deepEqual(readdirSync(join(extension, "_locales")), ["en"]);
  const manifestMessages = JSON.parse(readFileSync(join(extension, "_locales/en/messages.json"), "utf8"));
  for (const browser of ["chrome", "firefox"]) {
    const manifest = readFileSync(join(extension, "manifests", `${browser}.json`), "utf8");
    for (const match of manifest.matchAll(/__MSG_(\w+)__/g)) assert.ok(manifestMessages[match[1]]?.message);
  }
  for (const file of sources(extension)) {
    const source = readFileSync(file, "utf8");
    const keys = [...source.matchAll(/\bt\("([^"]+)"|data-i18n(?:-title|-aria-label|-placeholder|-alt)?="([^"]+)"/g)];
    for (const match of keys) assert.doesNotThrow(() => t(match[1] || match[2]), `${file}: ${match[1] || match[2]}`);
  }
});

test("message parameters remain literal and can be reordered by a future translation", () => {
  assert.equal(t("ui_capture_metadata", {width:1200, height:800, size:"0.42"}), "1200 × 800px · 0.42 MB");
  const detail = '<img src=x onerror=alert(1)> $& {count}';
  assert.equal(t("ui_export_failed", {detail}), `Screenshot captured, but export failed: ${detail} Copy or save the completed PNG again.`);
  assert.equal(t("ui_annotation_count_one", {count:1, selection:""}), "Annotation overlay. 1 annotation. ");
  assert.equal(t("ui_annotation_count_other", {count:2, selection:""}), "Annotation overlay. 2 annotations. ");
});
