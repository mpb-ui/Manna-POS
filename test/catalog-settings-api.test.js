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

test("pengaturan kategori dan PIC menjaga relasi dan akses API", async () => {
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
    let state = await ok("/api/bootstrap");
    const ordered = [...state.catalogOptions.categories].reverse();
    await ok("/api/category-order", "PUT", { categories: ordered });
    assert.deepEqual((await ok("/api/bootstrap")).catalogOptions.categories, ordered);
    assert.equal((await request("/api/category-order", "PUT", { categories: [] })).status, 400);
    await ok("/api/categories/products/ATK", "PUT", { name: "Alat Kantor" });
    state = await ok("/api/bootstrap");
    assert.equal(state.catalogOptions.categoryKeys["Alat Kantor"], "atk");
    assert.ok(!state.catalogOptions.categories.includes("ATK"));
    const direct = state.products.find((item) => item.category === "Alat Kantor" && item.retailAtK);
    const saved = await ok(`/api/products/${direct.id}`, "PUT", { ...direct, barcode: "001234TEST" });
    assert.equal(saved.retailAtK, true);
    assert.equal(saved.barcode, "001234TEST");
    await ok("/api/categories/products/Print%20A3%2B", "PUT", { name: "Cetak A3" });
    state = await ok("/api/bootstrap");
    const paper = state.products.find((item) => item.category === "Cetak A3" && item.a3Kind === "paper");
    const savedPaper = await ok(`/api/products/${paper.id}`, "PUT", paper);
    assert.equal(savedPaper.a3Kind, "paper");
    await ok("/api/categories/materials", "POST", { name: "Bahan Uji" });
    const material = await ok("/api/materials", "POST", { sku: "CAT-TEST", name: "Bahan kategori", unit: "pcs", stock: 7, category: "Bahan Uji" });
    assert.equal((await request("/api/categories/materials/Bahan%20Uji", "DELETE", {})).status, 400);
    await ok("/api/categories/materials/Bahan%20Uji", "DELETE", { replacement: "Lainnya" });
    state = await ok("/api/bootstrap");
    assert.equal(state.materials.find((item) => item.id === material.id).category, "Lainnya");
    assert.equal(state.inventory.find((item) => item.materialId === material.id).category, "Lainnya");
    const pic = await ok("/api/pics", "POST", { name: "PIC Mandiri Uji" });
    assert.ok(!state.users.some((user) => user.name === pic.name));
    const order = await ok("/api/orders", "POST", { customerName: "Tes PIC", items: [{ productId: direct.id, quantity: 25, finishing: [] }] });
    assert.equal(order.items[0].quantity, 25);
    await ok(`/api/orders/${order.id}/payments`, "POST", { method: "Tunai", amount: order.total });
    const assigned = await ok(`/api/orders/${order.id}/design-pic`, "PATCH", { designPic: pic.name });
    assert.equal(assigned.designPicId, pic.id);
    await ok(`/api/pics/${pic.id}`, "PUT", { name: "PIC Baru Uji" });
    state = await ok("/api/bootstrap");
    assert.equal(state.orders.find((item) => item.id === order.id).designPic, "PIC Baru Uji");
    await ok(`/api/pics/${pic.id}`, "DELETE");
    state = await ok("/api/bootstrap");
    assert.ok(!state.pics.some((item) => item.id === pic.id));
    assert.equal(state.orders.find((item) => item.id === order.id).designPic, "PIC Baru Uji");
    assert.equal((await request(`/api/orders/${order.id}/design-pic`, "PATCH", { designPic: "PIC Baru Uji" })).status, 400);
    await ok("/api/users", "POST", { name: "Kasir Uji", username: "settings-cashier", pin: "7890", role: "CASHIER" });
    const cashierLogin = await fetch(`${root}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "settings-cashier", pin: "7890" }) });
    const cashierCookie = cashierLogin.headers.get("set-cookie").split(";")[0];
    for (const [path, method, payload] of [["/api/category-order", "PUT", { categories: state.catalogOptions.categories }], ["/api/categories/products", "POST", { name: "Terlarang" }], ["/api/pics", "POST", { name: "Terlarang" }]]) {
      assert.equal((await request(path, method, payload, cashierCookie)).status, 403);
    }
  } finally { child.kill(); }
});
