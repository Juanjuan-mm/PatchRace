import assert from "node:assert/strict";
import test from "node:test";

test("intentional task failure", () => assert.equal(1, 2));
