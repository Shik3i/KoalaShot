import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredDocuments = [
  "README.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  "CHANGELOG.md",
  "docs/RELEASE.md",
  "docs/LANDING_DEPLOYMENT.md",
];

function markdownFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "dist", "node_modules"].includes(entry.name)) {
      continue;
    }
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...markdownFiles(absolute));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      result.push(absolute);
    }
  }
  return result;
}

for (const relative of requiredDocuments) {
  if (!fs.existsSync(path.join(root, relative))) {
    throw new Error(`Required project document is missing: ${relative}`);
  }
}

const linkPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const problems = [];
for (const file of markdownFiles(root)) {
  const source = fs.readFileSync(file, "utf8");
  let match;
  while ((match = linkPattern.exec(source)) !== null) {
    const target = match[1].replace(/^<|>$/g, "");
    if (/^(?:https?:|mailto:|#|\/\/)/i.test(target)) {
      continue;
    }
    const [relativeTarget] = target.split("#", 1);
    if (!relativeTarget) {
      continue;
    }
    const resolved = path.resolve(path.dirname(file), decodeURIComponent(relativeTarget));
    if (!fs.existsSync(resolved)) {
      problems.push(`${path.relative(root, file)} -> ${target}`);
    }
  }
}

if (problems.length > 0) {
  throw new Error(`Broken Markdown links:\n${problems.join("\n")}`);
}

console.log(`Documentation audit passed: ${markdownFiles(root).length} Markdown files checked.`);
