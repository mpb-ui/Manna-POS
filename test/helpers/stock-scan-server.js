import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";
import assert from "node:assert/strict";

export async function startStockTestServer(t, { cwd = new URL("../..", import.meta.url).pathname, databaseUrl = "", modules = [] } = {}) {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const { port } = listener.address();
  await new Promise(resolve => listener.close(resolve));
  const child = spawn(process.execPath, [...modules.flatMap(path => ["--import", path]), "server.js"], {
    cwd, env: { ...process.env, NODE_ENV: "test", DATABASE_URL: databaseUrl, PORT: String(port), APP_PIN: "4321" },
    stdio: ["ignore", "ignore", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", chunk => { stderr += chunk; });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill();
    await once(child, "exit");
  });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 120 && child.exitCode === null; attempt++) {
    try { if ((await fetch(base + "/api/health")).ok) return base; } catch { /* Server startup. */ }
    await setTimeout(50);
  }
  throw new Error(`Test server failed to start. ${stderr}`);
}

export async function stockTestLogin(base, username = "admin", pin = "4321") {
  const login = await fetch(base + "/api/login", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, pin })
  });
  assert.equal(login.status, 200);
  const session = await login.json();
  const cookie = login.headers.get("set-cookie").split(";")[0];
  async function request(path, method = "GET", data, { csrf = true } = {}) {
    const response = await fetch(base + path, {
      method, headers: { Cookie: cookie, ...(csrf ? { "X-Manna-CSRF": session.csrfToken } : {}),
        ...(data !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    return { status: response.status, body: await response.json() };
  }
  async function ok(...args) {
    const { status, body } = await request(...args);
    assert.ok(status >= 200 && status < 300, JSON.stringify({ status, body }));
    return body;
  }
  return { request, ok, user: session.user, cookie };
}
