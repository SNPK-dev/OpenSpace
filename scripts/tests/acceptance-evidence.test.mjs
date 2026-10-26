import test from "node:test";
import assert from "node:assert/strict";
import { sanitize, validateEvidence } from "../acceptance/evidence.mjs";

test("sanitizes nested secrets and bearer values", () => {
  assert.deepEqual(sanitize({ token: "abc", nested: { password: "def", log: "Authorization: Bearer xyz" } }), { token: "[REDACTED]", nested: { password: "[REDACTED]", log: "Authorization: Bearer [REDACTED]" } });
});
test("fails when a required phase is absent or failed", () => {
  assert.throws(() => validateEvidence({ schema: "openspace.acceptance/v1", phases: [] }, ["install"]), /missing required phase/);
  assert.throws(() => validateEvidence({ schema: "openspace.acceptance/v1", phases: [{ name: "install", status: "failed" }] }, ["install"]), /did not pass/);
});
test("accepts complete evidence", () => {
  assert.doesNotThrow(() => validateEvidence({ schema: "openspace.acceptance/v1", phases: [{ name: "install", status: "passed" }] }, ["install"]));
});
