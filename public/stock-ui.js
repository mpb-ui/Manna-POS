import { stockMethodLabel } from "./stock-methods.js";

export function createStockUi(c) {
  const h = c.escapeHtml;
  const units = ["m²", "m lari", "pcs", "lbr", "lembar", "kg", "pack", "rim", "set", "roll"];
  function openMaterialForm(material = null) {
    const stock = material && c.state.inventory.find(row => row.materialId === material.id);
    const method = material?.stockMethod || "UNIT";
    const options = [...new Set([...units, material?.unit, material?.stockUnit].filter(Boolean))];
    const detail = c.showMasterDialog(material ? "Edit Bahan" : "Tambah Bahan", `<form id="material-form" class="master-form"><div class="form-grid">
      <label class="field"><span>Nama bahan *</span><input name="name" value="${h(material?.name || "")}" required></label><label class="field"><span>SKU bahan *</span><input name="sku" value="${h(material?.sku || "")}" required></label>
      <label class="field"><span>Kategori bahan *</span><select name="category" required>${[...(c.state.catalogOptions.materialCategories || [])].sort((a,b)=>a.localeCompare(b,"id")).map(category=>`<option value="${h(category)}" ${category===(material?.category || "Lainnya")?"selected":""}>${h(category)}</option>`).join("")}</select><small>Tambah atau ubah kategori melalui tab Kategori → Kategori Bahan.</small></label>
      <label class="field"><span>Satuan kalkulasi / HPP *</span><select name="unit">${options.map(unit=>`<option ${unit===(material?.unit || "pcs")?"selected":""}>${h(unit)}</option>`).join("")}</select><small>Untuk konsumsi produksi dan biaya; terpisah dari stok fisik roll.</small></label>
      <label class="field full"><span>Metode Pencatatan Stok *</span><select name="stockMethod"><option value="ROLL" ${method==="ROLL"?"selected":""}>Per Roll</option><option value="UNIT" ${method==="UNIT"?"selected":""}>Per Satuan</option></select><small data-method-note></small></label>
      <label class="field" data-roll-width><span>Lebar roll (cm)</span><input name="rollWidthCm" type="number" min="0.01" step="any" value="${material?.rollWidthCm || ""}" placeholder="Contoh: 110"></label>
      <label class="field"><span>Satuan stok fisik *</span><select name="stockUnit">${options.map(unit=>`<option ${unit===(material?.stockUnit || "pcs")?"selected":""}>${h(unit)}</option>`).join("")}</select></label>
      ${material ? "" : '<label class="field"><span>Stok awal fisik</span><input name="stock" type="number" min="0" step="any" value="0" required></label>'}
      <label class="field"><span>Stok minimum</span><input name="minStock" type="number" min="0" step="any" value="${material?.minStock || 0}" required></label>
      <label class="field"><span>Harga dasar / satuan kalkulasi</span><input name="cost" type="number" min="0" value="${material?.cost || 0}"></label><label class="field"><span>Supplier</span><input name="supplier" value="${h(material?.supplier || "")}"></label>
      ${material ? `<section class="field full note" data-stock-count hidden><strong>Penetapan saldo fisik / stok opname</strong><span>Saldo tercatat: ${Number(stock?.quantity || 0).toLocaleString("id-ID")} ${h(stock?.unit || material.unit)}. Saldo lama tidak dikonversi otomatis.</span><label><input type="checkbox" name="confirmStockCount"> Saya menetapkan saldo berdasarkan hasil hitung fisik.</label><label class="field"><span>Saldo awal pada satuan baru</span><input name="stockOpeningBalance" type="number" min="0" step="any" placeholder="Hasil stok opname"></label><label class="field"><span>Alasan penetapan saldo</span><input name="stockCountReason" placeholder="Contoh: Stok opname roll gudang 14 Oktober"></label></section>` : ""}
      </div><div class="form-footer">${c.switchHtml("active", material?.active !== false)}${c.deleteButtonHtml(material,"Bahan")}<button class="primary" type="submit">Simpan Bahan</button></div></form>`);
    c.bindDeleteRecord(detail,material,"materials","Bahan","materials");
    const form = detail.querySelector("form"), e = form.elements;
    const sync = () => {
      const roll = e.stockMethod.value === "ROLL";
      detail.querySelector("[data-roll-width]").hidden = !roll; e.rollWidthCm.required = roll && (!material || e.confirmStockCount?.checked);
      e.stockUnit.value = roll ? "roll" : e.unit.value; e.stockUnit.disabled = true;
      detail.querySelector("[data-method-note]").textContent = roll ? "Jumlah roll utuh. Pengeluaran dicatat manual; pesanan selesai tidak memotong roll." : "Barang dagangan dipotong saat penjualan dikonfirmasi; bahan produksi saat pesanan selesai.";
      if (e.stock) e.stock.step = roll ? "1" : "any";
      if (material) {
        const changed = e.stockMethod.value !== method || e.stockUnit.value !== (material.stockUnit || material.unit);
        const count = detail.querySelector("[data-stock-count]"); count.hidden = !changed && !material.stockNeedsCount;
        e.confirmStockCount.required = changed;
        e.stockOpeningBalance.required = !count.hidden && e.confirmStockCount.checked;
        e.stockCountReason.required = e.stockOpeningBalance.required;
        e.stockOpeningBalance.step = roll ? "1" : "any";
      }
    };
    e.stockMethod.onchange=sync;e.unit.onchange=sync;if(e.confirmStockCount)e.confirmStockCount.onchange=sync;sync();
    let saving=false;
    form.onsubmit=async event=>{
      event.preventDefault();if(saving)return;
      const values=Object.fromEntries(new FormData(form));values.active=e.active.checked;values.stockUnit=e.stockUnit.value;values.confirmStockCount=e.confirmStockCount?.checked || false;
      saving=true;const button=form.querySelector('button[type="submit"]');button.disabled=true;
      try { await c.api(material?`/api/materials/${material.id}`:"/api/materials",{method:material?"PUT":"POST",body:JSON.stringify(values)});c.dialog.close();c.state.view="master";c.state.masterTab="materials";await c.load();c.toast("Bahan berhasil disimpan"); }
      catch(error){c.toast(error.message,"error");}finally{saving=false;button.disabled=false;}
    };
  }

  function movementHtml(move) {
    const quantity=move.type==="METHOD_OPENING"?`= ${move.balance}`:`${move.change>0?"+":""}${move.change}`;
    return `<div class="movement"><div><strong>${h(move.productName)}</strong><br><small>${h(move.reason)}${move.orderCode?` · ${h(move.orderCode)}`:""}${move.type==="METHOD_OPENING"?`<br>Saldo lama: ${move.previousBalance} ${h(move.previousUnit)}`:""}<br>${c.dateFormat.format(new Date(move.createdAt))}</small></div><em class="${move.change>0?"plus":"minus"}">${quantity} ${h(move.unit || "")}</em></div>`;
  }
  function renderStock() {
    const legacyIds=new Set(c.state.materials.filter(material=>material.lfLegacyGroup).map(material=>material.id));
    const categories=[...new Set(c.state.inventory.map(row=>row.category || "Lainnya"))].sort();
    c.root.innerHTML=`<div class="stock-grid"><section class="panel"><div class="panel-head stock-head"><div><h2>Stok Bahan</h2><span class="badge info">Roll manual · Satuan otomatis</span></div><div class="stock-filters"><input id="stock-search" class="search" value="${h(c.state.stockSearch)}" placeholder="Cari bahan atau SKU…"><select id="stock-category" class="filter-select"><option value="">Semua kategori</option>${categories.map(category=>`<option ${category===c.state.stockCategory?"selected":""}>${h(category)}</option>`).join("")}</select></div></div><div class="table-wrap"><table><thead><tr><th>Bahan</th><th>Kategori</th><th>SKU</th><th>Metode</th><th>Stok</th><th>Minimum</th><th>Update</th>${c.can("stock.adjust")?"<th></th>":""}</tr></thead><tbody>${c.state.inventory.map(row=>`<tr data-stock-row data-search="${h(`${row.productName} ${row.sku}`.toLowerCase())}" data-category="${h(row.category || "Lainnya")}"><td><strong>${h(row.productName)}</strong>${legacyIds.has(row.materialId)?'<br><small>Bahan generik lama · saldo belum dibagi</small>':""}${row.rollWidthCm?`<br><small>Lebar ${row.rollWidthCm} cm</small>`:""}${row.productId?'<br><small>Barang Dagangan</small>':""}</td><td><span class="mini-chip">${h(row.category || "Lainnya")}</span></td><td>${h(row.sku)}</td><td>${stockMethodLabel(row.stockMethod)}${row.stockNeedsCount?'<br><small>Perlu stok opname roll</small>':""}</td><td class="${!row.stockNeedsCount && Number(row.quantity)<=Number(row.minStock || 0)?"stock-negative":""}">${Number(row.quantity).toLocaleString("id-ID")} ${h(row.unit)}${row.stockNeedsCount?'<br><small>Saldo lama; belum jumlah roll</small>':""}</td><td>${Number(row.minStock || 0).toLocaleString("id-ID")} ${h(row.unit)}</td><td>${c.dateFormat.format(new Date(row.updatedAt))}</td>${c.can("stock.adjust")?`<td><div class="stock-actions">${row.stockNeedsCount?c.can("master.materials")?`<button class="primary" data-stock-count="${h(row.materialId)}">Tetapkan Saldo Roll</button>`:"":`<button class="primary" data-stock-in="${h(row.sku)}">+ Tambah Stok</button>${row.stockMethod==="ROLL"?`<button class="secondary" data-stock-out="${h(row.sku)}">Keluarkan Roll</button>`:""}<button class="secondary" data-adjust="${h(row.sku)}">Sesuaikan</button>`}</div></td>`:""}</tr>`).join("")}</tbody></table><div id="stock-empty" class="cart-empty hidden">Bahan tidak ditemukan.</div></div></section><aside class="panel"><div class="panel-head"><h2>Mutasi Terakhir</h2></div><div class="panel-body" id="stock-movement-list">${c.state.stockMovements.slice(0,15).map(movementHtml).join("") || '<div class="cart-empty">Belum ada mutasi stok.</div>'}</div><button type="button" class="secondary" id="stock-more-movements">Mutasi lainnya</button></aside></div>`;
    const apply=()=>{const query=c.root.querySelector("#stock-search").value.trim().toLowerCase(),category=c.root.querySelector("#stock-category").value;let visible=0;c.root.querySelectorAll("[data-stock-row]").forEach(row=>{const show=(!query || row.dataset.search.includes(query))&&(!category || row.dataset.category===category);row.classList.toggle("hidden",!show);if(show)visible++;});c.root.querySelector("#stock-empty").classList.toggle("hidden",visible>0);c.state.stockSearch=query;c.state.stockCategory=category;};
    c.root.querySelector("#stock-search").oninput=apply;c.root.querySelector("#stock-category").onchange=apply;apply();
    for(const [selector,kind] of [["data-stock-in","in"],["data-stock-out","out"],["data-adjust","adjust"]])c.root.querySelectorAll(`[${selector}]`).forEach(button=>button.onclick=()=>openStockEntry(c.state.inventory.find(row=>row.sku===button.getAttribute(selector)),kind));
    c.root.querySelectorAll("[data-stock-count]").forEach(button=>button.onclick=()=>openMaterialForm(c.state.materials.find(material=>material.id===button.dataset.stockCount)));
    let offset=15;const more=c.root.querySelector("#stock-more-movements");
    more.hidden=Number(c.state.stockMovementCount || 0)<=15;
    more.onclick=async()=>{more.disabled=true;try{const data=await c.api(`/api/stock-movements?offset=${offset}&limit=15`);c.root.querySelector("#stock-movement-list").insertAdjacentHTML("beforeend",data.movements.map(movementHtml).join(""));c.state.stockMovements.push(...data.movements);offset+=data.movements.length;more.hidden=!data.hasMore;}catch(error){c.toast(error.message,"error");}finally{more.disabled=false;}};
  }
  function openStockEntry(item,kind="in") {
    if(!item)return;
    const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Makassar"}).format(new Date());
    const returns=c.state.stockMovements.filter(move=>move.sku===item.sku&&move.type==="AUTO_USE"&&move.unit===item.unit);
    const detail=c.showMasterDialog(kind==="out"?"Pengeluaran Roll":kind==="adjust"?"Penyesuaian Stok":"Tambah Stok Bahan",`<form id="stock-entry-form" class="master-form"><div class="stock-entry-summary"><span>${h(item.productName)}</span><strong>Stok saat ini ${Number(item.quantity).toLocaleString("id-ID")} ${h(item.unit)}</strong></div><div class="form-grid"><label class="field"><span>${kind==="adjust"?"Perubahan stok (+ / −)":kind==="out"?"Jumlah roll dikeluarkan":"Jumlah stok masuk"} *</span><span class="input-with-unit"><input name="change" type="number" ${kind==="adjust"?"":'min="1"'} step="${item.stockMethod==="ROLL"?"1":"any"}" required><b>${h(item.unit)}</b></span></label><label class="field"><span>Tanggal stok *</span><input name="movementDate" type="date" value="${today}" required></label><label class="field full"><span>Alasan *</span><input name="reason" value="${kind==="out"?"Roll dibuka untuk produksi":kind==="in"?"Stok masuk":""}" required></label>${kind==="adjust"?`<label class="field full"><span>Koreksi mutasi transaksi (opsional)</span><select name="reversalOf"><option value="">Penyesuaian manual biasa</option>${returns.map(move=>`<option value="${move.id}">${h(move.orderCode || "Transaksi")} · ${-move.change} ${h(move.unit)}</option>`).join("")}</select></label><label class="field full"><span><input type="checkbox" name="physicalReturned"> Barang sudah kembali secara fisik (wajib untuk retur transaksi).</span></label>`:""}</div><div class="form-footer sticky-form-footer"><button class="secondary" type="button" data-close-stock>Batal</button><button class="primary" type="submit">Simpan Mutasi Stok</button></div></form>`);
    const form=detail.querySelector("form"),requestId=crypto.randomUUID();let saving=false;
    detail.querySelector("[data-close-stock]").onclick=()=>c.dialog.close();
    form.onsubmit=async event=>{event.preventDefault();if(saving)return;const values=Object.fromEntries(new FormData(form));values.change=kind==="out"?-Math.abs(Number(values.change)):Number(values.change);values.requestId=requestId;values.physicalReturned=form.elements.physicalReturned?.checked || false;saving=true;const button=form.querySelector('button[type="submit"]');button.disabled=true;try{await c.api(`/api/inventory/${encodeURIComponent(item.sku)}`,{method:"PATCH",body:JSON.stringify(values)});c.dialog.close();await c.load();c.state.view="stock";renderStock();c.toast("Mutasi stok berhasil dicatat");}catch(error){c.toast(error.message,"error");}finally{saving=false;button.disabled=false;}};
  }
  return { openMaterialForm, renderStock, openStockEntry };
}
