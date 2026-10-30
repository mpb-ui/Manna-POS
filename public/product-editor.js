import { normalizeSaleUnit, normalizeSaleUnitOptions, saleUnitBasis, productSaleUnit, defaultWholesaleBasis } from './sale-units.js';
import { DEFAULT_VARIANT_TYPES, DEFAULT_OPTION_TYPES, variantCardName, copyTierRanges, mergeMaterialSources, promoDate } from './product-variants.js';
import { enhanceMaterialSelects } from './material-picker.js';

export function openProductEditor(ctx, product = null) {
  const {state,dialog,api,e,toast,showDialog,finishingOptionsHtml,materialRowHtml,readMaterialRows,variantSourcesHtml,deleteButtonHtml,bindDeleteRecord} = ctx;
  const id = prefix => prefix + '-' + crypto.randomUUID();
  const categories = ctx.categories(), unit = product ? productSaleUnit(product) : '';
  const units = normalizeSaleUnitOptions([...(state.catalogOptions.saleUnits || []), ...(unit ? [unit] : [])]);
  const types = state.catalogOptions.variantTypes || DEFAULT_VARIANT_TYPES;
  const optionTypes = state.catalogOptions.variantOptionTypes || DEFAULT_OPTION_TYPES;
  const originalVariants = product?.hasMaterialVariants ? product.materialVariants || [] : [];
  const variants = originalVariants.length ? structuredClone(originalVariants) : [{id:id('v'),label:''},{id:id('v'),label:''}];
  const options = product?.subVariants?.length ? structuredClone(product.subVariants) : [{id:id('o'),label:''},{id:id('o'),label:''}];
  const cards = new Map();
  const empty = () => ({baseCost:0,price:'',priceTiers:[],materialSources:[],active:true});
  cards.set('single', {...empty(), baseCost:product?.baseCost ?? '', price:product?.price ?? '', priceTiers:product?.wholesaleEnabled ? structuredClone(product.priceTiers || []) : [], materialSources:structuredClone(product?.materialSources || [])});
  for (const v of originalVariants) {
    const sources = product.productEditorVersion === 1 ? v.materialSources || [] : mergeMaterialSources(product.materialSources || [], v.materialSources || []);
    const tiers = v.priceTiers?.length ? v.priceTiers : v.price != null ? [] : product.wholesaleEnabled ? product.priceTiers || [] : [];
    cards.set(v.id, {...empty(),...structuredClone(v),price:v.price ?? product.price,baseCost:v.baseCost ?? product.baseCost ?? 0,priceTiers:structuredClone(tiers),materialSources:structuredClone(sources)});
    for (const o of product.subVariants || []) {
      const c = v.combinations?.find(c => c.subVariantId === o.id) || {};
      cards.set(v.id+'|'+o.id,{...empty(),...structuredClone(c),price:c.price ?? v.price ?? product.price,baseCost:c.baseCost ?? v.baseCost ?? product.baseCost ?? 0,
        priceTiers:structuredClone(c.priceTiers?.length ? c.priceTiers : c.price != null ? [] : tiers),
        materialSources:structuredClone(product.productEditorVersion === 1 ? c.materialSources || [] : sources)});
    }
  }
  const discount = product?.discount || {};
  const attrs = (name,value,extra='') => `name="${name}" id="pe-${name}" value="${e(value ?? '')}" ${extra}`;
  const input = (name,value,extra='') => `<input ${attrs(name,value,extra)}>`;
  const select = (name,values,selected,placeholder='') => `<select name="${name}" id="pe-${name}">${placeholder ? `<option value="">${e(placeholder)}</option>` : ''}${values.map(v=>`<option value="${e(typeof v==='string'?v:v.value)}" ${(typeof v==='string'?v:v.value)===selected?'selected':''}>${e(typeof v==='string'?v:v.label)}</option>`).join('')}</select>`;
  const field = (label,control,name='',extra='') => `<div class="pe-field" ${extra}><label ${name?`for="pe-${name}"`:''}>${label}</label><div class="pe-control">${control}</div></div>`;
  const toggle = (name,checked,label,extra='') => `<label class="pe-switch"><input type="checkbox" role="switch" name="${name}" ${checked?'checked':''} ${extra}><span aria-hidden="true"></span><b>${label}</b></label>`;
  const reference = (label,name,values,selected,kind,placeholder) => field(label,`<div class="pe-reference">${select(name,values,selected,placeholder)}<button type="button" class="pe-add-reference" data-reference-kind="${kind}" aria-label="Tambah ${label}"><img src="/product-editor-assets/add.svg" alt=""></button></div><div class="pe-reference-editor" data-reference-editor="${kind}" hidden><input data-reference-label maxlength="${kind==='saleUnits'?40:80}" placeholder="Nama pilihan"><button type="button" class="primary" data-save-reference>Simpan</button><button type="button" class="secondary" data-cancel-reference aria-label="Batal menambah pilihan">×</button></div>`,name);
  const setting = (label,name,checked,content='') => `<section class="pe-setting"><div class="pe-setting-head"><strong>${label}</strong>${toggle(name,checked,label)}</div>${content}</section>`;
  const profiles = state.catalogOptions.sheetCalculatorProfiles || [];
  const profileChoices = profiles.filter(p=>['a3-plus','a3'].includes(p.id) || p.id===product?.sheetProfileId);
  const machineOptions = state.machines.filter(m=>m.active!==false || product?.machineIds?.includes(m.id)).map(m=>({value:m.id,label:m.name}));
  let basis = product?.wholesaleBasis || defaultWholesaleBasis(saleUnitBasis(unit));
  let previousSaleBasis = saleUnitBasis(unit);
  const detail = showDialog(product?'Edit Produk':'Tambah Produk', `<form id="product-form" class="product-form pe-form" novalidate>
    <nav class="pe-tabs" role="tablist" aria-label="Pengaturan produk"><button type="button" id="pe-info-tab" role="tab" aria-selected="true" aria-controls="pe-info-panel" data-editor-tab="info">Informasi Produk</button><button type="button" id="pe-production-tab" role="tab" aria-selected="false" aria-controls="pe-production-panel" tabindex="-1" data-editor-tab="production">Kebutuhan Produksi</button></nav>
    <div class="pe-scroll"><section id="pe-info-panel" role="tabpanel" aria-labelledby="pe-info-tab">
      <div class="pe-fields">
      ${field('SKU Produk',input('sku',product?.sku,'required maxlength="80"'),'sku')}
      ${field('Nama Produk',input('name',product?.name,'required maxlength="150"'),'name')}
      ${reference('Kategori','category',categories,product?.category || '', 'categories','Pilih kategori')}
      ${reference('Satuan Jual','saleUnit',units,unit,'saleUnits','Pilih satuan jual')}
      ${field('Pilihan Lebar Bahan',input('widths',(product?.widths || []).join(', '),'placeholder="1, 1.27, 1.52"'),'widths','data-width-field')}
      ${field('Mesin yang Digunakan',select('machineId',machineOptions,product?.machineIds?.[0] || '','Pilih mesin'),'machineId')}
      ${field('Jenis ATK',select('retailAtK',[{value:'false',label:'Jasa produksi'},{value:'true',label:'Barang dagangan'}],String(Boolean(product?.retailAtK))),'retailAtK','data-atk-field')}
      ${field('Tab ATK',select('atkGroup',ctx.atkGroups,product?.atkGroup || ctx.atkGroups[0]),'atkGroup','data-atk-field')}
      ${field('Barcode (opsional)',input('barcode',product?.barcode,'maxlength="128"'),'barcode','data-atk-field')}
      <textarea name="note" aria-label="Informasi produk (opsional)" placeholder="Informasi produk (opsional)" rows="1" maxlength="2000">${e(product?.note || '')}</textarea>
      </div><div class="pe-info-settings">
      ${setting('Minimum Pembelian','minimumEnabled',product?.minimumEnabled,`<div data-minimum-fields ${product?.minimumEnabled?'':'hidden'}><div class="pe-minimum-stepper"><button type="button" data-minimum-step="-1" aria-label="Kurangi minimum pembelian"><img src="/product-editor-assets/minus.svg" alt=""></button>${input('minimumQuantity',product?.minimumQuantity || 1,'type="number" min="1" step="1" aria-label="Jumlah minimum pembelian"')}<button type="button" data-minimum-step="1" aria-label="Tambah minimum pembelian"><img src="/product-editor-assets/plus.svg" alt=""></button></div></div>`)}
      ${setting('Kalkulator Jumlah Lembar','sheetCalculatorEnabled',product?.sheetCalculatorEnabled,`<div class="pe-profile-options" data-profile-options ${product?.sheetCalculatorEnabled?'':'hidden'}>${profileChoices.map(p=>`<label class="pe-radio"><input type="radio" name="sheetProfileId" value="${e(p.id)}" ${(product?.sheetProfileId || 'a3-plus')===p.id?'checked':''}><span>${e(p.id==='a3-plus'?'A3+':p.id==='a3'?'A3':p.name || p.label || p.id)}</span></label>`).join('')}</div>`)}
      ${setting('Tampilkan di Home','featured',product?.featured)}
      ${setting('Produk Aktif','active',product?.active !== false)}
      </div>
    </section><section id="pe-production-panel" role="tabpanel" aria-labelledby="pe-production-tab" hidden>
      <div class="pe-product-mode"><label class="pe-radio"><input type="radio" name="productMode" value="single" ${!product?.hasMaterialVariants?'checked':''}><span>Produk Satuan</span></label><label class="pe-radio"><input type="radio" name="productMode" value="variants" ${product?.hasMaterialVariants?'checked':''}><span>Produk dengan Varian</span></label></div>
      <section class="pe-variant-definition" data-variant-definition ${product?.hasMaterialVariants?'':'hidden'}>
        <h3 class="pe-step-title"><i>1</i> TIPE & VARIAN</h3><div class="pe-definition-box">${reference('Tipe','variantType',[...new Set([...types,product?.variantType || 'Varian Bahan'])],product?.variantType || (product?.hasMaterialVariants?'Varian Bahan':''),'variantTypes','Pilih tipe varian')}<div data-variant-list></div><button type="button" class="text-button pe-add-line" data-add-variant>+ Tambah Varian</button></div>
        <div class="pe-options-toggle">${toggle('hasOptions',Boolean(product?.subVariants?.length),'Varian memiliki opsi')}</div><div class="pe-definition-box" data-option-definition ${product?.subVariants?.length?'':'hidden'}>${reference('Tipe','optionType',[...new Set([...optionTypes,product?.subVariantLabel || 'Sisi Cetak'])],product?.subVariantLabel || (product?.subVariants?.length?'Sisi Cetak':''),'variantOptionTypes','Pilih tipe opsi')}<div data-option-list></div><button type="button" class="text-button pe-add-line" data-add-option>+ Opsi Varian</button></div>
        <h3 class="pe-step-title pe-price-title"><i>2</i> HARGA DAN SUMBER BAHAN</h3>
      </section>
      ${field('Dasar Harga Grosir',select('wholesaleBasis',[{value:'quantity',label:'Jumlah pcs / lembar'},{value:'area',label:'Luas tagihan (m²)'},{value:'length',label:'Panjang tagihan (m)'}],basis),'wholesaleBasis','data-wholesale-basis-field')}
      <div data-price-cards></div>
      <div class="pe-legacy-sources">${variantSourcesHtml(product)}</div>
      <section class="pe-finishing" aria-label="Pilihan finishing"><div id="finishing-options" class="finishing-type-groups">${finishingOptionsHtml(product?.category || '',product?.finishingIds || [],product)}</div></section>
      <section class="pe-promo">${toggle('discountEnabled',Boolean(discount.enabled),'Promo Produk')}<div class="pe-promo-fields" data-promo-fields ${discount.enabled?'':'hidden'}>
      ${field('Jenis Diskon',select('discountType',[{value:'percent',label:'Persentase (%)'},{value:'nominal',label:'Nominal (Rp)'}],discount.type || 'percent'),'discountType')}
      ${field('Nilai Diskon',`<span class="money-input"><b data-discount-prefix>${discount.type==='nominal'?'Rp':'%'}</b>${input('discountValue',discount.type==='nominal' && discount.value ? Number(discount.value).toLocaleString('id-ID') : discount.value || '',`type="${discount.type==='nominal'?'text':'number'}" min="0" step="any" inputmode="decimal"`)}</span>`,'discountValue')}
      ${field('Periode Promo',`<div class="pe-date-range">${input('startDate',promoDate(discount.startsAt),'type="date" aria-label="Tanggal mulai promo"')}<span>−</span>${input('endDate',promoDate(discount.endsAt),'type="date" aria-label="Tanggal akhir promo"')}</div>`)}
      </div></section>
    </section><p class="pe-error" role="alert" hidden></p></div>
    <footer class="pe-footer">${deleteButtonHtml(product,'Produk')}<div class="pe-footer-actions"><button type="button" class="secondary" data-cancel-editor>Batal</button><button type="submit" class="primary">Simpan Produk</button></div></footer>
  </form>`);
  dialog.classList.add('product-editor-dialog');
  const priorClose = dialog.onclose;
  const preventSavingClose = event => { if(detail.querySelector('#product-form')?.dataset.saving)event.preventDefault(); };
  dialog.addEventListener('cancel',preventSavingClose);
  dialog.onclose = () => { dialog.removeEventListener('cancel',preventSavingClose);dialog.classList.remove('product-editor-dialog'); priorClose?.(); };
  detail.querySelector('.detail-close').innerHTML='<img src="/product-editor-assets/close.svg" alt="">';
  detail.querySelector('.detail-close').setAttribute('aria-label','Tutup pengaturan produk');
  const form=detail.querySelector('#product-form'), scroll=form.querySelector('.pe-scroll'), list=form.querySelector('[data-price-cards]');
  const el=name=>form.elements.namedItem(name);
  const isVariants=()=>el('productMode').value==='variants';
  const hasOptions=()=>isVariants() && el('hasOptions').checked;
  const measured=()=>el('wholesaleBasis').value!=='quantity';
  const number=value=>String(value ?? '').trim()===''?'':ctx.parseMoney(value);
  function bindMoney(scope) {
    scope.querySelectorAll('.money-input input:not([data-pe-money])').forEach(input=>{
      if(input.name==='discountValue')return;
      input.dataset.peMoney='true';
      input.oninput=()=>{const atEnd=input.selectionStart===input.value.length;input.value=input.value.trim()===''?'':ctx.parseMoney(input.value).toLocaleString('id-ID');if(atEnd)input.setSelectionRange(input.value.length,input.value.length);};
      input.onfocus=()=>input.select();
    });
  }
  function money(value,attr,label) { return `<span class="money-input"><b>Rp</b><input type="text" inputmode="numeric" ${attr} value="${value==='' || value==null?'':e(Number(value).toLocaleString('id-ID'))}" aria-label="${e(label)}"></span>`; }
  function tierHtml(tier={}) { return `<div class="pe-tier ${measured()?'pe-tier-measured':''}" data-tier><input type="number" data-tier-min min="${measured()?'0.0001':'1'}" step="${measured()?'any':'1'}" value="${e(tier.min ?? 1)}" aria-label="Minimum grosir"><span class="pe-tier-dash">−</span><input type="number" data-tier-max min="1" step="1" value="${e(tier.max ?? '')}" placeholder="Maks" aria-label="Maksimum grosir" ${measured()?'disabled':''}>${money(tier.price,'data-tier-price','Harga grosir')}<button type="button" class="pe-remove" data-remove-tier aria-label="Hapus tingkat grosir"><img src="/product-editor-assets/remove.svg" alt=""></button></div>`; }
  function cardState(key) { if(!cards.has(key)) cards.set(key,empty()); return cards.get(key); }
  function cardSpecs() { return !isVariants()?[{key:'single',title:''}]:variants.flatMap((v,i)=>hasOptions()?options.map((o,j)=>({key:v.id+'|'+o.id,title:variantCardName(v,o,i,j)})):[{key:v.id,title:variantCardName(v,null,i)}]); }
  function readTiers(card) { return [...card.querySelectorAll('[data-tier]')].map(row=>({min:row.querySelector('[data-tier-min]').value,max:measured()?null:row.querySelector('[data-tier-max]').value,price:number(row.querySelector('[data-tier-price]').value)})); }
  function capture() { list.querySelectorAll('[data-price-card]').forEach(card=>cards.set(card.dataset.priceCard,{...cardState(card.dataset.priceCard),baseCost:number(card.querySelector('[data-card-cost]').value),price:number(card.querySelector('[data-card-price]').value),priceTiers:readTiers(card),materialSources:readMaterialRows(card),active:card.querySelector('[data-card-active]')?.checked ?? true})); }
  function cardHtml(spec,index) {
    const c=cardState(spec.key), sourceRows=c.materialSources.length?c.materialSources:[{}];
    return `<section class="pe-price-card ${spec.key==='single'?'pe-single-card':''}" data-price-card="${e(spec.key)}">${spec.title?`<header class="pe-card-heading"><strong data-card-title>${e(spec.title)}</strong>${toggle('available-'+spec.key,c.active!==false,'Produk Tersedia','data-card-active')}</header>`:''}<div class="pe-card-prices">
      ${field('Harga Dasar / HPP',money(c.baseCost,'data-card-cost','Harga Dasar / HPP'))}${field('Harga Jual',money(c.price,'data-card-price','Harga Jual'))}
      <div class="pe-tier-list">${c.priceTiers.map(tierHtml).join('')}</div><div class="pe-tier-actions">${index?'<button type="button" class="text-button" data-copy-tiers>Pakai jumlah grosir yang sama</button>':''}<button type="button" class="text-button" data-add-tier>+ Harga Grosir</button></div>
      </div><div class="pe-card-sources">${field('Sumber Bahan',`<div data-material-list>${sourceRows.map(materialRowHtml).join('')}</div><button type="button" class="text-button pe-add-line" data-add-material>+ Tambah Bahan</button>`)}</div></section>`;
  }
  function syncCopies() { const count=list.firstElementChild?.querySelectorAll('[data-tier]').length || 0; list.querySelectorAll('[data-copy-tiers]').forEach(b=>b.hidden=!count); }
  function renderCards() { capture();list.innerHTML=cardSpecs().map(cardHtml).join('');bindMoney(list);enhanceMaterialSelects(list,state.materials);syncCopies(); }
  function updateTitles() { for(const spec of cardSpecs()){const card=[...list.children].find(c=>c.dataset.priceCard===spec.key);if(card?.querySelector('[data-card-title]'))card.querySelector('[data-card-title]').textContent=spec.title;} }
  function nameRows(items,kind) { return items.map((v,i)=>field(`${kind==='variant'?'Varian':'Opsi'} ${i+1}`,`<div class="pe-name-row"><input data-${kind}-name="${e(v.id)}" value="${e(v.label || '')}" maxlength="100" aria-label="${kind==='variant'?'Varian':'Opsi'} ${i+1}"><button type="button" class="pe-remove" data-remove-${kind}="${e(v.id)}" aria-label="Hapus ${kind==='variant'?'varian':'opsi'} ${i+1}" ${items.length<=1?'disabled':''}><img src="/product-editor-assets/remove.svg" alt=""></button></div>`)).join(''); }
  function renderNames() { form.querySelector('[data-variant-list]').innerHTML=nameRows(variants,'variant');form.querySelector('[data-option-list]').innerHTML=nameRows(options,'option'); }
  function showTab(tab) {
    for(const button of form.querySelectorAll('[data-editor-tab]')) { const active=button.dataset.editorTab===tab;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;form.querySelector('#pe-'+button.dataset.editorTab+'-panel').hidden=!active; }
    scroll.scrollTop=0;
  }
  function syncBasics() {
    const mode=saleUnitBasis(el('saleUnit').value), category=ctx.categoryId(el('category').value), allowed=category==='print-a3' && mode==='unit' && /^(lbr|lembar)$/i.test(el('saleUnit').value);
    form.querySelector('[data-width-field]').hidden=mode==='unit';el('widths').disabled=mode==='unit';
    form.querySelectorAll('[data-atk-field]').forEach(f=>f.hidden=category!=='atk');
    const sheet=el('sheetCalculatorEnabled');sheet.disabled=!allowed;sheet.title=allowed?'':'Tersedia untuk produk Print A3+ dengan satuan lbr';if(!allowed)sheet.checked=false;
    form.querySelector('[data-profile-options]').hidden=!sheet.checked;
    form.querySelector('[data-wholesale-basis-field]').hidden=mode==='unit';
    for(const option of el('wholesaleBasis').options)option.disabled=option.value==='area'&&mode!=='sqm'||option.value==='length'&&mode!=='linear_m';
    if(mode==='unit')el('wholesaleBasis').value='quantity';
    form.querySelector('[data-minimum-fields]').hidden=!el('minimumEnabled').checked;
    form.querySelector('[data-promo-fields]').hidden=!el('discountEnabled').checked;
    const nominal=el('discountType').value==='nominal',discountInput=el('discountValue');
    const prior=discountInput.type;
    if(nominal && prior!=='text'){const n=Number(discountInput.value);discountInput.type='text';discountInput.value=n && Number.isSafeInteger(n)?n.toLocaleString('id-ID'):'';}
    if(!nominal && prior!=='number'){const n=ctx.parseMoney(discountInput.value);discountInput.type='number';discountInput.value=n || '';}
    form.querySelector('[data-discount-prefix]').textContent=nominal?'Rp':'%';
    form.querySelector('[data-variant-definition]').hidden=!isVariants();
    form.querySelector('[data-option-definition]').hidden=!hasOptions();
  }
  form.addEventListener('input',event=>{
    if(event.target.name==='discountValue' && el('discountType').value==='nominal')event.target.value=event.target.value.trim()===''?'':ctx.parseMoney(event.target.value).toLocaleString('id-ID');
    const v=event.target.dataset.variantName,o=event.target.dataset.optionName;
    if(v)variants.find(item=>item.id===v).label=event.target.value;
    if(o)options.find(item=>item.id===o).label=event.target.value;
    if(v||o)updateTitles();
  });
  form.addEventListener('change',event=>{
    const name=event.target.name;
    if(name==='saleUnit') { capture();const newMode=saleUnitBasis(el('saleUnit').value);if(newMode!==previousSaleBasis)el('wholesaleBasis').value=defaultWholesaleBasis(newMode);previousSaleBasis=newMode;syncBasics();renderCards(); }
    else if(name==='wholesaleBasis') { capture();basis=el('wholesaleBasis').value;renderCards(); }
    else if(name==='productMode'||name==='hasOptions') { syncBasics();renderCards(); }
    else if(name==='category') { const selected=[...form.querySelectorAll('[name=finishingId]:checked')].map(i=>i.value);form.querySelector('#finishing-options').innerHTML=finishingOptionsHtml(el('category').value,selected,product);syncBasics(); }
    else if(['minimumEnabled','sheetCalculatorEnabled','discountEnabled','discountType'].includes(name)) syncBasics();
  });
  form.addEventListener('click',async event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.editorTab)showTab(b.dataset.editorTab);
    if(b.hasAttribute('data-cancel-editor'))dialog.close();
    if(b.hasAttribute('data-minimum-step'))el('minimumQuantity').value=Math.max(1,(Number(el('minimumQuantity').value)||1)+Number(b.dataset.minimumStep));
    const card=b.closest('[data-price-card]');
    if(b.hasAttribute('data-add-tier')) {const rows=card.querySelector('.pe-tier-list');if(rows.children.length>=10)return toast('Maksimal 10 tingkat harga','error');const last=rows.lastElementChild;rows.insertAdjacentHTML('beforeend',tierHtml({min:last?Number(last.querySelector('[data-tier-max]').value || last.querySelector('[data-tier-min]').value)+1:1}));bindMoney(rows.lastElementChild);syncCopies();}
    if(b.hasAttribute('data-remove-tier')){b.closest('[data-tier]').remove();syncCopies();}
    if(b.hasAttribute('data-copy-tiers')) {
      const tiers=readTiers(list.firstElementChild);
      if(tiers.some(t=>!Number(t.min) || t.max!==null && t.max!=='' && Number(t.max)<Number(t.min)))return toast('Lengkapi rentang grosir kartu pertama','error');
      if(card.querySelector('[data-tier]') && !window.confirm('Ganti rentang grosir kartu ini mengikuti kartu pertama? Harga grosir perlu diisi kembali.'))return;
      card.querySelector('.pe-tier-list').innerHTML=copyTierRanges(tiers).map(tierHtml).join('');bindMoney(card);card.querySelector('[data-tier-price]')?.focus();
    }
    if(b.hasAttribute('data-add-material')) {const rows=card.querySelector('[data-material-list]');rows.insertAdjacentHTML('beforeend',materialRowHtml());enhanceMaterialSelects(rows,state.materials);}
    if(b.hasAttribute('data-remove-builder')) {
      const row=b.closest('[data-material-row]'),parent=row.parentElement;
      if(parent.querySelectorAll('[data-material-row]').length<=1){const select=row.querySelector('[data-material-id]');select.value='';select.dispatchEvent(new Event('change'));row.querySelector('[data-material-qty]').value=1;row.querySelector('[data-material-waste]').value=0;}else row.remove();
    }
    if(b.hasAttribute('data-add-variant-material')){const rows=b.closest('[data-variant-id]').querySelector('[data-variant-material-rows]');rows.insertAdjacentHTML('beforeend',materialRowHtml());enhanceMaterialSelects(rows,state.materials);}
    for(const kind of ['variant','option']) {
      const items=kind==='variant'?variants:options;
      if(b.hasAttribute('data-add-'+kind)){if(items.length>=(kind==='variant'?40:10))return toast('Batas jumlah pilihan tercapai','error');capture();items.push({id:id(kind==='variant'?'v':'o'),label:''});renderNames();renderCards();form.querySelector(`[data-${kind}-name="${items.at(-1).id}"]`).focus();}
      if(b.hasAttribute('data-remove-'+kind)){if(items.length<=1)return;const key=b.dataset[kind==='variant'?'removeVariant':'removeOption'];const affected=[...cards].filter(([k])=>kind==='variant'?k===key||k.startsWith(key+'|'):k.endsWith('|'+key));if(affected.some(([,c])=>c.price!=='' || c.materialSources.length || c.priceTiers.length) && !window.confirm('Hapus pilihan beserta pengaturan harga dan bahan yang terkait?'))return;capture();items.splice(items.findIndex(v=>v.id===key),1);renderNames();renderCards();}
    }
    if(b.dataset.referenceKind){const editor=b.closest('.pe-control').querySelector('[data-reference-editor]');editor.hidden=false;editor.querySelector('input').focus();}
    if(b.hasAttribute('data-cancel-reference'))b.closest('[data-reference-editor]').hidden=true;
    if(b.hasAttribute('data-save-reference')) {
      const editor=b.closest('[data-reference-editor]'),kind=editor.dataset.referenceEditor,label=editor.querySelector('input').value.trim();if(!label)return toast('Nama pilihan wajib diisi','error');b.disabled=true;
      try {const result=await api('/api/catalog-options/'+kind,{method:'POST',body:JSON.stringify({label})});state.catalogOptions=result.options;const select=editor.closest('.pe-control').querySelector('select');select.add(new Option(result.option,result.option,true,true));select.dispatchEvent(new Event('change',{bubbles:true}));editor.hidden=true;editor.querySelector('input').value='';toast('Pilihan baru ditambahkan');}catch(error){toast(error.message,'error');}finally{b.disabled=false;}
    }
  });
  form.querySelector('.pe-tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tab=event.key==='Home'?'info':event.key==='End'?'production':event.target.dataset.editorTab==='info'?'production':'info';showTab(tab);form.querySelector(`[data-editor-tab="${tab}"]`).focus();});
  function fail(message,node,tab='production') { showTab(tab);const error=form.querySelector('.pe-error');error.textContent=message;error.hidden=false;if(node){node.focus();node.scrollIntoView({block:'center'});}throw new Error(message); }
  form.onsubmit=async event=>{
    event.preventDefault();if(form.dataset.saving)return;capture();form.querySelector('.pe-error').hidden=true;
    try {
      for(const name of ['sku','name','category','saleUnit'])if(!el(name).value.trim())fail('Lengkapi '+({sku:'SKU produk',name:'nama produk',category:'kategori',saleUnit:'Satuan Jual'}[name]),el(name),'info');
      if(el('minimumEnabled').checked && (!Number.isSafeInteger(Number(el('minimumQuantity').value)) || Number(el('minimumQuantity').value)<1))fail('Minimum pembelian harus bilangan bulat minimal 1',el('minimumQuantity'),'info');
      if(isVariants()) {
        if(!el('variantType').value)fail('Pilih tipe varian',el('variantType'));
        if(hasOptions()&&!el('optionType').value)fail('Pilih tipe opsi',el('optionType'));
        for(const [items,kind] of [[variants,'variant'],...(hasOptions()?[[options,'option']]:[])]){const names=new Set();for(const v of items){const name=v.label.trim();if(!name || names.has(name.toLocaleLowerCase('id-ID')))fail('Nama pilihan wajib diisi dan tidak boleh duplikat',form.querySelector(`[data-${kind}-name="${v.id}"]`));names.add(name.toLocaleLowerCase('id-ID'));}}
      }
      for(const spec of cardSpecs()) {
        const c=cards.get(spec.key),node=[...list.children].find(n=>n.dataset.priceCard===spec.key);
        if(c.active!==false && (!Number.isSafeInteger(Number(c.price)) || Number(c.price)<=0))fail('Isi harga jual '+(spec.title || 'produk'),node.querySelector('[data-card-price]'));
        if(c.priceTiers.some(t=>t.price==='' || Number(t.price)<=0))fail('Lengkapi harga grosir '+(spec.title || 'produk'),node.querySelector('[data-tier-price]'));
      }
      const specs=cardSpecs(),first=cards.get(specs.find(s=>cards.get(s.key).active!==false && Number(cards.get(s.key).price)>0)?.key || specs.find(s=>Number(cards.get(s.key).price)>0)?.key || specs[0].key),variantMode=isVariants();
      const normalizedCard=c=>({...c,baseCost:Number(c.baseCost || 0),price:c.price===''?null:Number(c.price),priceTiers:c.priceTiers.map(t=>({...t,price:Number(t.price)}))});
      const materialVariants=variantMode?variants.map(v=>{const c=normalizedCard(cardState(v.id));const combinations=hasOptions()?options.map(o=>({subVariantId:o.id,...normalizedCard(cardState(v.id+'|'+o.id))})):[];return {id:v.id,label:v.label.trim(),...c,price:c.price || combinations[0]?.price || Number(first.price),sheetProfileId:v.sheetProfileId || '',combinations};}):[];
      const payload={productEditorVersion:1,sku:el('sku').value.trim(),name:el('name').value.trim(),category:el('category').value,saleUnit:normalizeSaleUnit(el('saleUnit').value),widths:el('widths').disabled?[]:el('widths').value.split(',').map(v=>v.trim()).filter(Boolean),machineIds:el('machineId').value?[el('machineId').value]:[],note:el('note').value,
        active:el('active').checked,featured:el('featured').checked,minimumEnabled:el('minimumEnabled').checked,minimumQuantity:Number(el('minimumQuantity').value),sheetCalculatorEnabled:el('sheetCalculatorEnabled').checked,sheetProfileId:el('sheetProfileId')?.value || '',retailAtK:el('retailAtK').value==='true',atkGroup:el('atkGroup').value,barcode:el('barcode').value,
        price:Number(first.price),baseCost:Number(first.baseCost || 0),materialSources:variantMode?[]:first.materialSources,wholesaleEnabled:!variantMode && first.priceTiers.length>0,wholesaleBasis:el('wholesaleBasis').value,priceTiers:variantMode?[]:normalizedCard(first).priceTiers,
        hasMaterialVariants:variantMode,variantType:el('variantType').value,optionType:hasOptions()?el('optionType').value:'',subVariantLabel:hasOptions()?el('optionType').value:'',materialVariants,subVariants:hasOptions()?options.map(o=>({id:o.id,label:o.label.trim()})):[],finishingIds:[...form.querySelectorAll('[name=finishingId]:checked')].map(i=>i.value),
        discount:{enabled:el('discountEnabled').checked,type:el('discountType').value,value:el('discountType').value==='nominal'?ctx.parseMoney(el('discountValue').value):Number(el('discountValue').value),startDate:el('startDate').value,endDate:el('endDate').value}};
      if(payload.discount.enabled && (!payload.discount.startDate || !payload.discount.endDate))fail('Lengkapi tanggal mulai dan akhir promo',el('startDate'));
      if(product?.fixedSizeVariants?.length)payload.fixedSizeVariants=[...form.querySelectorAll('[data-variant-kind="fixed"]')].map(group=>({id:group.dataset.variantId,materialSources:readMaterialRows(group)}));
      if(product?.sizeVariants?.length)payload.sizeVariants=[...form.querySelectorAll('[data-variant-kind="template"]')].map(group=>({id:group.dataset.variantId,materialSources:readMaterialRows(group)}));
      if(product?.choiceGroups?.length)payload.choiceGroups=[...form.querySelectorAll('[data-choice-group]')].map(group=>({id:group.dataset.choiceGroup,options:[...group.querySelectorAll('[data-choice-option]')].map(o=>({id:o.dataset.choiceOption,materialId:o.querySelector('[data-choice-material]').value,quantity:o.querySelector('[data-choice-quantity]').value}))}));
      form.dataset.saving='true';form.querySelector('[type=submit]').disabled=true;form.querySelector('[data-cancel-editor]').disabled=true;detail.querySelector('.detail-close').disabled=true;
      await api(product?'/api/products/'+product.id:'/api/products',{method:product?'PUT':'POST',body:JSON.stringify(payload)});
      state.view='master';state.masterTab='products';
      try {await ctx.load();}catch(error){dialog.close();toast('Produk tersimpan, tetapi daftar gagal diperbarui. Muat ulang halaman.','error');return;}
      dialog.close();toast('Produk berhasil disimpan');
    }catch(error){form.querySelector('.pe-error').textContent=error.message;form.querySelector('.pe-error').hidden=false;toast(error.message,'error');}finally{delete form.dataset.saving;form.querySelector('[type=submit]').disabled=false;form.querySelector('[data-cancel-editor]').disabled=false;detail.querySelector('.detail-close')?.removeAttribute('disabled');}
  };
  bindDeleteRecord(detail,product,'products','Produk','products');
  renderNames();syncBasics();renderCards();bindMoney(form);enhanceMaterialSelects(detail,state.materials);
  return detail;
}
