const { spawnSync } = require("node:child_process");

const scriptArgs = process.argv.slice(2);
if (scriptArgs.length === 0) {
  console.error("Usage: node scripts/run-python.cjs <script> [args…]");
  process.exit(2);
}

const configured = process.env.KOALASHOT_PYTHON;
const candidates = configured
  ? [{ command: configured, args: [] }]
  : process.platform === "win32"
    ? [{ command: "py", args: ["-3"] }, { command: "python", args: [] }, { command: "python3", args: [] }]
    : [{ command: "python3", args: [] }, { command: "python", args: [] }];

for (const candidate of candidates) {
  const result = spawnSync(candidate.command, [...candidate.args, ...scriptArgs], { stdio: "inherit" });
  if (!result.error) {
    process.exit(result.status ?? 1);
  }
  if (result.error.code !== "ENOENT") {
    console.error(`Could not start ${candidate.command}: ${result.error.message}`);
    process.exit(1);
  }
}

console.error("No Python 3 interpreter found. Set KOALASHOT_PYTHON to its executable path.");
process.exit(1);
