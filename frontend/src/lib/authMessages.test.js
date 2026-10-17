import test from "node:test";
import assert from "node:assert/strict";
import { formatAuthError, isNetworkAuthError } from "./authMessages.js";

test("maps invalid credentials to a safe login message", () => {
  assert.equal(
    formatAuthError({ message: "Invalid login credentials" }),
    "Email or password is incorrect."
  );
});

test("explains a paused or unreachable Supabase project", () => {
  assert.equal(
    formatAuthError(new TypeError("NetworkError when attempting to fetch resource."), { code: "network" }),
    "Supabase cannot be reached right now. The project may be paused or waking up. Restore it in the Supabase Dashboard and try again."
  );
});

test("recognizes browser network failures", () => {
  assert.equal(isNetworkAuthError(new TypeError("Failed to fetch")), true);
  assert.equal(isNetworkAuthError({ message: "Invalid login credentials" }), false);
});
