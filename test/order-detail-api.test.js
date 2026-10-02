import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test("deadline semua status dibatasi Owner/Kasir dan pickup belum lunas memerlukan konfirmasi", async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [new URL("../server.js", import.meta.url).pathname], {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: "", PORT: String(port), APP_PIN: "1234" }, stdio: "ignore"
  });
  const root = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try { ready = (await fetch(`${root}/api/health`)).ok; } catch { /* server still starting */ }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, "server lokal berjalan");
    const login = await fetch(`${root}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", pin: "1234" }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const request = async (path, method = "GET", payload, auth = cookie) => {
      const response = await fetch(`${root}${path}`, { method, headers: { "content-type": "application/json", cookie: auth }, body: payload === undefined ? undefined : JSON.stringify(payload) });
      return { status: response.status, body: await response.json() };
    };
    const ok = async (path, method, payload) => {
      const response = await request(path, method, payload);
      assert.ok(response.status >= 200 && response.status < 300, JSON.stringify(response.body));
      return response.body;
    };
    const order = await ok("/api/orders", "POST", { customerName: "Deadline Test", items: [{ productId: "poster-albatros", width: 0.9, length: 1, quantity: 1, finishing: [] }] });
    for (const [role, username] of [["CASHIER", "kasir-deadline"], ["ADMIN", "admin-deadline"], ["PRINT", "print-deadline"]]) {
      await ok("/api/users", "POST", { name: username, username, pin: "5678", role });
    }
    const loginRole = async (username) => {
      const response = await fetch(`${root}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, pin: "5678" }) });
      assert.equal(response.status, 200); return response.headers.get("set-cookie").split(";")[0];
    };
    const cashier = await loginRole("kasir-deadline");
    for (const username of ["admin-deadline", "print-deadline"]) assert.equal((await request(`/api/orders/${order.id}/deadline`, "PATCH", { deadline: "2026-10-03T10:00:00+08:00" }, await loginRole(username))).status, 403);
    assert.equal((await request(`/api/orders/${order.id}/deadline`, "PATCH", { deadline: "invalid" })).status, 400);
    const changed = await request(`/api/orders/${order.id}/deadline`, "PATCH", { deadline: "2026-10-03T10:00:00+08:00" }, cashier);
    assert.equal(changed.status, 200); assert.equal(changed.body.deadline, "2026-10-03T02:00:00.000Z");
    assert.match(changed.body.timeline[0].message, /Tidak ditentukan.*WITA/);assert.equal(changed.body.timeline[0].actor, "kasir-deadline");
    const again = await ok(`/api/orders/${order.id}/deadline`, "PATCH", { deadline: changed.body.deadline });assert.equal(again.timeline.length, changed.body.timeline.length);
    await ok(`/api/orders/${order.id}/payments`, "POST", { method: "TUNAI", amount: 1 });
    await ok(`/api/orders/${order.id}/design-pic`, "PATCH", { designPic: "Gema" });
    let index = 1;
    for (const status of ["DESAIN", "CETAK", "FINISHING", "SELESAI"]) {
      if (status !== "DESAIN") await ok(`/api/orders/${order.id}/status`, "PATCH", { status });
      const updated = await ok(`/api/orders/${order.id}/deadline`, "PATCH", { deadline: `2026-10-0${++index}T10:00:00+08:00` });
      assert.equal(updated.status, status); assert.match(updated.timeline[0].message, /Deadline diubah/);
    }
    const before = (await ok("/api/bootstrap")).orders.find(o => o.id === order.id);
    const blocked = await request(`/api/orders/${order.id}/status`, "PATCH", { status: "DIAMBIL" });assert.equal(blocked.status, 409);assert.equal(blocked.body.code, "UNPAID_PICKUP_CONFIRMATION");
    assert.equal((await ok("/api/bootstrap")).orders.find(o => o.id === order.id).status, "SELESAI");
    const picked = await ok(`/api/orders/${order.id}/status`, "PATCH", { status: "DIAMBIL", confirmUnpaid: true });
    assert.equal(picked.status, "DIAMBIL");assert.equal(picked.paidAmount, 1);assert.equal(picked.total, before.total);assert.equal(picked.paymentStatus, "BELUM_LUNAS");assert.equal(picked.stockCommitted, true);assert.ok(picked.timeline.some(t => /belum lunas dikonfirmasi/.test(t.message)));
    const after = await ok(`/api/orders/${order.id}/deadline`, "PATCH", { deadline: "2026-10-09T10:00:00+08:00" });assert.equal(after.status, "DIAMBIL");
  } finally { child.kill(); await new Promise(resolve => child.once("exit", resolve)); }
});
