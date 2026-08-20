import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requested = process.argv.slice(2);
const validTargets = new Set(["chrome", "firefox"]);
const targets = requested.length > 0 ? requested : ["chrome", "firefox"];

if (targets.some((target) => !validTargets.has(target))) {
  throw new Error("Browser targets must be chrome or firefox.");
}

function run(target, denial) {
  return new Promise((resolve, reject) => {
    const label = `${target}${denial ? " permission denial" : " full flow"}`;
    console.log(`\n==> ${label}`);
    const child = spawn(process.execPath, ["tests/browser/extension-flow.test.mjs"], {
      cwd: root,
      env: {
        ...process.env,
        KOALASHOT_BROWSER: target,
        KOALASHOT_CLIPBOARD_DENIAL: denial ? "1" : "0",
      },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${label} failed with exit code ${code}`)));
  });
}

for (const target of targets) {
  await run(target, false);
  await run(target, true);
}

console.log("\nBrowser matrix passed");
