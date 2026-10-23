export const DEADLINE_HOURS = Array.from({ length: 11 }, (_, index) => String(index + 8).padStart(2, "0"));
export const DEADLINE_MINUTES = ["00", "15", "30", "45"];

export function deadlineLocalValue(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Tanggal deadline tidak valid");
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 16);
}

export function checkoutDeadline(value, existing = null) {
  if (!value) return null;
  const local = deadlineLocalValue(value);
  // Existing deadlines remain intact until explicitly edited.
  if (existing && local === deadlineLocalValue(existing)) return existing;
  const match = local.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
  if (!match || !DEADLINE_HOURS.includes(match[2]) || !DEADLINE_MINUTES.includes(match[3]) || match[2] === "18" && match[3] !== "00") throw new Error("Deadline harus pukul 08:00–18:00 WITA, dengan menit 00, 15, 30, atau 45");
  const iso = new Date(local + ":00+08:00");
  if (!Number.isFinite(iso.getTime()) || deadlineLocalValue(iso.toISOString()) !== local) throw new Error("Tanggal deadline tidak valid");
  return iso.toISOString();
}

export function checkoutDeadlineHtml(value, escape) {
  const local = deadlineLocalValue(value);
  return `<div class="field checkout-deadline"><span>Deadline <small>WITA</small></span><button type="button" class="checkout-deadline-trigger" aria-label="Deadline WITA" aria-haspopup="dialog" aria-expanded="false" data-deadline-trigger><span data-deadline-value>${escape(deadlineDisplay(local))}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg></button><input type="hidden" name="deadline" value="${escape(local)}"></div>`;
}

function deadlineDisplay(local) {
  if (!local) return "dd/mm/yyyy, --:--";
  const [date, time] = local.split("T");
  return `${date.split("-").reverse().join("/")}, ${time}`;
}

const calendarMonth = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
const calendarDay = new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "UTC" });
const dateKey = date => date.toISOString().slice(0, 10);

