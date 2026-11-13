import { enhanceMaterialSelects } from './material-picker.js';
import { DTF_LABEL_LENGTH, MAX_DTF_VARIANTS, dtfLabel, dtfSize, dtfSizeSurcharge, dtfVariantKey, usableDtfMaterial } from './dtf-variants.js';

export function dtfVariantEditor(product,materials,e) {
  const variants=product.dtfStockVariants || [];
  const rowHtml=(row={})=>`<div class="dtf-variant-card" data-dtf-variant>
    <div class="dtf-variant-fields"><label class="field"><span>Warna *</span><input data-dtf-color maxlength="${DTF_LABEL_LENGTH}" value="${e(row.color || '')}" placeholder="Navy" required></label>
    <label class="field"><span>Ukuran *</span><input data-dtf-size maxlength="${DTF_LABEL_LENGTH}" value="${e(row.size || '')}" placeholder="M" required></label></div>
    <label class="field"><span>Bahan stok *</span><select data-shirt-stock-material><option value="">Pilih bahan stok</option>${materials.filter(item=>usableDtfMaterial(item) || item.id===row.materialId).map(item=>`<option value="${e(item.id)}" ${item.id===row.materialId?'selected':''} ${usableDtfMaterial(item)?'':'disabled'}>${e(item.name)} · ${e(item.sku)}${usableDtfMaterial(item)?'':' (tidak tersedia)'}</option>`).join('')}</select></label>
    <button type="button" class="text-button" data-dtf-remove>Hapus varian</button></div>`;
  return {
    html:`<section class="builder-card"><div class="builder-head"><div><strong>Bahan stok per warna dan ukuran</strong><p>Satu baris untuk tiap kombinasi. Tambahkan bahan aktif kategori Kaos Polos DTF dengan stok Per Satuan (pcs) di Master Data → Bahan.</p></div></div><div class="form-grid" data-dtf-variants>${variants.map(rowHtml).join('')}</div><button type="button" class="secondary" data-dtf-add>+ Tambah Varian Kaos</button></section>
      <section class="builder-card"><div class="builder-head"><div><strong>Tambahan harga per ukuran</strong><p>Berlaku per kaos untuk semua warna. Isi 0 jika harga paket tidak berubah.</p></div></div><div class="form-grid" data-dtf-surcharges></div></section>`,
    bind(form,{moneyField,bindMoneyInputs,parseMoney}){
      const rows=form.querySelector('[data-dtf-variants]'),fees=form.querySelector('[data-dtf-surcharges]'),add=form.querySelector('[data-dtf-add]');
      const draft=new Map(),allowed=new Set(materials.filter(usableDtfMaterial).map(row=>row.id));
      const readRows=()=>[...rows.querySelectorAll('[data-dtf-variant]')].map(row=>({
        color:dtfLabel(row.querySelector('[data-dtf-color]').value),size:dtfSize(row.querySelector('[data-dtf-size]').value),
        materialId:row.querySelector('[data-shirt-stock-material]').value
      }));
      let currentSizes=[];
      function sync(){
        for (const input of fees.querySelectorAll('[data-dtf-fee]')) draft.set(input.dataset.dtfFee,parseMoney(input.value));
        const sizes=[...new Set(readRows().map(row=>row.size).filter(Boolean))];
        if (JSON.stringify(currentSizes)!==JSON.stringify(sizes)){
          currentSizes=sizes;
          fees.innerHTML=sizes.map((size,index)=>`<label class="field"><span>${e(size)}</span>${moneyField('dtf-fee-'+index,draft.get(size) ?? dtfSizeSurcharge(product,size),`data-dtf-fee="${e(size)}"`)}</label>`).join('');
          bindMoneyInputs(fees);
        }
        const count=rows.children.length;
        add.disabled=count>=MAX_DTF_VARIANTS;
        rows.querySelectorAll('[data-dtf-remove]').forEach(button=>{button.disabled=count<=1;});
      }
      enhanceMaterialSelects(rows,materials);
      add.onclick=()=>{
        if(rows.children.length>=MAX_DTF_VARIANTS)return;
        rows.insertAdjacentHTML('beforeend',rowHtml());
        enhanceMaterialSelects(rows.lastElementChild,materials);
        sync();rows.lastElementChild.querySelector('[data-dtf-color]').focus();
      };
      rows.addEventListener('click',event=>{
        const button=event.target.closest('[data-dtf-remove]');
        if(!button || rows.children.length<=1)return;
        const row=button.closest('[data-dtf-variant]'),next=row.nextElementSibling || row.previousElementSibling;
        row.remove();sync();next?.querySelector('[data-dtf-color]').focus({preventScroll:true});
      });
      rows.addEventListener('change',event=>{if(event.target.matches('[data-dtf-size]'))sync();});
      sync();
      return ()=>{
        sync();
        const stockVariants=readRows(),seen=new Set(),sources=new Set();
        for(let i=0;i<stockVariants.length;i++){
          const {color,size,materialId}=stockVariants[i],key=dtfVariantKey(color,size),card=rows.children[i];
          if(!color || !size){card.querySelector(!color?'[data-dtf-color]':'[data-dtf-size]').focus();throw new Error('Isi warna dan ukuran untuk setiap varian kaos');}
          if(seen.has(key)){card.querySelector('[data-dtf-size]').focus();throw new Error(`Varian ${color} ${size} sudah ada`);}
          if(!allowed.has(materialId) || sources.has(materialId)){
            card.querySelector('.material-picker-trigger').focus();
            throw new Error(sources.has(materialId)?'Pilih bahan stok berbeda untuk setiap varian kaos':`Pilih bahan stok aktif untuk ${color} ${size}`);
          }
          seen.add(key);sources.add(materialId);
        }
        const sizeSurcharges=[...fees.querySelectorAll('[data-dtf-fee]')].map(input=>{
          const amount=parseMoney(input.value);
          if(!Number.isSafeInteger(amount) || amount<0){input.focus();throw new Error('Tambahan harga ukuran harus Rp0 atau lebih');}
          return {size:input.dataset.dtfFee,amount};
        });
        return {stockVariants,sizeSurcharges};
      };
    }
  };
}
