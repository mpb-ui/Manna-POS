const collator = new Intl.Collator('id-ID', {numeric:true,sensitivity:'base'});
const normalized = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('id-ID').trim();

export function materialChoices(options, materials = []) {
  const byId=new Map(materials.map(m=>[m.id,m]));
  return options.filter(o=>o.value).map(o=>({value:o.value,label:o.label,disabled:Boolean(o.disabled),sku:byId.get(o.value)?.sku || ''}))
    .sort((a,b)=>collator.compare(a.label,b.label)||collator.compare(a.value,b.value));
}
export function filterMaterials(choices, query) {
  const terms=normalized(query).split(/\s+/).filter(Boolean);
  return choices.filter(c=>terms.every(term=>normalized(c.label+' '+c.sku).includes(term)));
}

// Keep the original select/value/change contract for the existing master forms.
// One modal picker works for long lists on desktop and native mobile browsers.
export function enhanceMaterialSelects(scope, materials) {
  for(const select of scope.querySelectorAll('[data-material-id],[data-choice-material],[data-shirt-stock-material],select[name="materialId"]')) {
    if(select.dataset.materialPicker)continue;
    select.dataset.materialPicker='true';
    const selectedValue=select.value;
    const choices=materialChoices([...select.options],materials),placeholder=[...select.options].find(o=>!o.value)?.label || 'Pilih bahan';
    const byValue=new Map([...select.options].map(o=>[o.value,o]));
    const empty=byValue.get('');if(empty)select.append(empty);
    choices.forEach(c=>select.append(byValue.get(c.value)));
    select.value=selectedValue;
    const wrap=document.createElement('div');wrap.className='material-picker';select.before(wrap);wrap.append(select);
    select.hidden=true;select.tabIndex=-1;
    const button=document.createElement('button');button.type='button';button.className='material-picker-trigger';button.setAttribute('aria-haspopup','dialog');
    const label=document.createElement('span'),chevron=document.createElement('span');chevron.className='ui-chevron';chevron.setAttribute('aria-hidden','true');button.append(label,chevron);wrap.append(button);
    const sync=()=>{label.textContent=select.selectedOptions[0]?.label || placeholder;button.disabled=select.disabled;button.setAttribute('aria-label',select.getAttribute('aria-label') || 'Sumber bahan: '+label.textContent);};
    select.addEventListener('change',sync);sync();
    button.onclick=event=>{
      event.preventDefault();
      const picker=document.createElement('dialog');picker.className='material-picker-dialog';picker.setAttribute('aria-label','Pilih sumber bahan');
      picker.innerHTML='<header><div><h2>Pilih bahan</h2><p>Urutan A–Z</p></div><button type="button" data-picker-close aria-label="Tutup pilihan bahan">×</button></header><label class="material-picker-search"><span>Cari nama atau SKU bahan</span><input type="search" placeholder="Contoh: Art Paper, Flexi, KAOS-HIT…" autocomplete="off" aria-label="Cari nama atau SKU bahan"></label><p class="material-picker-count" role="status" aria-live="polite"></p><div class="material-picker-options" role="listbox" aria-label="Daftar bahan"></div>';
      const search=picker.querySelector('input'),list=picker.querySelector('[role=listbox]'),count=picker.querySelector('[role=status]');
      list.id='materials-'+crypto.randomUUID();search.setAttribute('role','combobox');search.setAttribute('aria-expanded','true');search.setAttribute('aria-autocomplete','list');search.setAttribute('aria-controls',list.id);
      let visible=[],active=-1;
      const choose=value=>{if(!select.isConnected)return picker.close();select.value=value;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));picker.close();};
      const highlight=index=>{const rows=[...list.querySelectorAll('[role=option]')];active=index;rows.forEach((row,i)=>{row.classList.toggle('keyboard-active',i===index);row.tabIndex=i===index?0:-1;});if(rows[index])search.setAttribute('aria-activedescendant',rows[index].id);else search.removeAttribute('aria-activedescendant');rows[index]?.scrollIntoView({block:'nearest'});};
      const render=()=>{
        visible=filterMaterials(choices,search.value);list.replaceChildren();
        count.textContent=visible.length+' bahan';
        if(!search.value && empty){const clear=document.createElement('button');clear.type='button';clear.className='material-picker-clear';clear.textContent=placeholder;clear.onclick=()=>choose('');list.append(clear);}
        for(const item of visible){
          const row=document.createElement('button');row.id=list.id+'-'+list.childElementCount;row.type='button';row.setAttribute('role','option');row.setAttribute('aria-selected',String(item.value===select.value));row.disabled=item.disabled;row.dataset.materialOption=item.value;
          const text=document.createElement('strong');text.textContent=item.label;row.append(text);
          if(item.sku){const sku=document.createElement('small');sku.textContent=item.sku;row.append(sku);}
          row.onclick=()=>choose(item.value);list.append(row);
        }
        if(!visible.length){const message=document.createElement('p');message.className='material-picker-empty';message.textContent='Bahan tidak ditemukan. Coba nama atau SKU lain.';list.append(message);}
        highlight(-1);
      };
      search.oninput=render;
      picker.addEventListener('keydown',e=>{
        const rows=[...list.querySelectorAll('[role=option]')];
        if(e.key==='Escape'){e.preventDefault();e.stopPropagation();picker.close();}
        else if(['ArrowDown','ArrowUp'].includes(e.key)&&rows.length){e.preventDefault();const step=e.key==='ArrowDown'?1:-1;let next=active;for(let i=0;i<rows.length;i++){next=(next+step+rows.length)%rows.length;if(!rows[next].disabled)break;}highlight(next);}
        else if(e.key==='Enter'&&document.activeElement===search){e.preventDefault();const row=rows[active>=0?active:0];if(row&&!row.disabled)choose(row.dataset.materialOption);}
      });
      picker.querySelector('[data-picker-close]').onclick=()=>picker.close();
      picker.addEventListener('click',e=>{const r=picker.getBoundingClientRect();if(e.target===picker&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))picker.close();});
      const parent=select.closest('dialog'),close=()=>picker.open&&picker.close();parent?.addEventListener('close',close);
      const viewport=window.visualViewport;
      const fit=()=>{const width=viewport?.width || innerWidth,height=viewport?.height || innerHeight;picker.style.width=Math.min(540,width-28)+'px';picker.style.maxHeight=Math.floor(height*.9)+'px';picker.style.left=((viewport?.offsetLeft || 0)+width/2)+'px';picker.style.top=((viewport?.offsetTop || 0)+height/2)+'px';};
      viewport?.addEventListener('resize',fit);viewport?.addEventListener('scroll',fit);window.addEventListener('resize',fit);
      picker.addEventListener('close',()=>{parent?.removeEventListener('close',close);viewport?.removeEventListener('resize',fit);viewport?.removeEventListener('scroll',fit);window.removeEventListener('resize',fit);picker.remove();if(button.isConnected)button.focus({preventScroll:true});},{once:true});
      document.body.append(picker);render();fit();picker.showModal();search.focus();
    };
  }
}
