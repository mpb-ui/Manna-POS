import { normalizedStockUnit, stockMethodLabel, stockSetupNeedsCount } from "./stock-methods.js";

export function createStockUi(c) {
  const h = c.escapeHtml;
  const units = ["m²", "m lari", "pcs", "lbr", "lembar", "kg", "pack", "rim", "set", "roll"];
  const unitOptions = (selected = "pcs") => [...new Set([...units, selected])].map(unit =>
    `<option value="${h(unit)}" ${unit === selected ? "selected" : ""}>${h(unit)}</option>`).join("");
  const methodOptions = method => [["UNIT", "Per Satuan"], ["ROLL", "Per Roll"]].map(([key, label]) =>
    `<option value="${key}" ${method === key ? "selected" : ""}>${label}</option>`).join("");
  const row = (label, control) => `<label class="material-field"><span>${label}</span>${control}</label>`;
  const number = (name, value, unit, attrs = "") => `<span class="input-with-unit"><input name="${name}" type="number" value="${h(value)}" ${attrs}><b ${unit ? "" : "data-physical-unit"} aria-hidden="true">${h(unit)}</b></span>`;
  const formatted = value => Number(value ?? 0).toLocaleString("id-ID");
  const canCount = () => c.can("stock.view") && c.can("stock.adjust") && c.can("master.materials");
  const countSnapshot = stock => ({
    expectedQuantity:Number(stock.quantity), expectedUnit:stock.unit, expectedMethod:stock.stockMethod, expectedUpdatedAt:stock.updatedAt
  });
  const countFields = () => [
    row("Hasil Hitung Fisik", number("stockOpeningBalance", "", "", 'min="0" step="any" required')),
    row("Alasan", '<input name="stockCountReason" required maxlength="250" placeholder="Contoh: Hitung fisik gudang">')
  ].join("");

  function bindSave(form, submit) {
    form.onsubmit = async event => {
      event.preventDefault();
      if (form.dataset.saving) return;
      form.dataset.saving = "true";
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try { await submit(Object.fromEntries(new FormData(form))); }
      catch (error) { c.toast(error.message, "error"); }
      finally { delete form.dataset.saving; button.disabled = false; }
    };
  }

  function openMaterialForm(material = null) {
    const method = material?.stockMethod || "UNIT";
    const stock = material && c.state.inventory.find(row => row.materialId === material.id);
    const allowCount = Boolean(stock && canCount());
    const input = (name, value, extra = "") => `<input name="${name}" value="${h(value ?? "")}" ${extra}>`;
    const detail = c.showMasterDialog(material ? "Edit Bahan" : "Tambah Bahan", `<form id="material-form" class="master-form" data-compact-master-form>
      <div class="material-fields">
        ${row("SKU Bahan", input("sku", material?.sku, "required"))}
        ${row("Nama Bahan", input("name", material?.name, "required"))}
        ${row("Kategori Bahan", `<select name="category" required>${[...(c.state.catalogOptions.materialCategories || [])].sort((a,b)=>a.localeCompare(b,"id")).map(category=>`<option value="${h(category)}" ${category === (material?.category || "Lainnya") ? "selected" : ""}>${h(category)}</option>`).join("")}</select>`)}
        ${row("Satuan Kalkulasi", `<select name="unit">${unitOptions(material?.unit)}</select>`)}
        ${material ? '<p class="product-note material-edit-note" data-calculation-note hidden>Periksa HPP per satuan baru dan takaran bahan pada produk terkait. Sistem tidak mengonversi nilainya.</p>' : ""}
        ${row("Harga Dasar / HPP", `<span class="material-cost"><b aria-hidden="true">Rp</b><input name="cost" type="number" min="0" step="any" value="${h(material?.cost ?? "")}"></span>`)}
        ${row("Metode Pencatatan Stok", `<select name="stockMethod">${methodOptions(method)}</select>`)}
        <div data-roll-width ${method === "ROLL" ? "" : "hidden"}>${row("Lebar Roll", number("rollWidthCm", material?.rollWidthCm ?? "", "cm", 'min="0.01" step="any" placeholder="110"'))}</div>
        ${row("Supplier", input("supplier", material?.supplier))}
        <div class="material-balances">
          ${row("Stok Minimum", number("minStock", material?.minStock || "", "", 'min="0" step="any"'))}
          ${material ? "" : row("Stok Awal", number("stock", "", "", 'min="0" step="any" placeholder="0"'))}
        </div>
        ${material ? `<div class="material-balances" data-material-count hidden>
          <p class="product-note material-edit-note">${allowCount ? `Saldo tercatat: ${formatted(stock.quantity)} ${h(stock.unit)}. Masukkan hasil hitung dalam satuan baru. Saldo lama tetap tercatat di riwayat.` : "Perubahan metode atau satuan stok fisik memerlukan akses penyesuaian stok."}</p>
          ${allowCount ? countFields() : ""}
        </div>` : ""}
      </div>
      <div class="form-footer sticky-form-footer material-footer">${c.switchHtml("active", material?.active !== false)}${c.deleteButtonHtml(material,"Bahan")}<button class="primary" type="submit">Simpan Bahan</button></div></form>`);
    c.bindDeleteRecord(detail,material,"materials","Bahan","materials");
    const form = detail.querySelector("form"), fields = form.elements;
    const needsCount = () => material && stockSetupNeedsCount(material, fields.stockMethod.value, fields.unit.value);
    const countSection = form.querySelector("[data-material-count]");
    const calculationNote = form.querySelector("[data-calculation-note]");
    let previousNeedsCount = false;
    const originalMinimum = fields.minStock.value;
    bindStockUnits(form, material ? "stockOpeningBalance" : "stock", roll => {
      if (!material) return;
      const changing = Boolean(needsCount());
      calculationNote.hidden = normalizedStockUnit(fields.unit.value) === normalizedStockUnit(material.unit);
      countSection.hidden = !changing;
      countSection.querySelectorAll("input").forEach(field => { field.disabled = !changing; });
      if (changing !== previousNeedsCount) fields.minStock.value = changing ? "" : originalMinimum;
      previousNeedsCount = changing;
      fields.rollWidthCm.required = roll && changing;
    });
    bindSave(form, async values => {
      values.active = fields.active.checked;
      if (needsCount()) {
        if (!allowCount) throw new Error("Perubahan metode atau satuan stok fisik memerlukan akses penyesuaian stok.");
        Object.assign(values, countSnapshot(stock), { confirmStockCount:true });
      }
      await c.api(material ? `/api/materials/${encodeURIComponent(material.id)}` : "/api/materials", { method:material ? "PUT" : "POST", body:JSON.stringify(values) });
      c.dialog.close(); await c.load(); c.toast("Bahan berhasil disimpan");
    });
  }

  function bindStockUnits(form, balanceName, onSync = () => {}) {
    const fields = form.elements;
    const sync = () => {
      const roll = fields.stockMethod.value === "ROLL";
      form.querySelector("[data-roll-width]").hidden = !roll;
      fields.rollWidthCm.required = roll;
      fields.rollWidthCm.disabled = !roll;
      if (fields[balanceName]) fields[balanceName].step = roll ? "1" : "any";
      const physicalUnit = roll ? "roll" : fields.unit.value;
      for (const label of form.querySelectorAll("[data-physical-unit]")) label.textContent = physicalUnit;
      onSync(roll);
    };
    fields.stockMethod.onchange = fields.unit.onchange = sync;
    sync();
  }

  function openStockCount(stock) {
    const material = c.state.materials.find(row => row.id === stock?.materialId);
    if (!material) return;
    const detail = c.showMasterDialog("Stok Opname", `<form id="stock-count-form" class="master-form" data-compact-master-form>
      <div class="stock-entry-summary"><span>${h(stock.productName)}</span><strong>Saldo tercatat ${formatted(stock.quantity)} ${h(stock.unit)}</strong></div>
      <p class="product-note">Masukkan hasil hitung fisik. Jika metode atau satuan berubah, saldo lama tidak dikonversi otomatis.</p>
      <div class="material-fields">
        ${row("Metode Pencatatan Stok", `<select name="stockMethod">${methodOptions(stock.stockMethod)}</select>`)}
        ${row("Satuan Kalkulasi", `<select name="unit">${unitOptions(material.unit)}</select>`)}
        <div data-roll-width>${row("Lebar Roll", number("rollWidthCm", material.rollWidthCm ?? "", "cm", 'min="0.01" step="any" placeholder="110"'))}</div>
        ${row("Stok Minimum", number("minStock", material.minStock || "", "", 'min="0" step="any"'))}
        ${countFields()}
      </div>
      <div class="form-footer sticky-form-footer"><button class="secondary" type="button" data-close-stock>Batal</button><button class="primary" type="submit">Simpan Stok Opname</button></div>
    </form>`);
    const form = detail.querySelector("form");
    detail.querySelector("[data-close-stock]").onclick = () => c.dialog.close();
    const originalMinimum = form.elements.minStock.value;
    let previousNeedsCount = false;
    bindStockUnits(form, "stockOpeningBalance", () => {
      const changing = stockSetupNeedsCount(material, form.elements.stockMethod.value, form.elements.unit.value);
      if (changing !== previousNeedsCount) form.elements.minStock.value = changing ? "" : originalMinimum;
      previousNeedsCount = changing;
    });
    bindSave(form, async values => {
      await c.api(`/api/inventory/${encodeURIComponent(stock.sku)}/count`, { method:"POST", body:JSON.stringify({
        ...values, ...countSnapshot(stock)
      }) });
      c.dialog.close(); await c.load(); c.toast("Stok opname berhasil dicatat");
    });
  }

  function movementHtml(move) {
    const quantity=move.type==="METHOD_OPENING"?`= ${move.balance}`:`${move.change>0?"+":""}${move.change}`;
    return `<div class="movement"><div><strong>${h(move.productName)}</strong><br><small>${h(move.reason)}${move.orderCode?` · ${h(move.orderCode)}`:""}${move.type==="METHOD_OPENING"?`<br>Saldo lama: ${move.previousBalance} ${h(move.previousUnit)}`:""}<br>${c.dateFormat.format(new Date(move.createdAt))}</small></div><em class="${move.change>0?"plus":"minus"}">${quantity} ${h(move.unit || "")}</em></div>`;
  }
  function renderStock() {
    const legacyIds=new Set(c.state.materials.filter(material=>material.lfLegacyGroup).map(material=>material.id));
    const categories=[...new Set(c.state.inventory.map(row=>row.category || "Lainnya"))].sort();
    const stockCountButton = row => canCount() && row.materialId
      ? `<button class="${row.stockNeedsCount ? "primary" : "secondary"}" data-stock-count="${h(row.sku)}">${row.stockNeedsCount ? "Tetapkan Saldo Roll" : "Stok Opname"}</button>`
      : "";
    c.root.innerHTML=`<div class="stock-page unified-page"><header class="page-toolbar"><h1>Stok Bahan</h1><div class="stock-filters page-toolbar-filters"><input id="stock-search" class="search" value="${h(c.state.stockSearch)}" placeholder="Cari bahan atau SKU…"><select id="stock-category" class="filter-select"><option value="">Semua kategori</option>${categories.map(category=>`<option ${category===c.state.stockCategory?"selected":""}>${h(category)}</option>`).join("")}</select></div></header><div class="stock-grid"><section class="panel"><div class="panel-head"><h2>Daftar Bahan</h2><span class="badge info">Roll manual · Satuan otomatis</span></div><div class="table-wrap"><table><thead><tr><th>Bahan</th><th>Kategori</th><th>SKU</th><th>Metode</th><th>Stok</th><th>Minimum</th><th>Update</th>${c.can("stock.adjust")?"<th></th>":""}</tr></thead><tbody>${c.state.inventory.map(row=>`<tr data-stock-row data-search="${h(`${row.productName} ${row.sku}`.toLowerCase())}" data-category="${h(row.category || "Lainnya")}"><td><strong>${h(row.productName)}</strong>${legacyIds.has(row.materialId)?'<br><small>Bahan generik lama · saldo belum dibagi</small>':""}${row.rollWidthCm?`<br><small>Lebar ${row.rollWidthCm} cm</small>`:""}${row.productId?'<br><small>Barang Dagangan</small>':""}</td><td><span class="mini-chip">${h(row.category || "Lainnya")}</span></td><td>${h(row.sku)}</td><td>${stockMethodLabel(row.stockMethod)}${row.stockNeedsCount?'<br><small>Perlu stok opname roll</small>':""}</td><td class="${!row.stockNeedsCount && Number(row.quantity)<=Number(row.minStock || 0)?"stock-negative":""}">${Number(row.quantity).toLocaleString("id-ID")} ${h(row.unit)}${row.stockNeedsCount?'<br><small>Saldo lama; belum jumlah roll</small>':""}</td><td>${Number(row.minStock || 0).toLocaleString("id-ID")} ${h(row.unit)}</td><td>${c.dateFormat.format(new Date(row.updatedAt))}</td>${c.can("stock.adjust")?`<td><div class="stock-actions">${row.stockNeedsCount ? "" : `<button class="primary" data-stock-in="${h(row.sku)}">+ Tambah Stok</button>${row.stockMethod==="ROLL"?`<button class="secondary" data-stock-out="${h(row.sku)}">Keluarkan Roll</button>`:""}<button class="secondary" data-adjust="${h(row.sku)}">Sesuaikan</button>`}${stockCountButton(row)}</div></td>`:""}</tr>`).join("")}</tbody></table><div id="stock-empty" class="cart-empty hidden">Bahan tidak ditemukan.</div></div></section><aside class="panel"><div class="panel-head"><h2>Mutasi Terakhir</h2></div><div class="panel-body" id="stock-movement-list">${c.state.stockMovements.slice(0,15).map(movementHtml).join("") || '<div class="cart-empty">Belum ada mutasi stok.</div>'}</div><button type="button" class="secondary" id="stock-more-movements">Mutasi lainnya</button></aside></div></div>`;
    const apply=()=>{const query=c.root.querySelector("#stock-search").value.trim().toLowerCase(),category=c.root.querySelector("#stock-category").value;let visible=0;c.root.querySelectorAll("[data-stock-row]").forEach(row=>{const show=(!query || row.dataset.search.includes(query))&&(!category || row.dataset.category===category);row.classList.toggle("hidden",!show);if(show)visible++;});c.root.querySelector("#stock-empty").classList.toggle("hidden",visible>0);c.state.stockSearch=query;c.state.stockCategory=category;};
    c.root.querySelector("#stock-search").oninput=apply;c.root.querySelector("#stock-category").onchange=apply;apply();
    for(const [selector,kind] of [["data-stock-in","in"],["data-stock-out","out"],["data-adjust","adjust"]])c.root.querySelectorAll(`[${selector}]`).forEach(button=>button.onclick=()=>openStockEntry(c.state.inventory.find(row=>row.sku===button.getAttribute(selector)),kind));
    c.root.querySelectorAll("[data-stock-count]").forEach(button=>button.onclick=()=>openStockCount(c.state.inventory.find(row=>row.sku===button.dataset.stockCount)));
    let offset=15;const more=c.root.querySelector("#stock-more-movements");
    more.hidden=Number(c.state.stockMovementCount || 0)<=15;
    more.onclick=async()=>{more.disabled=true;try{const data=await c.api(`/api/stock-movements?offset=${offset}&limit=15`);c.root.querySelector("#stock-movement-list").insertAdjacentHTML("beforeend",data.movements.map(movementHtml).join(""));c.state.stockMovements.push(...data.movements);offset+=data.movements.length;more.hidden=!data.hasMore;}catch(error){c.toast(error.message,"error");}finally{more.disabled=false;}};
  }
  function openStockEntry(item,kind="in") {
    if(!item)return;
    const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Makassar"}).format(new Date());
    const returns=c.state.stockMovements.filter(move=>move.sku===item.sku&&move.type==="AUTO_USE"&&move.unit===item.unit);
    const detail=c.showMasterDialog(kind==="out"?"Pengeluaran Roll":kind==="adjust"?"Penyesuaian Stok":"Tambah Stok Bahan",`<form id="stock-entry-form" class="master-form"${kind!=="out"?" data-compact-master-form":""}><div class="stock-entry-summary"><span>${h(item.productName)}</span><strong>Stok saat ini ${Number(item.quantity).toLocaleString("id-ID")} ${h(item.unit)}</strong></div><div class="form-grid"><label class="field"><span>${kind==="adjust"?"Perubahan stok (+ / −)":kind==="out"?"Jumlah roll dikeluarkan":"Jumlah stok masuk"} *</span><span class="input-with-unit"><input name="change" type="number" ${kind==="adjust"?"":'min="1"'} step="${item.stockMethod==="ROLL"?"1":"any"}" required><b>${h(item.unit)}</b></span></label><label class="field"><span>Tanggal stok *</span><input name="movementDate" type="date" value="${today}" required></label><label class="field full"><span>Alasan *</span><input name="reason" value="${kind==="out"?"Roll dibuka untuk produksi":kind==="in"?"Stok masuk":""}" required></label>${kind==="adjust"?`<label class="field full"><span>Koreksi mutasi transaksi (opsional)</span><select name="reversalOf"><option value="">Penyesuaian manual biasa</option>${returns.map(move=>`<option value="${move.id}">${h(move.orderCode || "Transaksi")} · ${-move.change} ${h(move.unit)}</option>`).join("")}</select></label><label class="field full"><span><input type="checkbox" name="physicalReturned"> Barang sudah kembali secara fisik (wajib untuk retur transaksi).</span></label>`:""}</div><div class="form-footer sticky-form-footer"><button class="secondary" type="button" data-close-stock>Batal</button><button class="primary" type="submit">Simpan Mutasi Stok</button></div></form>`);
    const form=detail.querySelector("form"),requestId=crypto.randomUUID();let saving=false;
    detail.querySelector("[data-close-stock]").onclick=()=>c.dialog.close();
    form.onsubmit=async event=>{event.preventDefault();if(saving)return;const values=Object.fromEntries(new FormData(form));values.change=kind==="out"?-Math.abs(Number(values.change)):Number(values.change);values.requestId=requestId;values.physicalReturned=form.elements.physicalReturned?.checked || false;saving=true;const button=form.querySelector('button[type="submit"]');button.disabled=true;try{await c.api(`/api/inventory/${encodeURIComponent(item.sku)}`,{method:"PATCH",body:JSON.stringify(values)});c.dialog.close();await c.load();c.state.view="stock";renderStock();c.toast("Mutasi stok berhasil dicatat");}catch(error){c.toast(error.message,"error");}finally{saving=false;button.disabled=false;}};
  }
  return { openMaterialForm, renderStock, openStockEntry };
}
