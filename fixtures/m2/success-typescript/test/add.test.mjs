import assert from "node:assert/strict";
import test from "node:test";

import { add } from "../src/add.mjs";

test("adds two values", () => assert.equal(add(2, 3), 5));
