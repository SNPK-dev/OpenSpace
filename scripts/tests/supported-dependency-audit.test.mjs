import assert from "node:assert/strict";
import test from "node:test";
import { excludedRoots } from "../security/dependency-audit-policy.mjs";

const excluded = (path) => excludedRoots.some((pattern) => pattern.test(path));

test("recognizes pnpm 11 preview workspace paths", () => {
  assert.equal(excluded("apps__mobile>expo>tar"), true);
  assert.equal(excluded("apps__desktop-mac>electron>package"), true);
});

test("does not exclude supported clients", () => {
  assert.equal(excluded("apps__web-client>vite>esbuild"), false);
  assert.equal(excluded("apps__desktop-win>electron>package"), false);
});
