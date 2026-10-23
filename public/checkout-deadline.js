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
  const local = deadlineLocalValue(value), [day = "", time = ""] = local.split("T"), [hour = "", minute = ""] = time.split(":");
  const valid = !local || DEADLINE_HOURS.includes(hour) && DEADLINE_MINUTES.includes(minute) && (hour !== "18" || minute === "00");
  return `<div class="field checkout-deadline"><span>Deadline <small>WITA</small></span><div class="checkout-deadline-controls"><input type="date" data-deadline-date aria-label="Tanggal deadline" value="${escape(day)}"><select data-deadline-hour aria-label="Jam deadline"><option value="">Jam</option>${DEADLINE_HOURS.map(h => `<option value="${h}" ${h === hour ? "selected" : ""}>${h}</option>`).join("")}</select><span aria-hidden="true">:</span><select data-deadline-minute aria-label="Menit deadline"><option value="">Menit</option>${DEADLINE_MINUTES.map(m => `<option value="${m}" ${m === minute ? "selected" : ""} ${hour === "18" && m !== "00" ? "disabled" : ""}>${m}</option>`).join("")}</select></div><input type="hidden" name="deadline" value="${escape(local)}">${!valid ? `<small class="deadline-legacy-note">Deadline tersimpan ${escape(time)}. Pilih ulang untuk menyesuaikan jam operasional.</small>` : ""}</div>`;
}

export function bindCheckoutDeadline(form) {
  const date = form.querySelector("[data-deadline-date]"), hour = form.querySelector("[data-deadline-hour]"), minute = form.querySelector("[data-deadline-minute]");
  if (!date || !hour || !minute) return;
  const update = event => {
    if (event.target === date && !date.value) { hour.value = ""; minute.value = ""; }
    else if (date.value) { hour.value ||= "08"; minute.value ||= "00"; }
    if (hour.value === "18") minute.value = "00";
    [...minute.options].forEach(option => { option.disabled = hour.value === "18" && option.value !== "" && option.value !== "00"; });
    date.required = Boolean(hour.value || minute.value);
    hour.required = minute.required = Boolean(date.value);
    form.elements.deadline.value = date.value && hour.value && minute.value ? `${date.value}T${hour.value}:${minute.value}` : "";
    form.querySelector(".deadline-legacy-note")?.remove();
  };
  for (const control of [date, hour, minute]) {
    control.addEventListener("input", update);
    control.addEventListener("change", update);
  }
}
