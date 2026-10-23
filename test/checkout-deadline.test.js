import test from "node:test";
import assert from "node:assert/strict";
import { checkoutDeadline, deadlineLocalValue, DEADLINE_HOURS, DEADLINE_MINUTES } from "../public/checkout-deadline.js";

test("checkout deadlines accept only operational quarter hours and persist WITA correctly", () => {
  assert.equal(checkoutDeadline(""), null);
  for (const hour of DEADLINE_HOURS) for (const minute of DEADLINE_MINUTES) {
    const value = `2026-10-23T${hour}:${minute}`;
    if (hour === "18" && minute !== "00") assert.throws(() => checkoutDeadline(value), /08:00/);
    else assert.equal(deadlineLocalValue(checkoutDeadline(value)), value);
  }
  assert.equal(checkoutDeadline("2026-10-23T08:00"), "2026-10-23T00:00:00.000Z");
  assert.equal(checkoutDeadline("2026-10-23T18:00+08:00"), "2026-10-23T10:00:00.000Z");
  for (const value of ["2026-10-23T07:45", "2026-10-23T18:15", "2026-10-23T19:00", "2026-10-23T09:10", "2026-02-30T08:00", "invalid"]) assert.throws(() => checkoutDeadline(value));
  const legacy = "2026-10-23T23:12:00+08:00";
  assert.equal(checkoutDeadline("2026-10-23T23:12", legacy), legacy);
  assert.equal(checkoutDeadline("2026-10-23T09:15", legacy), "2026-10-23T01:15:00.000Z");
});
