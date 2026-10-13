import test from "node:test";
import assert from "node:assert/strict";
import { projectDeadlineInfo } from "../public/project-deadline.js";

const now = "2026-10-13T17:30:00+08:00";
const job = deadline => ({ status: "DESAIN", deadline });

test("deadline terlambat menampilkan jumlah hari kalender WITA", () => {
  assert.deepEqual(projectDeadlineInfo(job("2026-10-12T23:59:00+08:00"), now), { label: "Terlambat 1 hari", state: "late", overdueDays: 1 });
  assert.deepEqual(projectDeadlineInfo(job("2026-10-10T08:00:00+08:00"), now), { label: "Terlambat 3 hari", state: "late", overdueDays: 3 });
  assert.equal(projectDeadlineInfo(job("2026-10-11T08:00:00+08:00"), now).label, "Terlambat 2 hari");
});

test("pergantian tanggal WITA, tahun dan bulan kabisat dihitung dengan benar", () => {
  assert.equal(projectDeadlineInfo(job("2026-10-12T15:59:00Z"), "2026-10-12T16:01:00Z").overdueDays, 1);
  assert.equal(projectDeadlineInfo(job("2026-12-31T23:59:00+08:00"), "2027-01-01T00:01:00+08:00").overdueDays, 1);
  assert.equal(projectDeadlineInfo(job("2024-02-28T08:00:00+08:00"), "2024-03-01T08:00:00+08:00").overdueDays, 2);
});

test("hari ini dan besok mempertahankan jam, lewat beberapa jam belum dihitung satu hari", () => {
  assert.deepEqual(projectDeadlineInfo(job("2026-10-13T16:00:00+08:00"), now), { label: "Hari ini, 16.00", state: "late", overdueDays: 0 });
  assert.deepEqual(projectDeadlineInfo(job("2026-10-13T18:00:00+08:00"), now), { label: "Hari ini, 18.00", state: "today", overdueDays: 0 });
  assert.deepEqual(projectDeadlineInfo(job("2026-10-14T08:00:00+08:00"), now), { label: "Besok, 08.00", state: "future", overdueDays: 0 });
  assert.equal(projectDeadlineInfo(job(now), now).state, "today");
});

test("produk selesai atau diambil tidak mendapat peringatan keterlambatan baru", () => {
  for (const status of ["SELESAI", "DIAMBIL"]) {
    assert.deepEqual(projectDeadlineInfo({ ...job("2026-10-10T08:00:00+08:00"), status }, now), { label: "10 Okt, 08.00", state: "future", overdueDays: 0 });
  }
});

test("deadline kosong atau invalid aman dan tiap produk dihitung secara independen", () => {
  for (const deadline of [null, "", "invalid"]) assert.deepEqual(projectDeadlineInfo(job(deadline), now), { label: "-", state: "none", overdueDays: 0 });
  const items = [job("2026-10-12T08:00:00+08:00"), job("2026-10-14T08:00:00+08:00")];
  const before = structuredClone(items);
  assert.deepEqual(items.map(item => projectDeadlineInfo(item, now).state), ["late", "future"]);
  assert.deepEqual(items, before);
});
