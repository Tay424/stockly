import assert from "node:assert/strict";
import { test } from "node:test";

import { destinationFor } from "./destination.js";
import { generateTemporaryPassword } from "./password.js";

test("destination forces password change when flagged", () => {
  assert.equal(destinationFor({ role: "user", mustChangePassword: true }), "/change-password");
  assert.equal(destinationFor({ role: "admin", mustChangePassword: true }), "/change-password");
});

test("destination routes by role when password is settled", () => {
  assert.equal(destinationFor({ role: "admin", mustChangePassword: false }), "/admin");
  assert.equal(destinationFor({ role: "user" }), "/dashboard");
});

test("temporary passwords are long enough and not identical", () => {
  const a = generateTemporaryPassword();
  const b = generateTemporaryPassword();
  assert.equal(a.length, 12);
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9]+$/);
});