export function bindCheckoutDeadline(form) {
  const trigger = form.querySelector("[data-deadline-trigger]"), input = form.elements.deadline;
  if (!trigger || !input) return;
  let popup, cleanup;
  const close = (restoreFocus = false) => {
    if (!popup) return;
    cleanup?.(); popup.remove(); popup = null;
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
  };
  const commit = value => {
    input.value = value;
    trigger.querySelector("[data-deadline-value]").textContent = deadlineDisplay(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  trigger.addEventListener("click", () => {
    if (popup) { close(); return; }
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    let [selected = "", time = ""] = input.value.split("T");
    let [hour = "08", minute = "00"] = time.split(":");
    const legacy = input.value && (!DEADLINE_HOURS.includes(hour) || !DEADLINE_MINUTES.includes(minute) || hour === "18" && minute !== "00");
    if (!DEADLINE_HOURS.includes(hour)) hour = "08";
    if (!DEADLINE_MINUTES.includes(minute) || hour === "18") minute = "00";
    let month = new Date(`${selected || today}T00:00:00Z`); month.setUTCDate(1);
    popup = document.createElement("div");
    popup.className = "checkout-deadline-picker";
    popup.id = `deadline-picker-${crypto.randomUUID()}`;
    popup.setAttribute("role", "dialog"); popup.setAttribute("aria-label", "Pilih Deadline WITA");
    popup.setAttribute("popover", "auto");
    popup.innerHTML = `<div class="deadline-picker-main"><section class="deadline-calendar" aria-label="Tanggal"><div class="deadline-calendar-head"><strong data-calendar-month></strong><div><button type="button" data-calendar-prev aria-label="Bulan sebelumnya">‹</button><button type="button" data-calendar-next aria-label="Bulan berikutnya">›</button></div></div><div class="deadline-calendar-week" aria-hidden="true">${["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map(day => `<span>${day}</span>`).join("")}</div><div class="deadline-calendar-days" data-calendar-days></div></section><section class="deadline-time" aria-label="Waktu WITA"><div class="deadline-time-column"><strong>Jam</strong><div role="listbox" aria-label="Jam deadline" data-deadline-hours>${DEADLINE_HOURS.map(value => `<button type="button" role="option" data-picker-hour="${value}" aria-selected="false">${value}</button>`).join("")}</div></div><div class="deadline-time-column"><strong>Menit</strong><div role="listbox" aria-label="Menit deadline" data-deadline-minutes>${DEADLINE_MINUTES.map(value => `<button type="button" role="option" data-picker-minute="${value}" aria-selected="false">${value}</button>`).join("")}</div></div></section></div>${legacy ? '<p class="deadline-picker-note">Deadline tersimpan di luar jam operasional. Pilih ulang untuk mengubahnya.</p>' : ''}<div class="deadline-picker-footer"><button type="button" data-picker-clear>Hapus</button><button type="button" data-picker-today>Hari ini</button><button type="button" data-picker-done>Selesai</button></div>`;
    const controller = new AbortController(), options = { signal: controller.signal };
    const draw = () => {
      popup.querySelector("[data-calendar-month]").textContent = calendarMonth.format(month);
      const first = new Date(month); first.setUTCDate(1 - first.getUTCDay());
      popup.querySelector("[data-calendar-days]").innerHTML = Array.from({ length: 42 }, (_, index) => {
        const date = new Date(first); date.setUTCDate(first.getUTCDate() + index);
        const key = dateKey(date), chosen = key === selected;
        return `<button type="button" data-picker-date="${key}" class="${date.getUTCMonth() !== month.getUTCMonth() ? "outside-month" : ""}${key === today ? " today" : ""}" aria-label="${calendarDay.format(date)}" aria-pressed="${chosen}" ${chosen ? 'data-selected-date' : ''}>${date.getUTCDate()}</button>`;
      }).join("");
      popup.querySelectorAll("[data-picker-hour]").forEach(button => button.setAttribute("aria-selected", String(button.dataset.pickerHour === hour)));
      popup.querySelectorAll("[data-picker-minute]").forEach(button => { button.setAttribute("aria-selected", String(button.dataset.pickerMinute === minute)); button.disabled = hour === "18" && button.dataset.pickerMinute !== "00"; });
    };
    const choose = () => {
      selected ||= today;
      if (hour === "18") minute = "00";
      commit(`${selected}T${hour}:${minute}`);
      popup.querySelector(".deadline-picker-note")?.remove();
      draw();
    };
    const position = () => {
      if (!form.isConnected) { close(); return; }
      const rect = trigger.getBoundingClientRect(), viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft || 0, topEdge = viewport?.offsetTop || 0;
      const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight;
      popup.style.maxWidth = `${Math.max(0, width - 24)}px`;
      popup.style.maxHeight = `${Math.max(0, height - 24)}px`;
      const size = popup.getBoundingClientRect();
      const below = topEdge + height - rect.bottom - 8, above = rect.top - topEdge - 8;
      const top = below >= size.height || below >= above ? rect.bottom + 8 : rect.top - size.height - 8;
      popup.style.left = `${Math.max(leftEdge + 12, Math.min(rect.right - size.width, leftEdge + width - size.width - 12))}px`;
      popup.style.top = `${Math.max(topEdge + 12, Math.min(top, topEdge + height - size.height - 12))}px`;
    };
    popup.addEventListener("click", event => {
      const button = event.target.closest("button"); if (!button || button.disabled) return;
      if (button.hasAttribute("data-calendar-prev") || button.hasAttribute("data-calendar-next")) { month.setUTCMonth(month.getUTCMonth() + (button.hasAttribute("data-calendar-next") ? 1 : -1)); draw(); }
      else if (button.dataset.pickerDate) { selected = button.dataset.pickerDate; month = new Date(`${selected.slice(0, 7)}-01T00:00:00Z`); choose(); }
      else if (button.dataset.pickerHour) { hour = button.dataset.pickerHour; choose(); }
      else if (button.dataset.pickerMinute) { minute = button.dataset.pickerMinute; choose(); }
      else if (button.hasAttribute("data-picker-today")) { selected = today; month = new Date(`${today.slice(0, 7)}-01T00:00:00Z`); choose(); }
      else if (button.hasAttribute("data-picker-clear")) { commit(""); close(true); }
      else if (button.hasAttribute("data-picker-done")) close(true);
    }, options);
    popup.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); close(true); return; }
      const button = event.target.closest("button"); if (!button) return;
      const step = { ArrowDown: 1, ArrowUp: -1, Home: -Infinity, End: Infinity }[event.key];
      if (button.dataset.pickerHour || button.dataset.pickerMinute) {
        if (step === undefined) return;
        event.preventDefault();
        const buttons = [...button.parentElement.querySelectorAll("button:not(:disabled)")];
        buttons[Math.max(0, Math.min(buttons.length - 1, buttons.indexOf(button) + step))]?.focus();
      } else if (button.dataset.pickerDate && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const date = new Date(`${button.dataset.pickerDate}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key]));
        month = new Date(`${dateKey(date).slice(0, 7)}-01T00:00:00Z`); draw();
        popup.querySelector(`[data-picker-date="${dateKey(date)}"]`)?.focus();
      }
    }, options);
    popup.addEventListener("toggle", event => { if (event.newState === "closed" && popup?.isConnected) close(); }, options);
    document.body.append(popup); draw();
    trigger.setAttribute("aria-controls", popup.id); trigger.setAttribute("aria-expanded", "true");
    if (typeof popup.showPopover === "function") popup.showPopover();
    else {
      popup.removeAttribute("popover");
      document.addEventListener("pointerdown", event => { if (!popup.contains(event.target) && !trigger.contains(event.target)) close(); }, options);
    }
    const observer = new MutationObserver(() => { if (!form.isConnected) close(); });
    observer.observe(document.body, { childList: true, subtree: true });
    cleanup = () => { controller.abort(); observer.disconnect(); trigger.removeAttribute("aria-controls"); };
    window.addEventListener("resize", position, options);
    window.addEventListener("scroll", position, { ...options, capture: true });
    window.visualViewport?.addEventListener("resize", position, options);
    position();
    popup.querySelector('[data-picker-hour][aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    (popup.querySelector("[data-selected-date]") || popup.querySelector(`[data-picker-date="${today}"]`) || popup.querySelector(".deadline-calendar-days button:not(.outside-month)"))?.focus({ preventScroll: true });
  });
}
