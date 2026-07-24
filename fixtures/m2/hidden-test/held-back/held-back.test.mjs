import assert from "node:assert/strict";
import test from "node:test";

import { divide } from "../src/divide.mjs";

test("rejects division by zero", () => assert.throws(() => divide(1, 0)));
