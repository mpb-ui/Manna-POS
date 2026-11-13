import { enhanceMaterialSelects } from './material-picker.js';
import { DTF_SIZES, DTF_LABEL_LENGTH, MAX_DTF_TIERS, MAX_DTF_VARIANTS, dtfLabel, dtfSizeSurcharge, dtfVariantKey, usableDtfMaterial } from './dtf-variants.js';

const tabs = [['prices', 'Harga & Pengaturan'], ['stock', 'Warna & Sumber Bahan']];
const heading = (n, label, action = '') => `<div class="dtf-section-head"><h3><span aria-hidden="true">${n}</span>${label}</h3>${action}</div>`;
const keyForColor = color => dtfVariantKey(color, '');

export function dtfProductEditor(product, materials, { e, moneyField, bindMoneyInputs, parseMoney, settings, footer }) {
  const packs = product.dtfPackages;
  const tiers = structuredClone(product.dtfWholesaleTiers || []);
  const retail = Object.fromEntries(packs.map(pack => [pack.id, pack.price]));
  const groups = [];
  for (const row of product.dtfStockVariants || []) {
    let group = groups.find(group => keyForColor(group.color) === keyForColor(row.color));
    if (!group) { group = { color: row.color, selected: new Set(), sources: new Map(), legacy: [] }; groups.push(group); }
    group.selected.add(row.size);
    group.sources.set(row.size, row.materialId);
    if (!DTF_SIZES.includes(row.size)) group.legacy.push(row.size);
  }
  const allowed = new Set(materials.filter(usableDtfMaterial).map(item => item.id));
  const fees = new Map();
  const shownFees = new Set();
  for (const size of new Set(groups.flatMap(group => [...group.selected]))) {
    const fee = dtfSizeSurcharge(product, size);
    fees.set(size, fee);
    if (fee || size === 'XXL') shownFees.add(size);
  }
  const amount = (name, value, attrs = '') => moneyField(name, value ?? '', attrs);
  const html = `<form id="dtf-master-form" class="pe-form" novalidate>
    <div class="pe-tabs" role="tablist" aria-label="Edit Sablon Kaos">${tabs.map(([key,label], i) => `<button type="button" role="tab" id="dtf-tab-${key}" aria-controls="dtf-panel-${key}" aria-selected="${i === 0}" tabindex="${i ? -1 : 0}" data-dtf-tab="${key}">${label}</button>`).join('')}</div>
    <div class="pe-scroll" data-dtf-scroll>
      <div id="dtf-panel-prices" role="tabpanel" aria-labelledby="dtf-tab-prices">
        <section class="dtf-editor-section">${heading(1, 'Harga Paket Sablon Kaos', '<button type="button" class="text-button" data-dtf-add-tier>+ Harga Grosir</button>')}<div data-dtf-pricing></div></section>
        <section class="dtf-editor-section">${heading(2, 'Harga Dasar / HPP')}<div class="dtf-editor-card">
          <div class="dtf-cost-columns">
            <div><h4>Biaya Cetak</h4>${packs.map(pack => `<label><span>${e(pack.label)}</span>${amount('print-cost-'+pack.id, pack.printCost, 'data-optional-money placeholder="5.000"')}</label>`).join('')}</div>
            <div><h4>Biaya Kaos</h4>${DTF_SIZES.map(size => `<label><span>${e(size)}</span>${amount('shirt-cost-'+size, product.dtfShirtCosts?.find(row=>row.size===size)?.amount, 'data-optional-money')}</label>`).join('')}</div>
          </div>
          ${packs.some(pack => pack.baseCost != null && pack.printCost == null) ? '<p class="product-note dtf-cost-note">HPP lama tetap dipakai untuk paket yang biaya cetaknya belum diisi.</p>' : ''}
        </div></section>
        <section class="dtf-editor-section">${heading(3, 'Tambahan Harga Ukuran')}<div class="dtf-editor-card" data-dtf-fees></div></section>
        ${settings}
      </div>
      <div id="dtf-panel-stock" role="tabpanel" aria-labelledby="dtf-tab-stock" hidden>
        <section class="dtf-editor-section">${heading(1, 'Warna & Ukuran')}<div class="dtf-editor-card"><div data-dtf-colors></div><div class="dtf-editor-actions"><button type="button" class="text-button" data-dtf-add-color>+ Tambah Warna</button></div></div></section>
        <section class="dtf-editor-section">${heading(2, 'Sumber Bahan')}<div data-dtf-sources></div></section>
      </div>
    </div>${footer}
  </form>`;
  return { html, bind(form) {
    const $ = selector => form.querySelector(selector);
    const pricing = $('[data-dtf-pricing]'), colors = $('[data-dtf-colors]'), sources = $('[data-dtf-sources]'), feeBox = $('[data-dtf-fees]');
    const tabButtons = [...form.querySelectorAll('[data-dtf-tab]')];
    const scroll = $('[data-dtf-scroll]');
    const offsets = new Map();
    let active = 'prices';
    function showTab(key, focus = false) {
      if (active !== key) {
        offsets.set(active, scroll.scrollTop);
        active = key;
        for (const button of tabButtons) {
          const selected = button.dataset.dtfTab === key;
          button.setAttribute('aria-selected', selected);
          button.tabIndex = selected ? 0 : -1;
          form.querySelector('#'+button.getAttribute('aria-controls')).hidden = !selected;
        }
        scroll.scrollTop = offsets.get(key) || 0;
      }
      if (focus) tabButtons.find(button => button.dataset.dtfTab === key)?.focus();
    }
    for (const [i, button] of tabButtons.entries()) {
      button.onclick = () => showTab(button.dataset.dtfTab);
      button.onkeydown = event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        showTab(tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length-1 : (i+1)%tabs.length][0], true);
      };
    }
    const fail = (tab, message, element) => {
      showTab(tab);
      element?.focus();
      throw new Error(message);
    };
    const readMoney = (input, { optional = false, positive = false } = {}) => {
      if (!input.value.trim() && optional) return null;
      const value = parseMoney(input.value);
      if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
        fail('prices', positive ? 'Isi harga jual yang valid untuk semua paket' : 'Isi nominal biaya yang valid (Rp0 atau lebih)', input);
      }
      return value;
    };
    const capturePrices = () => {
      for (const input of pricing.querySelectorAll('[data-dtf-retail]')) retail[input.dataset.dtfRetail] = parseMoney(input.value);
      for (const [index, range] of [...pricing.querySelectorAll('[data-dtf-range]')].entries()) {
        tiers[index].min = range.querySelector('[data-dtf-min]').value;
        tiers[index].max = range.querySelector('[data-dtf-max]').value || null;
      }
      for (const input of pricing.querySelectorAll('[data-dtf-tier-price]')) tiers[Number(input.dataset.dtfTierPrice)].prices[input.dataset.package] = parseMoney(input.value);
    };
    function renderPrices() {
      const tierName = ({min,max}, index) => min ? `${e(min)} – ${e(max ?? 'Maks')}` : `Grosir ${index+1}`;
      const ranges = tiers.map((tier,i) => `<div class="dtf-tier-range" data-dtf-range>
        <input type="number" min="1" step="1" inputmode="numeric" data-dtf-min aria-label="Minimum grosir ${i+1}" value="${e(tier.min ?? '')}">
        <span aria-hidden="true">–</span>
        <input type="number" min="1" step="1" inputmode="numeric" data-dtf-max aria-label="Maksimum grosir ${i+1}" placeholder="Maks" value="${e(tier.max ?? '')}">
        <button type="button" class="dtf-remove" data-dtf-remove-tier="${i}" aria-label="Hapus tingkat grosir ${i+1}">×</button></div>`).join('');
      const table = `<div class="dtf-price-scroll"><table class="dtf-price-table ${tiers.length?'has-tiers':''}">
        ${tiers.length ? `<thead><tr><th scope="col">Paket</th><th scope="col">Harga satuan</th>${tiers.map((tier,i)=>`<th scope="col" data-dtf-tier-heading>${tierName(tier,i)}</th>`).join('')}</tr></thead>` : ''}
        <tbody>${packs.map(pack => `<tr><th scope="row">${e(pack.label)}</th><td>${amount('package-'+pack.id,retail[pack.id],`data-dtf-retail="${e(pack.id)}" aria-label="Harga satuan ${e(pack.label)}"`)}</td>${tiers.map((tier,i)=>`<td>${amount('tier-'+i+'-'+pack.id,tier.prices[pack.id],`data-dtf-tier-price="${i}" data-package="${e(pack.id)}" aria-label="Harga grosir ${i+1} ${e(pack.label)}"`)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      pricing.innerHTML = `<div class="dtf-editor-card">${ranges}${table}</div>`;
      $('[data-dtf-add-tier]').disabled = tiers.length >= MAX_DTF_TIERS;
      bindMoneyInputs(pricing);
    }
    $('[data-dtf-add-tier]').onclick = () => {
      if (tiers.length >= MAX_DTF_TIERS) return;
      capturePrices();
      const previous = tiers.at(-1);
      tiers.push({ min: previous ? (previous.max ? Number(previous.max)+1 : '') : 25, max: null, prices: {...retail} });
      renderPrices();
      [...pricing.querySelectorAll('[data-dtf-min]')].at(-1)?.focus();
    };
    pricing.addEventListener('click', event => {
      const button = event.target.closest('[data-dtf-remove-tier]');
      if (!button) return;
      capturePrices();
      tiers.splice(Number(button.dataset.dtfRemoveTier), 1);
      renderPrices();
      $('[data-dtf-add-tier]').focus();
    });
    pricing.addEventListener('input', event => {
      if (!event.target.matches('[data-dtf-min],[data-dtf-max]')) return;
      const index = [...pricing.querySelectorAll('[data-dtf-range]')].indexOf(event.target.closest('[data-dtf-range]'));
      const row = event.target.closest('[data-dtf-range]');
      const min = row.querySelector('[data-dtf-min]').value, max = row.querySelector('[data-dtf-max]').value;
      pricing.querySelectorAll('[data-dtf-tier-heading]')[index].textContent = min ? `${min} – ${max || 'Maks'}` : `Grosir ${index+1}`;
    });
    const allSizes = () => [...new Set([...DTF_SIZES, ...groups.flatMap(group=>group.legacy)])].filter(size=>groups.some(group=>group.selected.has(size)));
    function captureFees() {
      for (const input of feeBox.querySelectorAll('[data-dtf-fee]')) fees.set(input.dataset.dtfFee, parseMoney(input.value));
    }
    function renderFees() {
      const sizes = allSizes(), available = sizes.filter(size=>!shownFees.has(size));
      const rows = sizes.filter(size=>shownFees.has(size)).map(size=>`<label class="dtf-editor-row"><span>${e(size)}</span>${amount('fee-'+e(size),fees.get(size) ?? dtfSizeSurcharge(product,size),`data-dtf-fee="${e(size)}"`)}</label>`).join('');
      feeBox.innerHTML = `${rows || '<p class="product-note">Belum ada tambahan harga ukuran.</p>'}${available.length ? `<label class="dtf-editor-row dtf-fee-add"><span>+ Tambahan Harga</span><select data-dtf-add-fee><option value="">Pilih ukuran</option>${available.map(size=>`<option value="${e(size)}">${e(size)}</option>`).join('')}</select></label>` : ''}`;
      bindMoneyInputs(feeBox);
    }
    feeBox.addEventListener('change', event=>{
      const size=event.target.matches('[data-dtf-add-fee]') && event.target.value;
      if (!size) return;
      captureFees();shownFees.add(size);renderFees();
      feeBox.querySelector(`[data-dtf-fee="${CSS.escape(size)}"]`)?.focus();
    });
    function renderColors() {
      colors.innerHTML = groups.map((group,i)=>`<div class="dtf-color-row" data-dtf-color-row="${i}">
        <label class="dtf-color-label" for="dtf-color-${i}">Warna ${i+1}</label><div class="dtf-color-controls">
          <div class="dtf-color-input"><input id="dtf-color-${i}" data-dtf-color maxlength="${DTF_LABEL_LENGTH}" value="${e(group.color)}" placeholder="Contoh: Navy"><button class="dtf-remove" type="button" data-dtf-remove-color="${i}" aria-label="Hapus warna ${i+1}" ${groups.length<=1?'disabled':''}>×</button></div>
          <div class="dtf-size-chips" role="group" aria-label="Ukuran warna ${i+1}">${[...DTF_SIZES,...group.legacy].map(size=>`<label><input type="checkbox" data-dtf-size="${e(size)}" ${group.selected.has(size)?'checked':''}><span>${e(size)}</span></label>`).join('')}</div>
        </div></div>`).join('');
      $('[data-dtf-add-color]').disabled = groups.length >= MAX_DTF_VARIANTS;
    }
    function renderSources() {
      sources.innerHTML = groups.map((group,i)=>{
        const sizes=[...DTF_SIZES,...group.legacy].filter(size=>group.selected.has(size));
        if (!sizes.length) return '';
        return `<div class="dtf-source-group"><h4 data-dtf-source-title="${i}">${e(dtfLabel(group.color) || 'Warna '+(i+1))}</h4>
          <div class="dtf-source-list"><div class="dtf-source-row dtf-source-head"><span>Ukuran</span><span>Bahan stok</span></div>
          ${sizes.map(size=>{
            const selected=group.sources.get(size);
            const options=materials.filter(item=>allowed.has(item.id)||item.id===selected);
            return `<div class="dtf-source-row"><span class="dtf-source-size">${e(size)}</span><select data-shirt-stock-material data-group="${i}" data-size="${e(size)}" aria-label="Bahan stok ukuran ${e(size)}, warna ${i+1}"><option value="">Pilih bahan stok</option>${selected&&!options.some(item=>item.id===selected)?`<option value="${e(selected)}" disabled selected>Bahan tidak tersedia</option>`:''}${options.map(item=>`<option value="${e(item.id)}" ${item.id===selected?'selected':''} ${allowed.has(item.id)?'':'disabled'}>${e(item.name)}${allowed.has(item.id)?'':' (tidak tersedia)'}</option>`).join('')}</select></div>`;
          }).join('')}</div></div>`;
      }).join('') || '<p class="product-note">Pilih warna dan ukuran untuk menampilkan sumber bahan.</p>';
      enhanceMaterialSelects(sources,materials);
    }
    colors.addEventListener('input', event=>{
      if (!event.target.matches('[data-dtf-color]')) return;
      const i=Number(event.target.closest('[data-dtf-color-row]').dataset.dtfColorRow);
      groups[i].color=event.target.value;
      const title=sources.querySelector(`[data-dtf-source-title="${i}"]`);
      if(title) title.textContent=dtfLabel(groups[i].color)||'Warna '+(i+1);
    });
    colors.addEventListener('change', event=>{
      if (!event.target.matches('[data-dtf-size]')) return;
      const i=Number(event.target.closest('[data-dtf-color-row]').dataset.dtfColorRow);
      const size=event.target.dataset.dtfSize;
      captureFees();
      if(event.target.checked) {
        groups[i].selected.add(size);
        if (size==='XXL' && !fees.has(size)) shownFees.add(size);
      } else groups[i].selected.delete(size);
      renderSources();renderFees();
    });
    colors.addEventListener('click', event=>{
      const button=event.target.closest('[data-dtf-remove-color]');
      if(!button || groups.length<=1) return;
      captureFees();
      const i=Number(button.dataset.dtfRemoveColor);
      groups.splice(i,1);renderColors();renderSources();renderFees();
      colors.querySelectorAll('[data-dtf-color]')[Math.min(i,groups.length-1)]?.focus();
    });
    $('[data-dtf-add-color]').onclick=()=>{
      if(groups.length>=MAX_DTF_VARIANTS) return;
      groups.push({color:'',selected:new Set(),sources:new Map(),legacy:[]});
      renderColors();
      colors.querySelector('[data-dtf-color-row]:last-child [data-dtf-color]').focus();
    };
    sources.addEventListener('change',event=>{
      const input=event.target;
      if(input.matches('[data-shirt-stock-material]')) groups[Number(input.dataset.group)].sources.set(input.dataset.size,input.value);
    });
    if(!groups.length) groups.push({color:'',selected:new Set(),sources:new Map(),legacy:[]});
    bindMoneyInputs($('[data-dtf-scroll]'));
    renderPrices();renderColors();renderSources();renderFees();
    return () => {
      const packages=packs.map(pack=>({
        id:pack.id,
        price:readMoney(form.elements['package-'+pack.id], {positive:true}),
        printCost:readMoney(form.elements['print-cost-'+pack.id], {optional:true})
      }));
      const ranges=[...pricing.querySelectorAll('[data-dtf-range]')];
      const wholesaleTiers=ranges.map((range,index)=>{
        const minInput=range.querySelector('[data-dtf-min]'),maxInput=range.querySelector('[data-dtf-max]');
        const min=Number(minInput.value),max=maxInput.value === '' ? null : Number(maxInput.value);
        if (!Number.isSafeInteger(min) || min<1) fail('prices','Minimum grosir harus bilangan bulat minimal 1',minInput);
        if (maxInput.validity.badInput || (max!==null && (!Number.isSafeInteger(max) || max<min))) fail('prices','Maksimum grosir tidak boleh lebih kecil dari minimum',maxInput);
        const prices=Object.fromEntries(packs.map(pack=>[pack.id,readMoney(form.elements['tier-'+index+'-'+pack.id],{positive:true})]));
        return {min,max,prices,index};
      }).sort((a,b)=>a.min-b.min);
      for (let i=1;i<wholesaleTiers.length;i++){
        if (wholesaleTiers[i-1].max===null || wholesaleTiers[i].min<=wholesaleTiers[i-1].max) fail('prices','Rentang harga grosir tidak boleh tumpang tindih',ranges[wholesaleTiers[i].index].querySelector('[data-dtf-min]'));
      }
      if(form.elements.minimumEnabled.checked && !form.elements.minimumQuantity.validity.valid) fail('prices','Isi minimum pembelian dengan bilangan bulat minimal 1',form.elements.minimumQuantity);
      const stockVariants=[], usedColors=new Set(), usedSources=new Set();
      for (const [i, group] of groups.entries()) {
        const color=dtfLabel(group.color),key=keyForColor(color),input=colors.querySelector(`#dtf-color-${i}`);
        if(!color) fail('stock','Isi nama setiap warna kaos',input);
        if(usedColors.has(key)) fail('stock',`Warna ${color} sudah ada`,input);
        if(!group.selected.size) fail('stock',`Pilih ukuran untuk ${color}`,colors.querySelector(`[data-dtf-color-row="${i}"] [data-dtf-size]`));
        usedColors.add(key);
        for (const size of [...DTF_SIZES,...group.legacy].filter(size=>group.selected.has(size))) {
          const materialId=group.sources.get(size);
          const target=sources.querySelector(`select[data-group="${i}"][data-size="${CSS.escape(size)}"]`)?.nextElementSibling;
          if(!allowed.has(materialId)) fail('stock',`Pilih bahan stok aktif untuk ${color} ${size}`,target);
          if(usedSources.has(materialId)) fail('stock','Pilih bahan stok berbeda untuk setiap varian kaos',target);
          usedSources.add(materialId);
          stockVariants.push({color,size,materialId});
        }
      }
      if(stockVariants.length>MAX_DTF_VARIANTS) fail('stock',`Maksimal ${MAX_DTF_VARIANTS} kombinasi warna dan ukuran`,$('[data-dtf-add-color]'));
      for (const input of feeBox.querySelectorAll('[data-dtf-fee]')) fees.set(input.dataset.dtfFee,readMoney(input));
      const shirtCosts=DTF_SIZES.map(size=>({size,amount:readMoney(form.elements['shirt-cost-'+size], {optional:true})})).filter(row=>row.amount!==null);
      return { packages, shirtCosts, wholesaleTiers:wholesaleTiers.map(({min,max,prices})=>({min,max,prices})), stockVariants,
        sizeSurcharges:allSizes().map(size=>({size,amount:fees.get(size) ?? dtfSizeSurcharge(product,size)})) };
    };
  }};
}
