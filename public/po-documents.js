const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const dates = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar" });
let pdfLibrary;
function loadPdfLibrary() {
  if (globalThis.PDFLib) return Promise.resolve(globalThis.PDFLib);
  if (!pdfLibrary) pdfLibrary = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/pdf-lib.min.js";
    script.onload = () => resolve(globalThis.PDFLib);
    script.onerror = () => { pdfLibrary = null; script.remove(); reject(new Error("Pembuat PDF gagal dimuat. Silakan coba lagi.")); };
    document.head.append(script);
  });
  return pdfLibrary;
}
function safeName(value) { return String(value || "PO").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 100); }
function download(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function imageForPdf(attachment) {
  if (!attachment?.dataUrl) return null;
  if (/^data:image\/(png|jpe?g);base64,/i.test(attachment.dataUrl)) return attachment.dataUrl;
  const image = new Image(); image.src = attachment.dataUrl; await image.decode();
  const scale = Math.min(1, 5000 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export async function buildPurchaseOrderPdf(lib, row, imageData) {
  const { PDFDocument, StandardFonts, rgb } = lib;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Nota ${row.code} - PO ${row.poNumber}`); pdf.setAuthor("Manna Print");
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const blue = rgb(.09, .32, .73), ink = rgb(.12, .16, .23), muted = rgb(.38, .43, .5);
  const width = 595.28, height = 841.89, margin = 42, usable = width - 2 * margin;
  let page, y;
  const clean = text => [...String(text ?? "")].map(char => { try { regular.encodeText(char); return char; } catch { return "?"; } }).join("");
  const newPage = () => { page = pdf.addPage([width, height]); y = height - margin; };
  const line = (text, { size = 11, font = regular, color = ink, after = 4 } = {}) => {
    const words = clean(text).split(/\s+/), lines = []; let current = "";
    for (const word of words) {
      if (current && font.widthOfTextAtSize(current + " " + word, size) > usable) { lines.push(current); current = ""; }
      for (const char of word) {
        if (font.widthOfTextAtSize(current + char, size) > usable) { lines.push(current); current = ""; }
        current += char;
      }
      current += " ";
    }
    lines.push(current.trim());
    for (const textLine of lines) {
      if (y < margin + 30) newPage();
      page.drawText(textLine.trim(), { x: margin, y: y - size, size, font, color }); y -= size + 5;
    }
    y -= after;
  };
  const rule = () => { if (y < margin + 30) newPage(); page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: .6, color: rgb(.82,.85,.89) }); y -= 14; };
  newPage();
  line("MANNA PRINT", { size: 21, font: bold, color: blue });
  line("TANDA TERIMA PESANAN", { size: 12, font: bold }); rule();
  const order = row.nota;
  line(order.code, { font: bold }); line(dates.format(new Date(order.createdAt)), { color: muted });
  line(`Pelanggan: ${order.customerName}`); line(`WhatsApp: ${order.phone || "-"}`);
  line(`Deadline: ${order.deadline ? dates.format(new Date(order.deadline)) : "-"}`);
  line(`Nomor PO: ${row.poNumber}`, { font: bold }); rule();
  for (const [index, item] of order.items.entries()) {
    line(`${index + 1}. ${item.productName}`, { font: bold, size: 12 });
    line(item.displaySize || `${item.quantity} unit`, { color: muted });
    if (item.imageWidthCm > 0 && item.imageLengthCm > 0) line(`Ukuran gambar: ${Number(item.imageWidthCm).toLocaleString("id-ID")} × ${Number(item.imageLengthCm).toLocaleString("id-ID")} cm`, { color: muted });
    if (item.allowanceCm > 0) line(`Lebihan ${item.allowanceCm} cm/sisi - Ukuran akhir ${item.finalImageWidthCm} × ${item.finalImageLengthCm} cm`, { color: muted });
    if (item.templateDesign) {
      line(`Harga spanduk: ${money.format(item.baseTotal)}`);
      line(`Design Template ${item.templateDesign}: ${money.format(item.templateDesignTotal || 35000)}`);
    } else if (item.fileService?.id && item.fileService.id !== "READY") {
      line(`${item.fileService.name} x ${item.fileService.quantity || 1}${item.fileService.note ? " - " + item.fileService.note : ""}`);
    }
    if (item.finishing?.length) line(`Finishing: ${item.finishing.map(f => `${f.name} x ${f.units}${f.note ? " (" + f.note + ")" : ""}`).join(", ")}`);
    if (item.productionNote) line(`Catatan: ${item.productionNote}`);
    line(money.format(item.subtotal), { font: bold }); rule();
  }
  const remaining = Math.max(0, Number(order.total) - Number(order.paidAmount));
  line(`Total: ${money.format(order.total)}`, { font: bold, size: 13, color: blue });
  line(`Dibayar: ${money.format(order.paidAmount)}`); line(`Sisa: ${money.format(remaining)}`, { font: bold });
  line(`Status Pembayaran: ${remaining > 0 ? "Belum Lunas" : "Lunas"}`, { font: bold });
  line("Manna Print - Labuan Bajo | Terima kasih", { color: muted, size: 10 });
  if (imageData) {
    newPage(); line("DOKUMEN PEMBAYARAN PO", { font: bold, size: 16, color: blue });
    line(`${row.poNumber} | ${row.code}`, { color: muted });
    const image = /^data:image\/png/i.test(imageData) ? await pdf.embedPng(imageData) : await pdf.embedJpg(imageData);
    const scale = Math.min(usable / image.width, (y - margin - 20) / image.height);
    const w = image.width * scale, h = image.height * scale;
    page.drawImage(image, { x: (width - w) / 2, y: y - h, width: w, height: h });
  }
  pdf.getPages().forEach((p, index) => p.drawText(`${index + 1} / ${pdf.getPageCount()}`, { x: width - margin - 35, y: 23, font: regular, size: 9, color: muted }));
  return pdf.save();
}

export function openPurchaseOrder({ row, dialog, escapeHtml: h, canDownload, toast }) {
  const detail = dialog.querySelector("#order-detail");
  detail.innerHTML = `<div class="detail-head"><div><h2>Dokumen Pembayaran PO</h2><p>${h(row.poNumber)} · ${h(row.code)} · ${h(row.customer)}</p></div><button type="button" class="detail-close" aria-label="Tutup dokumen PO">×</button></div><div class="detail-body po-document-body">${row.attachment?.dataUrl ? `<img class="po-document-full" src="${h(row.attachment.dataUrl)}" alt="Dokumen PO ${h(row.poNumber)}">` : '<p>Gambar PO belum diunggah. Nota tetap dapat didownload.</p>'}</div>${canDownload ? `<div class="detail-actions po-document-actions">${row.attachment?.dataUrl ? '<button type="button" class="secondary" data-po-original>Download Gambar Asli</button>' : ""}<button type="button" class="primary" data-po-pdf>Download Nota + PO (PDF)</button></div>` : ""}`;
  detail.querySelector(".detail-close").onclick = () => dialog.close(); dialog.showModal();
  detail.querySelector("[data-po-original]")?.addEventListener("click", async event => {
    const button = event.currentTarget; button.disabled = true;
    try {
      const response = await fetch(row.attachment.dataUrl);
      const extension = { "image/png": "png", "image/webp": "webp" }[row.attachment.type] || "jpg";
      download(await response.arrayBuffer(), `${safeName(row.code)}-PO-${safeName(row.poNumber)}.${extension}`, row.attachment.type);
    } catch { toast("Gambar PO tidak dapat didownload", "error"); } finally { button.disabled = false; }
  });
  detail.querySelector("[data-po-pdf]")?.addEventListener("click", async event => {
    const button = event.currentTarget; button.disabled = true; button.textContent = "Menyiapkan PDF…";
    try {
      const [lib, image] = await Promise.all([loadPdfLibrary(), imageForPdf(row.attachment)]);
      const bytes = await buildPurchaseOrderPdf(lib, row, image);
      download(bytes, `${safeName(row.code)}-PO-${safeName(row.poNumber)}.pdf`, "application/pdf");
    } catch { toast("PDF tidak dapat dibuat. Silakan coba kembali.", "error"); }
    finally { button.disabled = false; button.textContent = "Download Nota + PO (PDF)"; }
  });
}
