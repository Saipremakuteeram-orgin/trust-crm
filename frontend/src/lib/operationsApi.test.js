import assert from "node:assert/strict";
import test from "node:test";
import { ALL_TRUSTS_ID, canRetryInTrustContext } from "./operationsApi.js";

test("retry actions are unavailable while Operations is in the all-trust read-only context", () => {
  assert.equal(canRetryInTrustContext("admin", ALL_TRUSTS_ID), false);
  assert.equal(canRetryInTrustContext("accountant", ALL_TRUSTS_ID), false);
  assert.equal(canRetryInTrustContext("admin", "trust-a"), true);
  assert.equal(canRetryInTrustContext("accountant", "trust-a"), true);
  assert.equal(canRetryInTrustContext("viewer", "trust-a"), false);
});
