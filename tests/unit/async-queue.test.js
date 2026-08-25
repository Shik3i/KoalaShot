import assert from "node:assert/strict";
import test from "node:test";
import { createSerializedWriter } from "../../extension/common/async-queue.js";

test("serialized writer never overlaps writes", async () => {
  const events = [];
  let active = 0;
  let maximumActive = 0;
  const queue = createSerializedWriter(async (value) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    events.push(`start:${value}`);
    await new Promise((resolve) => setTimeout(resolve, value === 1 ? 10 : 0));
    events.push(`end:${value}`);
    active -= 1;
  });

  await Promise.all([queue(1), queue(2), queue(3)]);

  assert.equal(maximumActive, 1);
  assert.deepEqual(events, ["start:1", "end:1", "start:2", "end:2", "start:3", "end:3"]);
});

test("serialized writer continues after a failed write", async () => {
  const values = [];
  const queue = createSerializedWriter(async (value) => {
    values.push(value);
    if (value === "bad") {
      throw new Error("expected test failure");
    }
  });

  await queue("bad");
  await queue("good");

  assert.deepEqual(values, ["bad", "good"]);
});
