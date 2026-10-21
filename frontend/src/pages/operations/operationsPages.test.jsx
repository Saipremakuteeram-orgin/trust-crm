import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_TRUSTS_ID,
  getRoleCapabilities,
  getTrustOptions,
  isConcreteTrust,
  humanizeStatus,
} from "../../lib/operationsApi.js";

test("trust selector contract includes all trusts and concrete trusts", () => {
  const trusts = [
    { id: "trust-1", name: "Education Trust" },
    { id: "trust-2", name: "Relief Trust" },
    { id: "trust-3", name: "Community Trust" },
  ];

  assert.deepEqual(getTrustOptions(trusts), [
    { value: ALL_TRUSTS_ID, label: "All trusts (read-only)" },
    { value: "trust-1", label: "Education Trust" },
    { value: "trust-2", label: "Relief Trust" },
    { value: "trust-3", label: "Community Trust" },
  ]);
  assert.equal(getTrustOptions(trusts, false).length, 3);
  assert.equal(isConcreteTrust(ALL_TRUSTS_ID), false);
  assert.equal(isConcreteTrust("trust-2"), true);
});

test("role contract keeps writes and review actions separated", () => {
  const admin = getRoleCapabilities("admin");
  const accountant = getRoleCapabilities("accountant");
  const viewer = getRoleCapabilities("viewer");

  assert.equal(admin.canManage, true);
  assert.equal(admin.canApprove, true);
  assert.equal(admin.canReject, true);
  assert.equal(admin.canRetry, true);
  assert.equal(accountant.canCreate, true);
  assert.equal(accountant.canSubmit, true);
  assert.equal(accountant.canRetry, true);
  assert.equal(accountant.canApprove, false);
  assert.equal(accountant.canReject, false);
  assert.equal(viewer.canRead, true);
  assert.equal(viewer.canCreate, false);
  assert.equal(viewer.canSubmit, false);
  assert.equal(viewer.canApprove, false);
  assert.equal(viewer.canRetry, false);
});

test("status labels stay readable for operational states", () => {
  assert.equal(humanizeStatus("pending_approval"), "Pending Approval");
  assert.equal(humanizeStatus("retrying"), "Retrying");
});
