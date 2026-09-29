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

test("hapus master mengamankan relasi stok, pesanan, mesin, finishing, dan akses user", async () => {
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
    const initial = await ok("/api/bootstrap");
    const direct = initial.products.find((item) => item.category === "ATK" && item.retailAtK);
    const order = await ok("/api/orders", "POST", { customerName: "Uji Riwayat", items: [{ productId: direct.id, quantity: 1, finishing: [] }] });
    await ok(`/api/products/${direct.id}`, "DELETE");
    let bootstrap = await ok("/api/bootstrap");
    assert.ok(!bootstrap.products.some((item) => item.id === direct.id));
    assert.ok(!bootstrap.allProducts.some((item) => item.id === direct.id));
    assert.ok(bootstrap.orders.some((item) => item.id === order.id && item.items[0].productId === direct.id));
    assert.equal((await request("/api/orders", "POST", { customerName: "Ditolak", items: [{ productId: direct.id, quantity: 1 }] })).status, 400);
    assert.equal((await request(`/api/products/${direct.id}`, "PUT", direct)).status, 400);

    const material = await ok("/api/materials", "POST", { sku: "TEST-ARCHIVE-MAT", name: "Bahan Arsip Uji", unit: "pcs", stock: 3 });
    const machine = await ok("/api/machines", "POST", { code: "TEST-ARCHIVE-MACHINE", name: "Mesin Arsip Uji" });
    const finish = await ok("/api/finishings", "POST", { code: "TEST-ARCHIVE-FIN", name: "Finishing Arsip Uji", categories: ["Display & Banner"], price: 1000 });
    const product = await ok("/api/products", "POST", { sku: "TEST-ARCHIVE-PRD", name: "Produk Arsip Uji", category: "Display & Banner", price: 10000, saleUnit: "pcs", priceBasis: "unit", machineIds: [machine.id], materialSources: [{ materialId: material.id, quantity: 1 }], finishingIds: [finish.id] });
    assert.match((await request(`/api/materials/${material.id}`, "DELETE")).body.error, /masih digunakan produk aktif/);
    assert.match((await request(`/api/machines/${machine.id}`, "DELETE")).body.error, /masih digunakan produk aktif/);
    await ok(`/api/finishings/${finish.id}`, "DELETE");
    bootstrap = await ok("/api/bootstrap");
    assert.ok(!bootstrap.finishings.some((item) => item.id === finish.id));
    assert.ok(!bootstrap.products.find((item) => item.id === product.id).finishing.some((item) => item.id === finish.id));
    await ok(`/api/products/${product.id}`, "DELETE");
    assert.match((await request(`/api/materials/${material.id}`, "DELETE")).body.error, /Stok bahan harus nol/);
    await ok(`/api/inventory/${material.sku}`, "PATCH", { change: -3, reason: "Uji arsip" });
    await ok(`/api/materials/${material.id}`, "DELETE");
    await ok(`/api/machines/${machine.id}`, "DELETE");
    assert.equal((await request(`/api/inventory/${material.sku}`, "PATCH", { change: 1 })).status, 400);
    assert.equal((await request(`/api/machines/${machine.id}`, "PUT", { name: "Aktif Lagi", code: machine.code })).status, 400);
    bootstrap = await ok("/api/bootstrap");
    assert.ok(!bootstrap.materials.some((item) => item.id === material.id));
    assert.ok(!bootstrap.inventory.some((item) => item.materialId === material.id));
    assert.ok(!bootstrap.machines.some((item) => item.id === machine.id));
    assert.match((await request(`/api/users/${bootstrap.currentUser.id}`, "DELETE")).body.error, /akun sendiri/);
    const user = await ok("/api/users", "POST", { name: "User Arsip Uji", username: "archive-test", pin: "7890", role: "CASHIER" });
    const userLogin = await fetch(`${root}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "archive-test", pin: "7890" }) });
    assert.equal(userLogin.status, 200);
    const userCookie = userLogin.headers.get("set-cookie").split(";")[0];
    assert.equal((await request(`/api/machines/${machine.id}`, "DELETE", undefined, userCookie)).status, 403);
    await ok(`/api/users/${user.id}`, "DELETE");
    assert.equal((await request("/api/bootstrap", "GET", undefined, userCookie)).status, 401);
    bootstrap = await ok("/api/bootstrap");
    assert.ok(!bootstrap.users.some((item) => item.id === user.id));
    assert.ok(bootstrap.auditLogs.some((item) => item.action === "USER_DELETE"));
  } finally { child.kill(); }
});
