import { retailBarcodeFormat } from "./pos-barcode-rules.js";

const papers = { a4: [210, 297], a3plus: [329, 483] };
const margin = 8;
const gap = 2;
const maxLabels = 2000;
let barcodeLibrary;

function loadBarcodeLibrary() {
  if (!barcodeLibrary) {
    barcodeLibrary = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/vendor/jsbarcode-retail.min.js";
      script.onload = () => resolve(window.JsBarcode);
      script.onerror = () => { script.remove(); reject(new Error("Pembuat barcode gagal dimuat. Coba lagi.")); };
      document.head.append(script);
    }).catch(error => { barcodeLibrary = null; throw error; });
  }
  return barcodeLibrary;
}

function barcodeSvg(code, availableWidth, availableHeight, JsBarcode) {
  const format = retailBarcodeFormat(code);
  const options = {
    format, width: 1, displayValue: false, margin: 0,
    marginLeft: 12, marginRight: 12, background: "#fff", lineColor: "#000"
  };
  const encoded = {};
  JsBarcode(encoded, code, options);
  const modules = encoded.encodings.reduce((sum, group) => sum + group.data.length, 24);
  // Physical sizes in mm. Keep quiet zones at 12 modules on each side.
  const retailHeight = { EAN13: 70, UPC: 70, EAN8: 56 }[format];
  const minimumPitch = retailHeight ? 0.264 : 0.254;
  const pitch = Math.min(0.33, availableWidth / modules, retailHeight ? availableHeight / retailHeight : Infinity);
  const height = retailHeight ?? Math.floor(Math.min(16, availableHeight) / pitch);
  if (pitch < minimumPitch || height * pitch < 8) {
    throw new Error(`Perbesar label untuk barcode ${code} agar tetap mudah dipindai.`);
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, code, { ...options, height });
  svg.setAttribute("width", `${modules * pitch}mm`);
  svg.setAttribute("height", `${height * pitch}mm`);
  svg.setAttribute("aria-hidden", "true");
  return svg.outerHTML;
}

function labelHtml(row, code, width, height, showPrice, JsBarcode, { e, money }) {
  // Leave a small allowance for the die line, text line boxes and label padding.
  const bars = barcodeSvg(code, width - 2.2, height - (row.variant ? 11.2 : 8.8), JsBarcode);
  return `<div class="barcode-label"><header><span>Manna Print</span>${showPrice ? `<strong>${e(money(row.price))}</strong>` : ""}</header>
    <strong class="barcode-label-name">${e(row.name)}</strong>${row.variant ? `<div class="barcode-label-variant">${e(row.variant)}</div>` : ""}
    ${bars}<div class="barcode-label-code">${e(code)}</div></div>`;
}

