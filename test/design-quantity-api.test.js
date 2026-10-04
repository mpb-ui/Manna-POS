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

test("jumlah dan catatan biaya design tersimpan pada pesanan dan edit draft", async () => {
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
    const item = { productId: "poster-albatros", width: 0.9, length: 1, quantity: 2, finishing: [], fileServiceId: "DESIGN_C", fileServiceQuantity: 3, fileServiceNote: "Design tiga versi" };
    const missingPhone = await request("/api/orders", "POST", { customerName: "Tanpa WA", items: [item] });
    assert.equal(missingPhone.status, 400);
    assert.match(missingPhone.body.error, /WhatsApp wajib/);
    const invalidPhone = await request("/api/orders", "POST", { customerName: "WA Salah", phone: "abc", items: [item] });
    assert.equal(invalidPhone.status, 400);
    assert.match(invalidPhone.body.error, /WhatsApp yang valid/);
    const order = await ok("/api/orders", "POST", { customerName: "Tes Design", phone: "081234567890", items: [item] });
    assert.equal(order.items[0].fileServiceTotal, 150000);
    assert.equal(order.items[0].fileService.quantity, 3);
    assert.equal(order.items[0].fileService.note, item.fileServiceNote);
    const state = await ok("/api/bootstrap");
    const saved = state.orders.find(o => o.id === order.id);
    assert.equal(saved.items[0].fileService.note, item.fileServiceNote);
    const edited = await ok(`/api/orders/${order.id}`, "PUT", { customerName: "Tes Design", phone: "081234567890", items: [{ ...item, fileServiceQuantity: 2, fileServiceNote: "Dua versi" }] });
    assert.equal(edited.items[0].fileServiceTotal, 100000);
    assert.equal(edited.items[0].fileService.note, "Dua versi");
    const invalidEdit = await request(`/api/orders/${order.id}`, "PUT", { customerName: "Tanpa WA", items: [item] });
    assert.equal(invalidEdit.status, 400);
    assert.match(invalidEdit.body.error, /WhatsApp wajib/);
    const international = await ok(`/api/orders/${order.id}`, "PUT", { customerName: "Tes Design", phone: "+6281234567890", items: [item] });
    assert.equal(international.phone, "+6281234567890");
    assert.equal((await request("/api/orders", "POST", { customerName: "Invalid", phone: "081234567890", items: [{ ...item, fileServiceQuantity: 1.5 }] })).status, 400);
  } finally { child.kill(); await new Promise(resolve => child.once("exit", resolve)); }
});
