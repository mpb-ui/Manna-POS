export function requiredPhone(value) {
  const phone = String(value || "").trim();
  if (!phone) throw new Error("No. WhatsApp wajib diisi");
  const digits = phone.replace(/\D/g, "");
  if (!/^\+?[\d\s().-]+$/.test(phone) || digits.length < 8 || digits.length > 15) {
    throw new Error("Masukkan No. WhatsApp yang valid, contoh 081234567890 atau +6281234567890");
  }
  return phone;
}
