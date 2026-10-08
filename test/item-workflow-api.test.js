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

test("workflow per item: akses, produk identik, timeline, stok konkuren, pembayaran dan pickup", async () => {
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
    let order = await ok("/api/orders", "POST", { customerName: "Dua Produk", phone: "081234567890", deadline: "2026-10-08T10:00:00+08:00", items: [{ productId: "poster-albatros", width: .9, length: 1, quantity: 2 }, { productId: "poster-albatros", width: .9, length: 2, quantity: 3 }] });
    const originalIds = order.items.map(i=>i.itemId);
    assert.equal(new Set(originalIds).size,2);
    // Reordering an edited draft preserves each existing identity; new rows get new identities.
    order = await ok(`/api/orders/${order.id}`, "PUT", {customerName:order.customerName,phone:order.phone,deadline:order.deadline,items:order.items.toReversed().map(i=>({...i,length:i.actualLength}))});
    assert.deepEqual(order.items.map(i=>i.itemId), originalIds.toReversed());
    const total=order.total;
    order=await ok(`/api/orders/${order.id}/payments`, "POST", { method: "TUNAI", amount: 1 });
    const [first,second]=order.items;
    const path=(item,field)=>`/api/orders/${order.id}/items/${item.itemId}/${field}`;
    const auths={};
    for (const [role,name,permissions] of [["DESIGN","design"],["PRINT","print"],["ADMIN","restricted-admin"],["MANAGER","manager"],["MANAGER","limited-manager",["projects.orders"]],["CASHIER","cashier"]]) {
      await ok("/api/users", "POST", {name,username:name,pin:"5678",role,...(permissions?{permissions}:{})});
      const response=await fetch(`${root}/api/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username:name,pin:"5678"})});
      auths[name]=response.headers.get("set-cookie").split(";")[0];
    }
    const deadlineA="2026-10-08T11:00:00+08:00",deadlineB="2026-10-09T12:00:00+08:00";
    for (const name of ["design","print","restricted-admin","limited-manager"]) assert.equal((await request(path(first,"deadline"),"PATCH",{deadline:deadlineA},auths[name])).status,403);
    assert.equal((await request(path(first,"deadline"),"PATCH",{deadline:deadlineA},auths.manager)).status,200);
    assert.equal((await request(path(second,"deadline"),"PATCH",{deadline:deadlineB},auths.cashier)).status,200);
    assert.equal((await request(path(first,"deadline"),"PATCH",{deadline:"invalid"})).status,400);
    assert.equal((await request(path(first,"design-pic"),"PATCH",{designPic:"Gema"},auths.print)).status,403);
    await ok(path(first,"design-pic"),"PATCH",{designPic:"Gema"});
    order=await ok(path(second,"design-pic"),"PATCH",{designPic:"Qori"});
    assert.equal(order.items[0].designPic,"Gema");assert.equal(order.items[1].designPic,"Qori");
    const before=await ok("/api/bootstrap");
    assert.equal((await request(path(first,"status"),"PATCH",{status:"CETAK"},auths.print)).status,400);
    await ok(`/api/orders/${order.id}/hold`,"PATCH",{reason:"Menunggu approval customer"});
    assert.equal((await request(path(first,"status"),"PATCH",{status:"CETAK"},auths.design)).status,409);
    await ok(`/api/orders/${order.id}/hold`,"PATCH",{release:true});
    const designResponse=await request(path(second,"status"),"PATCH",{status:"CETAK",expectedStatus:"DESAIN"},auths.design);
    assert.equal(designResponse.status,200);assert.equal(designResponse.body.total,undefined);assert.equal(designResponse.body.payments,undefined);assert.equal(designResponse.body.items[0].subtotal,undefined);
    assert.equal((await request(path(second,"status"),"PATCH",{status:"FINISHING"},auths.design)).status,400);
    await ok(path(second,"status"),"PATCH",{status:"FINISHING",expectedStatus:"CETAK"});
    order=(await ok("/api/bootstrap")).orders.find(o=>o.id===order.id);
    assert.deepEqual(order.items.map(i=>i.status),["DESAIN","FINISHING"]);assert.equal(order.status,"DESAIN");
    assert.equal(order.items[0].deadline,"2026-10-08T03:00:00.000Z");assert.equal(order.items[1].deadline,"2026-10-09T04:00:00.000Z");
    assert.equal(order.stockCommitted,false);assert.deepEqual((await ok("/api/bootstrap")).inventory,before.inventory);
    await ok(path(first,"status"),"PATCH",{status:"CETAK"});
    await ok(path(first,"status"),"PATCH",{status:"FINISHING"});
    assert.equal((await request(path(first,"status"),"PATCH",{status:"DIAMBIL"})).status,400);
    const results=await Promise.all([first,second,first,second].map(item=>request(path(item,"status"),"PATCH",{status:"SELESAI",expectedStatus:"FINISHING"},auths.print)));
    assert.equal(results.filter(r=>r.status===200).length,2);assert.equal(results.filter(r=>r.status===409).length,2);
    const after=await ok("/api/bootstrap");order=after.orders.find(o=>o.id===order.id);
    assert.equal(order.status,"SELESAI");assert.equal(order.total,total);assert.equal(order.paidAmount,1);assert.equal(order.payments.length,1);assert.equal(order.stockCommitted,true);
    const used=order.items.flatMap(i=>i.materials?.length?i.materials:[{sku:i.stockSku,units:i.stockConsumption}]);
    for (const stock of before.inventory) {
      const consumption=used.filter(s=>s.sku===stock.sku || s.materialId && s.materialId===stock.materialId).reduce((sum,s)=>sum+Number(s.units||0),0);
      assert.equal(after.inventory.find(s=>s.sku===stock.sku).quantity,stock.quantity-consumption);
    }
    for (const item of order.items) assert.ok(order.timeline.some(t=>t.itemId===item.itemId && /Selesai/.test(t.message)));
    const blocked=await request(`/api/orders/${order.id}/status`,"PATCH",{status:"DIAMBIL"});assert.equal(blocked.status,409);assert.equal(blocked.body.code,"UNPAID_PICKUP_CONFIRMATION");
    order=await ok(`/api/orders/${order.id}/status`,"PATCH",{status:"DIAMBIL",confirmUnpaid:true});assert.equal(order.paidAmount,1);assert.ok(order.items.every(i=>i.status==="DIAMBIL"));
    assert.deepEqual((await ok("/api/bootstrap")).inventory,after.inventory);
    const report=await ok("/api/reports?from=2026-01-01&to=2027-01-01");assert.equal(report.summary.orders,1);assert.equal(report.summary.sales,total);assert.equal(report.summary.paid,1);assert.equal(report.summary.outstanding,total-1);
  } finally { child.kill(); await new Promise(resolve => child.once("exit", resolve)); }
});
