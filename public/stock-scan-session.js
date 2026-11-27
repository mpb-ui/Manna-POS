import { stockScanAccess } from "./stock-scan-rules.js";

const authChannel = typeof BroadcastChannel === "function" ? new BroadcastChannel("manna-pos-security") : null;
export const scanPendingKey = userId => `manna-stock-scan-pending:${userId}`;
export const escapeScanText = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
export const dateOfScan = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Makassar" });
export const rollNumber = number => Number(number).toLocaleString("id-ID");

export function createStockScanSession(capability, { onReady, onReset, onError }) {
  const workspace = document.querySelector("#workspace");
  const signIn = document.querySelector("#scan-login");
  const status = document.querySelector("#session-message");
  const account = document.querySelector("#scan-account");
  const accountName = document.querySelector("#account-name");
  let user = null;
  let csrf = "";
  let generation = 0;

  function reset() {
    generation++;
    user = null;
    csrf = "";
    workspace.hidden = true;
    account.hidden = true;
    accountName.textContent = "";
    onReset();
  }

  function apply(session) {
    const identityChanged = user?.id !== session.user?.id;
    const allowed = stockScanAccess(session.user)[capability];
    const wasAllowed = stockScanAccess(user)[capability];
    if (identityChanged || !allowed) reset();
    user = session.user || null;
    csrf = session.csrfToken || "";
    account.hidden = !user;
    accountName.textContent = user?.name || "";
    signIn.hidden = Boolean(user);
    status.hidden = !user || allowed;
    status.textContent = user && !allowed ? "Akun ini belum memiliki izin untuk membuka halaman ini." : "";
    workspace.hidden = !allowed;
    if (allowed && (identityChanged || !wasAllowed)) onReady(user);
  }

  async function api(path, options = {}) {
    const requestGeneration = generation;
    const response = await fetch(path, {
      ...options,
      headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(csrf ? { "X-Manna-CSRF": csrf } : {}) }
    });
    const body = await response.json();
    if (requestGeneration !== generation) throw new Error("Akun aktif telah berubah.");
    if (response.status === 401 && path !== "/api/login") {
      apply({});
      signIn.querySelector("[role=alert]").textContent = "Sesi berakhir. Masuk kembali untuk melanjutkan.";
    }
    if (!response.ok) throw Object.assign(new Error(body.error || "Permintaan gagal."), { ...body, status: response.status });
    return body;
  }

  async function refreshSession() {
    try { apply(await api("/api/session")); } catch (error) {
      if (user) onError(error.message);
      else {
        signIn.hidden = false;
        signIn.querySelector("[role=alert]").textContent = "Koneksi belum tersedia. Coba masuk kembali.";
      }
    }
  }

  signIn.onsubmit = async event => {
    event.preventDefault();
    const button = signIn.querySelector("[type=submit]");
    if (button.disabled) return;
    const errorText = signIn.querySelector("[role=alert]");
    button.disabled = true;
    errorText.textContent = "";
    try {
      const session = await api("/api/login", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(signIn))) });
      signIn.reset();
      apply(session);
      authChannel?.postMessage("account-changed");
    } catch (error) {
      signIn.elements.pin.value = "";
      errorText.textContent = error.message;
    } finally { button.disabled = false; }
  };

  document.querySelector("#scan-sign-out").onclick = async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await api("/api/logout", { method: "POST", body: "{}" });
      apply({});
      authChannel?.postMessage("signed-out");
    } catch (error) { onError(error.message); }
    finally { button.disabled = false; }
  };

  if (authChannel) authChannel.onmessage = event => {
    if (!["signed-out", "account-changed"].includes(event.data)) return;
    reset();
    refreshSession();
  };
  return { api, user: () => user, refreshSession };
}
