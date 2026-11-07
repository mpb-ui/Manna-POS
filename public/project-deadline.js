const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" });
const dateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Makassar" });
const timeFormat = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Makassar" });

function witaDay(date) {
  const parts = Object.fromEntries(dayFormat.formatToParts(date).map(part => [part.type, part.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
}

export function projectDeadlineInfo(job, now = Date.now()) {
  const deadline = job.deadline ? new Date(job.deadline) : null;
  if (!deadline || !Number.isFinite(deadline.getTime())) return { label: "-", state: "none", overdueDays: 0 };
  const finished = ["SELESAI", "DIAMBIL"].includes(job.status);
  const completion = job.completedAt ? new Date(job.completedAt) : null;
  const frozen = finished && completion && Number.isFinite(completion.getTime());
  const current = frozen ? completion : new Date(now);
  const dayOffset = Math.round((witaDay(deadline) - witaDay(current)) / 86400000);
  const state = finished && !frozen ? "future" : deadline < current ? "late" : finished ? "future" : dayOffset === 0 ? "today" : "future";
  const overdueDays = state === "late" ? Math.max(0, -dayOffset) : 0;
  const time = timeFormat.format(deadline);
  const displayOffset = Math.round((witaDay(deadline) - witaDay(new Date(now))) / 86400000);
  const label = overdueDays ? `Terlambat ${overdueDays} hari`
    : displayOffset === 0 ? `Hari ini, ${time}`
    : displayOffset === 1 ? `Besok, ${time}`
    : `${dateFormat.format(deadline)}, ${time}`;
  return { label, state, overdueDays };
}
