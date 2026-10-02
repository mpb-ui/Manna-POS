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

test("finishing grosir tersimpan, terhidrasi dan dapat dihapus tanpa mengubah harga lama", async () => {
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
    const state = await ok("/api/bootstrap");
    const original = state.finishings.find((f) => state.products.some((p) => p.finishing?.some((item) => item.id === f.id)));
    const payload = { ...original, priceTiers: [{ min: 10, max: "", price: 1234 }] };
    const updated = await ok(`/api/finishings/${original.id}`, "PUT", payload);
    assert.deepEqual(updated.priceTiers, [{ min: 10, max: null, price: 1234 }]);
    const hydrated = await ok("/api/bootstrap");
    assert.deepEqual(hydrated.products.find((p) => p.finishing?.some((f) => f.id === original.id)).finishing.find((f) => f.id === original.id).priceTiers, updated.priceTiers);
    const legacy = { ...payload }; delete legacy.priceTiers;
    assert.deepEqual((await ok(`/api/finishings/${original.id}`, "PUT", legacy)).priceTiers, updated.priceTiers);
    assert.equal((await request(`/api/finishings/${original.id}`, "PUT", { ...payload, priceTiers: [{ min: 1, price: -1 }] })).status, 400);
    assert.deepEqual((await ok(`/api/finishings/${original.id}`, "PUT", { ...payload, priceTiers: [] })).priceTiers, []);
    const created = await ok("/api/finishings", "POST", { ...payload, code: "TEST-GROSIR", name: "Test Grosir" });
    assert.deepEqual(created.priceTiers, updated.priceTiers);
    assert.equal((await request("/api/finishings", "POST", { ...payload, code: "INVALID", name: "Invalid", priceTiers: [{ min: 1, price: 5 }, { min: 2, price: 4 }] })).status, 400);
  } finally { child.kill(); await new Promise((resolve) => child.once("exit", resolve)); }
});
