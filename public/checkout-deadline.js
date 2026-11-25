import { bindCalendarPicker } from "./calendar-picker.js";

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

export function bindCheckoutDeadline(form) {
  const trigger = form.querySelector("[data-deadline-trigger]"), input = form.elements.deadline;
  if (!trigger || !input) return;
  const commit = value => {
    input.value = value;
    trigger.querySelector("[data-deadline-value]").textContent = deadlineDisplay(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const timeColumn = (key, label, values) => `<div class="deadline-time-column"><strong>${label}</strong>
    <div role="listbox" aria-label="${label} deadline">${values.map(value => `<button type="button" role="option" data-picker-${key}="${value}" aria-selected="false">${value}</button>`).join("")}</div></div>`;

  bindCalendarPicker(trigger, today => {
    const initialValue = input.value;
    const [selected = "", time = ""] = initialValue.split("T");
    let [hour = "08", minute = "00"] = time.split(":");
    const legacy = initialValue && (!DEADLINE_HOURS.includes(hour) || !DEADLINE_MINUTES.includes(minute) || hour === "18" && minute !== "00");
    if (!DEADLINE_HOURS.includes(hour)) hour = "08";
    if (!DEADLINE_MINUTES.includes(minute) || hour === "18") minute = "00";

    const save = () => {
      picker.from ||= today;
      if (hour === "18") minute = "00";
      commit(`${picker.from}T${hour}:${minute}`);
    };
    const picker = {
      from: selected,
      label: "Pilih Deadline WITA",
      side: `<section class="deadline-time" aria-label="Waktu WITA">${timeColumn("hour", "Jam", DEADLINE_HOURS)}${timeColumn("minute", "Menit", DEADLINE_MINUTES)}</section>`,
      below: legacy ? '<p class="deadline-picker-note">Deadline tersimpan di luar jam operasional. Pilih ulang untuk mengubahnya.</p>' : "",
      pick(day) { picker.from = day; save(); },
      clear() { commit(""); },
      render(panel) {
        if (input.value !== initialValue) panel.querySelector(".deadline-picker-note")?.remove();
        panel.querySelectorAll("[data-picker-hour]").forEach(button => button.setAttribute("aria-selected", String(button.dataset.pickerHour === hour)));
        panel.querySelectorAll("[data-picker-minute]").forEach(button => {
          button.setAttribute("aria-selected", String(button.dataset.pickerMinute === minute));
          button.disabled = hour === "18" && button.dataset.pickerMinute !== "00";
        });
      },
      bind(panel, { signal, draw }) {
        const times = panel.querySelector(".deadline-time");
        times.addEventListener("click", event => {
          const button = event.target.closest("button");
          if (!button || button.disabled) return;
          hour = button.dataset.pickerHour ?? hour;
          minute = button.dataset.pickerMinute ?? minute;
          save();
          draw();
        }, { signal });
        times.addEventListener("keydown", event => {
          const step = { ArrowDown: 1, ArrowUp: -1, Home: -Infinity, End: Infinity }[event.key];
          const button = event.target.closest("button");
          if (step === undefined || !button) return;
          event.preventDefault();
          const buttons = [...button.parentElement.querySelectorAll("button:not(:disabled)")];
          buttons[Math.max(0, Math.min(buttons.length - 1, buttons.indexOf(button) + step))]?.focus();
        }, { signal });
        panel.querySelector('[data-picker-hour][aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
      }
    };
    return picker;
  });
}
