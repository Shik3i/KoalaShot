import { performance } from "node:perf_hooks";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { DocumentHistory } from "../extension/editor/history.js";

const annotations = Array.from({ length: 300 }, (_, i) => ({
  id: `audit-${String(i).padStart(8, "0")}`, type: "pen", color: "#000000", strokeWidth: 3,
  points: Array.from({ length: 500 }, (_, j) => ({ x: j, y: i })),
}));
const history = new DocumentHistory({ annotations, crop: null });
const timings = [];
for (let i = 0; i < 10; i++) {
  const start = performance.now();
  const state = history.peekState();
  const next = [...state.annotations];
  next[0] = { ...next[0], points: next[0].points.map((point, index) => index ? point : { ...point, x: i + 1 }) };
  history.apply("move", { ...state, annotations: next });
  timings.push(Number((performance.now() - start).toFixed(3)));
}
globalThis.gc?.();
const start = performance.now();
for (let i = 0; i < 10000; i++) history.peekState();
const result = {
  annotations: 300, pointsPerAnnotation: 500, historySteps: 10, timingsMs: timings,
  heapUsedMiB: Number((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)),
  tenThousandReadMs: Number((performance.now() - start).toFixed(3)),
  runtime: process.version,
  note: "Node model benchmark using immutable production update/read path. Excludes DOM rendering, draft serialization, browser GC and export. Not a browser FPS measurement; retained heap after optional GC differs from historical peak heap.",
};
const directory = resolve(process.env.KOALASHOT_AUDIT_OUTPUT || ".cache/regressions");
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, "history-results.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
