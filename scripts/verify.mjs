import { spawn } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const version = packageJson.version;
if (typeof version !== "string" || version.length === 0) {
  throw new Error("package.json must define a non-empty string version");
}
const checks = [
  ["unit tests", "npm", ["run", "test:unit"]],
  ["lint", "npm", ["run", "lint"]],
  ["production dependency audit", "npm", ["audit", "--omit=dev"]],
  ["extension build", "npm", ["run", "build"]],
  ["source and archive validation", "npm", ["run", "validate"]],
  ["AMO validation (Firefox)", "npx", ["--yes", "addons-linter@10.10.0", "--warnings-as-errors", `dist/koalashot-firefox-${version}.zip`]],
];

function runCheck([label, command, args]) {
  return new Promise((resolve, reject) => {
    console.log(`\n==> ${label}`);
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env },
      shell: process.platform === "win32",
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} failed with exit code ${code}`));
      }
    });
  });
}

for (const check of checks) {
  await runCheck(check);
}

console.log("\nRelease verification passed");