export async function openBarcodePrint(rows, ctx) {
  if (!rows.length || !ctx.allowed() || document.querySelector(".barcode-print-dialog")) return;
  const { e, print, toast } = ctx;
  const user = ctx.identity();
  const dialog = document.createElement("dialog");
  dialog.className = "order-dialog barcode-print-dialog";
  dialog.setAttribute("aria-labelledby", "barcode-print-title");
  dialog.innerHTML = `<form class="barcode-print-form">
    <header class="detail-head"><h2 id="barcode-print-title">Cetak Label Barcode</h2><button type="button" class="detail-close" data-close aria-label="Tutup">×</button></header>
    <div class="barcode-print-body">
      <div class="barcode-print-options">
        <label class="field"><span>Kertas</span><select name="paper"><option value="a4">A4</option><option value="a3plus">A3+</option></select></label>
        <div class="barcode-print-size">
          <label class="field"><span>Lebar (mm)</span><input name="width" type="number" min="20" max="313" step="1" value="40" required></label>
          <label class="field"><span>Tinggi (mm)</span><input name="height" type="number" min="20" max="467" step="1" value="30" required></label>
        </div>
        <label class="barcode-check"><input name="showPrice" type="checkbox"> Tampilkan harga jual</label>
        <div class="barcode-print-items">${rows.map((row, index) => `<section><strong>${e(row.name)}</strong>
          ${row.variant ? `<small>${e(row.variant)}</small>` : ""}
          <div class="barcode-print-item-controls"><label class="field"><span>Barcode</span><select name="code${index}">${row.barcodes.map(barcode =>
            `<option value="${e(barcode.code)}">${e(barcode.code)}</option>`).join("")}</select></label>
          <label class="field"><span>Jumlah</span><input name="copies${index}" type="number" min="1" max="${maxLabels}" step="1" value="1" required></label></div>
        </section>`).join("")}</div>
      </div>
      <section class="barcode-preview" aria-label="Pratinjau cetak">
        <div class="barcode-preview-header"><strong>Pratinjau</strong><span data-label-count aria-live="polite"></span></div>
        <div class="barcode-preview-area"><div class="barcode-preview-paper"></div></div>
        <p class="barcode-print-hint">Saat mencetak, pilih kertas yang sesuai dan skala 100% atau Ukuran aktual.</p>
        <p class="barcode-error" role="alert" hidden></p>
      </section>
    </div>
    <footer class="barcode-print-footer"><button type="button" class="secondary" data-close>Batal</button><button type="submit" class="primary" disabled>Cetak Label</button></footer>
  </form>`;
  document.body.append(dialog);
  dialog.showModal();
  const form = dialog.querySelector("form");
  const fields = form.elements;
  const button = form.querySelector('[type=submit]');
  const warning = dialog.querySelector(".barcode-error");
  const preview = dialog.querySelector(".barcode-preview-area");
  const paper = dialog.querySelector(".barcode-preview-paper");
  const labelCount = dialog.querySelector("[data-label-count]");
  let printJob;
  let JsBarcode;

  function resize() {
    const [paperWidth] = papers[fields.paper.value];
    paper.style.zoom = Math.min(1, Math.max(0.1, (preview.clientWidth - 20) / (paperWidth * 96 / 25.4)));
  }
  const observer = new ResizeObserver(resize);
  observer.observe(preview);
  dialog.querySelectorAll("[data-close]").forEach(control => { control.onclick = () => dialog.close(); });
  dialog.addEventListener("close", () => { observer.disconnect(); dialog.remove(); }, { once: true });

  function refresh() {
    if (!JsBarcode) return;
    printJob = null;
    button.disabled = true;
    paper.innerHTML = "";
    warning.hidden = true;
    labelCount.textContent = "";
    const size = fields.paper.value;
    const [paperWidth, paperHeight] = papers[size];
    fields.width.max = paperWidth - margin * 2;
    fields.height.max = paperHeight - margin * 2;
    paper.style.width = `${paperWidth}mm`;
    paper.style.height = `${paperHeight}mm`;
    paper.style.padding = `${margin}mm`;
    resize();
    if (!form.checkValidity()) {
      warning.textContent = "Periksa ukuran label dan jumlah cetak.";
      warning.hidden = false;
      return;
    }
    try {
      const width = fields.width.valueAsNumber, height = fields.height.valueAsNumber;
      const columns = Math.floor((paperWidth - 2 * margin + gap) / (width + gap));
      const lines = Math.floor((paperHeight - 2 * margin + gap) / (height + gap));
      const capacity = columns * lines;
      const counts = rows.map((_row, index) => fields[`copies${index}`].valueAsNumber);
      const count = counts.reduce((total, copies) => total + copies, 0);
      if (count > maxLabels) throw new Error(`Cetak maksimal ${maxLabels.toLocaleString("id")} label per proses.`);
      const grid = cells => `<div class="barcode-sheet" style="--columns:${columns};--label-width:${width}mm;--label-height:${height}mm;--label-gap:${gap}mm;">${cells.join("")}</div>`;
      const labels = rows.flatMap((row, index) => Array(counts[index]).fill(
        labelHtml(row, fields[`code${index}`].value, width, height, fields.showPrice.checked, JsBarcode, ctx)));
      const pages = [];
      for (let index = 0; index < labels.length; index += capacity) {
        pages.push(grid(labels.slice(index, index + capacity)));
      }
      paper.innerHTML = pages[0];
      labelCount.textContent = `${count.toLocaleString("id")} label · Halaman 1/${pages.length}`;
      printJob = { html: pages.join(""), css: `barcode-print barcode-${size}` };
      button.disabled = false;
    } catch (error) {
      warning.textContent = error.message;
      warning.hidden = false;
    }
  }

  form.oninput = refresh;
  form.onsubmit = event => {
    event.preventDefault();
    if (printJob && ctx.identity() === user && ctx.allowed()) print(printJob.html, printJob.css);
  };
  try {
    JsBarcode = await loadBarcodeLibrary();
    if (!dialog.open) return;
    if (ctx.identity() !== user || !ctx.allowed()) return dialog.close();
    refresh();
  } catch (error) {
    if (dialog.open) { dialog.close(); toast(error.message, "error"); }
  }
}
