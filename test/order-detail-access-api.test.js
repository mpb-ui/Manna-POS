import {secureFetch as fetch} from './helpers/http.js';
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";

test("detail order: nomor bebas, riwayat per role, dan Kasir hanya menyelesaikan produksi", async () => {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const child = spawn(process.execPath, ["server.js"], {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: "", PORT: String(port), APP_PIN: "1234" }, stdio: "ignore"
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { ready = (await fetch(base + "/api/health")).ok; } catch { /* boot */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(ready);
    const login = async username => {
      const r = await fetch(base + "/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, pin: "1234" }) });
      assert.equal(r.status, 200);
      return r.headers.get("set-cookie").split(";")[0];
    };
    const owner = await login("admin");
    const request = async (path, method = "GET", body, cookie = owner) => {
      const r = await fetch(base + path, { method, headers: { "content-type": "application/json", cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: r.status, body: await r.json() };
    };
    const ok = async (...args) => { let r=await request(...args); // These fixtures intentionally use separate customers sharing a phone/name.
      if(r.body?.code==='CUSTOMER_MATCH_REQUIRED'&&args[1]==='POST')r=await request(args[0],args[1],{...args[2],newCustomerConfirmedIds:r.body.matches.map(c=>c.id)},args[3]); assert.ok(r.status < 300, JSON.stringify(r)); return r.body; };
    const fullDetail = ["orders.view", "projects.orders", "projects.waiting", "projects.money", "projects.status", "pos.payment"];
    const sessions = {};
    for (const [name, role, permissions] of [
      ["cash", "CASHIER"], ["manager", "MANAGER"], ["administrator", "ADMIN"],
      ["design", "DESIGN", fullDetail], ["print", "PRINT", fullDetail], ["warehouse", "WAREHOUSE", fullDetail],
      ["cash-custom", "CASHIER", [...fullDetail, "orders.pickup"]], ["cash-limited", "CASHIER", ["orders.view"]]
    ]) {
      await ok("/api/users", "POST", { name, username: name, role, pin: "1234", briefingProfile: "none", ...(permissions ? { permissions } : {}) });
      sessions[name] = await login(name);
    }
    await ok("/api/inventory/BHN-BLF", "PATCH", { change:100, reason:"Stok bahan untuk pengujian produksi" });
    const item = { productId: "poster-backlite-film", sizeVariantId: "a3", quantity: 1, finishing: [] };
    let order;
    for (const phone of ["0", "1", "6789", "123456", "08165", "62818", "123456789012345678901234567890"]) {
      const name = "Customer " + phone;
      const customer = await ok("/api/customers", "POST", { name, phone, requestId: "customer-" + phone }, sessions.cash);
      assert.equal(customer.phone, phone);
      const updatedPhone = "9" + phone;
      const edited = await ok(`/api/customers/${customer.id}`, "PUT", { name, phone: updatedPhone });
      assert.equal(edited.phone, updatedPhone);
      order = await ok("/api/orders", "POST", { customerId: customer.id, customerName: name, phone: updatedPhone, items: [item, item] }, sessions.cash);
      assert.equal(order.phone, updatedPhone);
      order = await ok(`/api/orders/${order.id}`, "PUT", { customerName: name, customerId: customer.id, phone: updatedPhone, items: [item, item] }, sessions.cash);
      assert.equal(order.phone, updatedPhone);
    }
    for (const phone of ["", "   "]) assert.equal((await request("/api/customers", "POST", { name: "Empty", phone })).status, 400);
    const emptyCustomer = await request("/api/customers", "POST", { name: "Empty", phone: "" });
    assert.match(emptyCustomer.body.error, /WhatsApp wajib/);
    order = await ok(`/api/orders/${order.id}/payments`, "POST", { method: "TUNAI", amount: 1000 }, sessions.cash);
    const paymentId = order.payments[0].id;
    const adminPayment = await ok(`/api/orders/${order.id}/payments`, "POST", { method: "QRIS", amount: 1000 }, sessions.administrator);
    assert.equal(adminPayment.payments, undefined);
    assert.equal(adminPayment.paidAmount, 2000);
    for (const name of ["administrator", "design", "print", "warehouse"]) {
      const cookie = sessions[name];
      const detail = await ok(`/api/order-history/${order.id}`, "GET", undefined, cookie);
      assert.equal(detail.payments, undefined, name);
      assert.ok(detail.timeline.some(row => row.message === "Pesanan dibuat di POS"), name);
      assert.ok(detail.total > 0, name);
      const boot = await ok("/api/bootstrap?view=projects", "GET", undefined, cookie);
      assert.equal(boot.orders.find(o => o.id === order.id).payments, undefined, name);
      assert.equal((await request(`/api/order-history/${order.id}/payments/${paymentId}`, "GET", undefined, cookie)).status, 403, name);
      assert.equal((await request(`/api/orders/${order.id}/cash-receipts`, "GET", undefined, cookie)).status, 403, name);
    }
    for (const cookie of [owner, sessions.manager, sessions.cash]) {
      const detail = await ok(`/api/order-history/${order.id}`, "GET", undefined, cookie);
      assert.equal(detail.payments.length, 2);
      assert.equal((await ok(`/api/order-history/${order.id}/payments/${paymentId}`, "GET", undefined, cookie)).payment.amount, 1000);
      assert.equal((await ok(`/api/orders/${order.id}/cash-receipts`, "GET", undefined, cookie)).length, 2);
    }
    const path = item => `/api/orders/${order.id}/items/${item.itemId}`;
    for (const item of order.items) await ok(path(item) + "/design-pic", "PATCH", { designPic: "Gema" });
    for (const target of ["CETAK", "FINISHING"]) {
      const before = await ok(`/api/order-history/${order.id}`);
      for (const name of ["cash", "cash-custom"]) {
        for (const url of [path(order.items[0]) + "/status", `/api/orders/${order.id}/status`]) {
          const denied = await request(url, "PATCH", { status: target }, sessions[name]);
          assert.ok([400, 403].includes(denied.status), name + " " + target);
        }
      }
      assert.deepEqual(await ok(`/api/order-history/${order.id}`), before);
      // Keep both products in the same stage to exercise both status endpoints.
      await ok(`/api/orders/${order.id}/status`, "PATCH", { status: target });
    }
    assert.equal((await request(path(order.items[0]) + "/status", "PATCH", { status: "SELESAI" }, sessions["cash-limited"])).status, 403);
    const firstDone = await ok(path(order.items[0]) + "/status", "PATCH", { status: "SELESAI", expectedStatus: "FINISHING" }, sessions.cash);
    assert.equal(firstDone.status, "FINISHING");
    assert.equal(firstDone.stockCommitted, true);
    const finished = await ok(path(order.items[1]) + "/status", "PATCH", { status: "SELESAI" }, sessions["cash-custom"]);
    assert.equal(finished.status, "SELESAI");
    assert.equal(finished.stockCommitted, true);
    const pickup = await request(`/api/orders/${order.id}/status`, "PATCH", { status: "DIAMBIL" }, sessions.cash);
    assert.equal(pickup.status, 409);
    assert.equal(pickup.body.code, "UNPAID_PICKUP_CONFIRMATION");
    assert.equal((await ok(`/api/orders/${order.id}/status`, "PATCH", { status: "DIAMBIL", confirmUnpaid: true }, sessions.cash)).status, "DIAMBIL");
    const single = await ok("/api/orders", "POST", { customerName: "Single", phone: "7", items: [item] });
    await ok(`/api/orders/${single.id}/payments`, "POST", { method: "TUNAI", amount: single.total }, sessions.cash);
    await ok(`/api/orders/${single.id}/items/${single.items[0].itemId}/design-pic`, "PATCH", { designPic: "Gema" });
    for (const status of ["CETAK", "FINISHING"]) await ok(`/api/orders/${single.id}/status`, "PATCH", { status });
    assert.equal((await ok(`/api/orders/${single.id}/status`, "PATCH", { status: "SELESAI" }, sessions.cash)).status, "SELESAI");
    // Unpaid waiting orders can be cancelled by operational accounts, while a
    // confirmed payment (including PO with zero cash) makes cancellation Owner-only.
    for (const name of ["cash", "manager", "administrator"]) {
      const draft = await ok("/api/orders", "POST", { customerName: "Cancel " + name, phone: "1", items: [item] });
      const body = { requestId: "cancel-unpaid-" + name, reason: "Customer batal", disposition: "REFUND" };
      const beforeStock = (await ok("/api/bootstrap?view=stock")).inventory;
      const cancelled = await ok(`/api/orders/${draft.id}/cancel`, "POST", body, sessions[name]);
      assert.equal(cancelled.status, "BATAL");
      await ok(`/api/orders/${draft.id}/cancel`, "POST", body, sessions[name]);
      assert.equal((await ok(`/api/order-history/${draft.id}`)).timeline.filter(row => row.message.includes("Pesanan dibatalkan:")).length, 1);
      assert.deepEqual((await ok("/api/bootstrap?view=stock")).inventory, beforeStock);
    }
    for (const type of ["PAYMENT", "PO"]) {
      let paid = await ok("/api/orders", "POST", { customerName: "Cancel " + type, phone: "1", items: [item] });
      paid = await ok(`/api/orders/${paid.id}/payments`, "POST", type === "PO" ? { type, poNumber: "PO-01" } : { amount: 1000, method: "TUNAI" });
      const before = await ok(`/api/order-history/${paid.id}`);
      for (const name of ["cash", "cash-custom", "manager", "administrator", "design", "print", "warehouse"]) {
        const denied = await request(`/api/orders/${paid.id}/cancel`, "POST", { requestId: "denied-" + type + name, reason: "Unauthorized", disposition: "REFUND", method: "TRANSFER" }, sessions[name]);
        assert.equal(denied.status, 403, type + name);
      }
      assert.deepEqual(await ok(`/api/order-history/${paid.id}`), before);
      const body = { requestId: "owner-cancel-" + type, reason: "Owner menyetujui", disposition: "REFUND", method: "TRANSFER" };
      assert.equal((await ok(`/api/orders/${paid.id}/cancel`, "POST", body)).status, "BATAL");
      await ok(`/api/orders/${paid.id}/cancel`, "POST", body);
      const receipts = await ok(`/api/orders/${paid.id}/cash-receipts`);
      assert.equal(receipts.filter(row => row.kind === "REFUND").length, type === "PAYMENT" ? 1 : 0);
    }
    const timed = await ok("/api/orders", "POST", { customerName: "Deadline", phone: "1", deadline: "2026-10-23T08:15", items: [item] });
    assert.equal(timed.deadline, "2026-10-23T00:15:00.000Z");
    assert.match(timed.code, /^INV-\d{6}-\d{3,}$/);
    for (const deadline of ["2026-10-23T07:45", "2026-10-23T18:15", "2026-10-23T09:10"]) {
      assert.equal((await request("/api/orders", "POST", { customerName: "Invalid", phone: "1", deadline, items: [item] })).status, 400);
      assert.equal((await request(`/api/orders/${timed.id}`, "PUT", { customerName: "Invalid", phone: "1", deadline, items: [item] })).status, 400);
    }
    assert.equal((await ok(`/api/order-history/${timed.id}`)).customerName, "Deadline");
    assert.equal((await ok(`/api/order-history/${timed.id}`)).deadline, timed.deadline);
    const race = await ok("/api/orders", "POST", { customerName: "Race", phone: "1", items: [item] });
    const outcomes = await Promise.all([
      request(`/api/orders/${race.id}/payments`, "POST", { amount: 1000, method: "TUNAI" }),
      request(`/api/orders/${race.id}/cancel`, "POST", { requestId: "race-cancel", reason: "Cancel draft", disposition: "REFUND" }, sessions.cash)
    ]);
    assert.ok(outcomes[0].status === 200 && outcomes[1].status === 403 || outcomes[0].status === 400 && outcomes[1].status === 200);
    const raceResult = await ok(`/api/order-history/${race.id}`);
    assert.ok(raceResult.status === "BATAL" ? raceResult.paidAmount === 0 : raceResult.paidAmount === 1000);
  } finally {
    child.kill();
    await new Promise(resolve => child.once("exit", resolve));
  }
});
