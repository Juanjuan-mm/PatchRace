import assert from "node:assert/strict";
import test from "node:test";

import { divide } from "../src/divide.mjs";

test("divides ordinary values", () => assert.equal(divide(6, 2), 3));
