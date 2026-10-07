export function requiredPhone(value) {
  const phone = String(value ?? "").trim();
  if (!phone) throw new Error("No. WhatsApp wajib diisi");
  return phone;
}
