import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = [
  ["unit tests", "npm", ["run", "test:unit"]],
  ["lint", "npm", ["run", "lint"]],
  ["production dependency audit", "npm", ["audit", "--omit=dev"]],
  ["extension build", "npm", ["run", "build"]],
  ["source and archive validation", "npm", ["run", "validate"]],
  ["AMO validation (Firefox)", "npx", ["--yes", "addons-linter@10.10.0", "--warnings-as-errors", "dist/koalashot-firefox-0.2.0.zip"]],
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
