import { witaDay } from "./order-rules.js";

const monthFormat = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "UTC" });
const dateKey = date => date.toISOString().slice(0, 10);
const monthOf = day => new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
const daySteps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
const calendarHtml = `<section class="deadline-calendar" aria-label="Tanggal">
  <div class="deadline-calendar-head"><strong data-calendar-month aria-live="polite"></strong><div>
    <button type="button" data-calendar-prev aria-label="Bulan sebelumnya">‹</button>
    <button type="button" data-calendar-next aria-label="Bulan berikutnya">›</button>
  </div></div>
  <div class="deadline-calendar-week" aria-hidden="true">${["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map(day => `<span>${day}</span>`).join("")}</div>
  <div class="deadline-calendar-days" data-calendar-days></div>
</section>`;

export function bindCalendarPicker(trigger, createPicker) {
  let popup, cleanup;
  function close(restoreFocus = false) {
    if (!popup) return;
    cleanup?.();
    popup.remove();
    popup = cleanup = null;
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
  }

  trigger.addEventListener("click", () => {
    if (popup) { close(true); return; }
    const today = witaDay();
    const picker = createPicker(today);
    let month = monthOf(picker.from || today);
    const panel = document.createElement("div");
    popup = panel;
    panel.className = `checkout-deadline-picker${picker.range ? " report-calendar-range" : ""}`;
    panel.id = `calendar-picker-${crypto.randomUUID()}`;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", picker.label);
    panel.setAttribute("popover", "auto");
    panel.innerHTML = `<div class="deadline-picker-main">${calendarHtml}${picker.side || ""}</div>${picker.below || ""}
      <div class="deadline-picker-footer"><button type="button" data-picker-clear>${picker.clearLabel || "Hapus"}</button>
        <button type="button" data-picker-today>Hari ini</button><button type="button" data-picker-done>Selesai</button></div>`;

    const controller = new AbortController(), options = { signal: controller.signal };
    const draw = () => {
      panel.querySelector("[data-calendar-month]").textContent = monthFormat.format(month);
      const first = new Date(month);
      first.setUTCDate(1 - first.getUTCDay());
      panel.querySelector("[data-calendar-days]").innerHTML = Array.from({ length: 42 }, (_, index) => {
        const date = new Date(first);
        date.setUTCDate(first.getUTCDate() + index);
        const key = dateKey(date), selected = key === picker.from || key === picker.to;
        const inRange = picker.from < key && key < picker.to;
        const classes = [date.getUTCMonth() !== month.getUTCMonth() && "outside-month", key === today && "today", inRange && "in-range"].filter(Boolean).join(" ");
        return `<button type="button" data-picker-date="${key}" class="${classes}" aria-label="${dayFormat.format(date)}" aria-pressed="${selected}" ${selected ? "data-selected-date" : ""}>${date.getUTCDate()}</button>`;
      }).join("");
      picker.render?.(panel);
    };
    const showDate = (day, focusDay = false) => {
      month = monthOf(day);
      draw();
      if (focusDay) panel.querySelector(`[data-picker-date="${day}"]`)?.focus({ preventScroll: true });
    };
    const position = () => {
      if (!trigger.isConnected) { close(); return; }
      const rect = trigger.getBoundingClientRect(), viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft || 0, topEdge = viewport?.offsetTop || 0;
      const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight;
      panel.style.maxWidth = `${Math.max(0, width - 24)}px`;
      panel.style.maxHeight = `${Math.max(0, height - 24)}px`;
      const size = panel.getBoundingClientRect();
      const gap = picker.range ? 0 : 8;
      const below = topEdge + height - rect.bottom - gap, above = rect.top - topEdge - gap;
      const top = below >= size.height || below >= above ? rect.bottom + gap : rect.top - size.height - gap;
      const left = picker.range ? rect.left : rect.right - size.width;
      panel.style.left = `${Math.max(leftEdge + 12, Math.min(left, leftEdge + width - size.width - 12))}px`;
      panel.style.top = `${Math.max(topEdge + 12, Math.min(top, topEdge + height - size.height - 12))}px`;
    };
    panel.addEventListener("click", event => {
      const button = event.target.closest("button");
      if (!button || button.disabled) return;
      if (button.hasAttribute("data-calendar-prev") || button.hasAttribute("data-calendar-next")) {
        month.setUTCMonth(month.getUTCMonth() + (button.hasAttribute("data-calendar-next") ? 1 : -1));
        draw();
      } else if (button.dataset.pickerDate) {
        picker.pick(button.dataset.pickerDate);
        showDate(button.dataset.pickerDate, true);
      } else if (button.hasAttribute("data-picker-today")) {
        if (picker.pickToday) picker.pickToday(today);
        else picker.pick(today);
        showDate(today);
      } else if (button.hasAttribute("data-picker-clear")) {
        close(true);
        picker.clear();
      } else if (button.hasAttribute("data-picker-done")) {
        close(true);
        picker.done?.();
      }
    }, options);
    panel.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); close(true); return; }
      const day = event.target.closest("[data-picker-date]")?.dataset.pickerDate;
      const offset = daySteps[event.key];
      if (!day || !offset) return;
      event.preventDefault();
      const date = new Date(`${day}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + offset);
      showDate(dateKey(date), true);
    }, options);
    panel.addEventListener("toggle", event => {
      if (event.newState === "closed" && popup === panel) close();
    }, options);

    document.body.append(panel);
    draw();
    trigger.setAttribute("aria-controls", panel.id);
    trigger.setAttribute("aria-expanded", "true");
    if (typeof panel.showPopover === "function") panel.showPopover();
    else {
      panel.removeAttribute("popover");
      document.addEventListener("pointerdown", event => {
        if (!panel.contains(event.target) && !trigger.contains(event.target)) close();
      }, options);
    }
    const observer = new MutationObserver(() => { if (!trigger.isConnected) close(); });
    observer.observe(document.body, { childList: true, subtree: true });
    cleanup = () => { controller.abort(); observer.disconnect(); trigger.removeAttribute("aria-controls"); };
    window.addEventListener("resize", position, options);
    window.addEventListener("scroll", position, { ...options, capture: true });
    window.visualViewport?.addEventListener("resize", position, options);
    position();
    picker.bind?.(panel, { ...options, draw, showDate });
    (panel.querySelector("[data-selected-date]") || panel.querySelector(`[data-picker-date="${today}"]`) || panel.querySelector(".deadline-calendar-days button:not(.outside-month)"))?.focus({ preventScroll: true });
  });
  return close;
}
