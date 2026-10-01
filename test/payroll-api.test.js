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

test("API payroll membatasi data sensitif, menjaga snapshot, finalisasi dan pembayaran", async () => {
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
    let employees = await ok("/api/employees");
    assert.deepEqual(employees.map(item => item.name), ["Maria"]);
    let [slip] = await ok("/api/payrolls/period", "POST", { period: "2026-09" });
    assert.equal(slip.calculation.amounts.netSalary, 2250000);
    assert.equal((await ok("/api/payrolls/period", "POST", { period: "2026-09" })).length, 1);
    slip = await ok(`/api/payrolls/${slip.id}`, "PUT", { revision: slip.revision, input: { absentDays: 1, lateIncidents: 1, lateExtraMinutes: 10, overtimeHours: 1.5 }, overrides: { extraBonus: 100000 }, notes: "Uji gaji" });
    assert.equal(slip.calculation.amounts.absenceDeduction, 76923);
    assert.equal(slip.calculation.amounts.lateDeduction, 25000);
    assert.equal(slip.calculation.amounts.attendanceBonus, 0);
    assert.equal(slip.calculation.amounts.netSalary, 2013077);
    assert.equal((await request(`/api/payrolls/${slip.id}`, "PUT", { revision: 1 })).status, 400);
    const latestEmployee = await ok(`/api/employees/${employees[0].id}`, "PUT", { ...employees[0], name: "Maria Baru", basicSalary: 3000000 });
    const history = await ok("/api/payrolls?period=2026-09");
    assert.equal(history[0].employee.name, "Maria");
    assert.equal(history[0].employee.basicSalary, 2000000);
    assert.equal((await request(`/api/payrolls/${slip.id}/status`, "PATCH", { revision: slip.revision, action: "PAY", paidDate: "2026-10-01" })).status, 400);
    assert.equal((await request("/api/payrolls/period/finalize", "POST", { period: "2026-09", revisions: [] })).status, 400);
    [slip] = await ok("/api/payrolls/period/finalize", "POST", { period: "2026-09", revisions: [{ id: slip.id, revision: slip.revision }] });
    assert.equal(slip.status, "FINAL");
    assert.equal((await request(`/api/payrolls/${slip.id}`, "PUT", { revision: slip.revision, input: {} })).status, 400);
    slip = await ok(`/api/payrolls/${slip.id}/status`, "PATCH", { revision: slip.revision, action: "PAY", paidDate: "2026-10-01" });
    assert.equal(slip.status, "PAID");
    slip = await ok(`/api/payrolls/${slip.id}/status`, "PATCH", { revision: slip.revision, action: "REOPEN", reason: "Koreksi jumlah absen" });
    assert.equal(slip.previousVersions[0].status, "PAID");
    assert.equal(slip.previousVersions[0].calculation.amounts.netSalary, 2013077);
    assert.equal((await request(`/api/employees/${employees[0].id}`, "DELETE", { revision: employees[0].revision })).status, 400);
    await ok(`/api/employees/${latestEmployee.id}`, "DELETE", { revision: latestEmployee.revision });
    assert.equal((await ok("/api/payrolls/period", "POST", { period: "2026-10" })).length, 0);
    assert.equal((await ok("/api/payrolls?period=2026-09"))[0].employee.name, "Maria");
    await ok("/api/users", "POST", { name: "Kasir Payroll", username: "payroll-cashier", pin: "7890", role: "CASHIER" });
    const cashierLogin = await fetch(`${root}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "payroll-cashier", pin: "7890" }) });
    const cashierCookie = cashierLogin.headers.get("set-cookie").split(";")[0];
    const attempts = [["/api/employees", "GET"], ["/api/employees", "POST", {}], [`/api/employees/${latestEmployee.id}`, "PUT", {}], [`/api/employees/${latestEmployee.id}`, "DELETE", {}], ["/api/payrolls", "GET"], ["/api/payrolls/period", "POST", { period: "2026-10" }], ["/api/payrolls/preview", "POST", {}], [`/api/payrolls/${slip.id}`, "PUT", {}], [`/api/payrolls/${slip.id}/status`, "PATCH", {}], ["/api/payrolls/period/finalize", "POST", { period: "2026-09" }]];
    for (const [path, method, payload] of attempts) assert.equal((await request(path, method, payload, cashierCookie)).status, 403, path);
    const bootstrap = await request("/api/bootstrap", "GET", undefined, cashierCookie);
    assert.equal(bootstrap.status, 200); assert.ok(!Object.hasOwn(bootstrap.body, "employees")); assert.ok(!Object.hasOwn(bootstrap.body, "payrolls"));
    const adminUser = await ok("/api/users", "POST", { name: "Admin Payroll", username: "payroll-admin", pin: "6789", role: "ADMIN" });
    const adminLogin = await fetch(`${root}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: adminUser.username, pin: "6789" }) });
    const adminCookie = adminLogin.headers.get("set-cookie").split(";")[0];
    assert.equal((await request("/api/payrolls", "GET", undefined, adminCookie)).status, 200);
  } finally { child.kill(); }
});
