// Non-modal suggestions keep typing, touch selection and keyboard navigation in the checkout.
export function mountCustomerAutocomplete({form,api,uid,onSelect,onEdit,date}) {
  const identity=uid(),name=form.elements.customerName,phone=form.elements.phone,controller=new AbortController(),signal=controller.signal;
  const popup=document.createElement('div');popup.className='customer-autocomplete';popup.id='checkout-customer-suggestions';popup.setAttribute('role','listbox');popup.setAttribute('aria-label','Saran pelanggan');popup.hidden=true;document.body.append(popup);
  name.autocomplete='off';name.setAttribute('role','combobox');name.setAttribute('aria-autocomplete','list');name.setAttribute('aria-controls',popup.id);name.setAttribute('aria-expanded','false');
  let timer,sequence=0,rows=[],active=-1,anchor=name;
  const valid=()=>form.isConnected&&uid()===identity;
  const close=()=>{sequence++;clearTimeout(timer);popup.hidden=true;active=-1;name.setAttribute('aria-expanded','false');name.removeAttribute('aria-activedescendant');};
  const position=()=>{if(popup.hidden)return;const rect=anchor.getBoundingClientRect(),v=window.visualViewport,left=v?.offsetLeft || 0,top=v?.offsetTop || 0,w=v?.width || innerWidth,h=v?.height || innerHeight,width=Math.min(Math.max(rect.width,280),w-24),below=top+h-rect.bottom-10,above=rect.top-top-10,up=below<180&&above>below;popup.style.width=width+'px';popup.style.maxHeight=Math.max(70,Math.min(280,up?above:below,h-24))+'px';popup.style.left=Math.max(left+12,Math.min(rect.left,left+w-width-12))+'px';popup.style.top=(up?Math.max(top+12,rect.top-popup.getBoundingClientRect().height-4):rect.bottom+4)+'px';};
  const highlight=()=>{popup.querySelectorAll('[data-customer-option]').forEach((b,i)=>{b.classList.toggle('active',i===active);b.setAttribute('aria-selected',String(i===active));});if(active>=0){name.setAttribute('aria-activedescendant',`${popup.id}-${active}`);popup.children[active]?.scrollIntoView({block:'nearest'});}else name.removeAttribute('aria-activedescendant');};
  const choose=i=>{const c=rows[i];if(!c||!valid())return;close();onSelect(c);};
  const fetchRows=async()=>{
    const token=++sequence,q=name.value.trim(),p=phone.value.trim();
    if(q.length<2&&p.length<3){close();return;}
    try{const data=await api('/api/customers/suggestions?'+new URLSearchParams({name:q,phone:p}));if(!valid()||token!==sequence||![name,phone].includes(document.activeElement))return;
      rows=data.rows;active=-1;popup.replaceChildren();
      rows.forEach((c,i)=>{const b=document.createElement('button');b.type='button';b.dataset.customerOption=String(i);b.id=`${popup.id}-${i}`;b.setAttribute('role','option');b.setAttribute('aria-selected','false');const title=document.createElement('strong'),small=document.createElement('small'),reason=document.createElement('span');title.textContent=c.name;small.textContent=c.phone+(c.lastPurchaseAt?' · Terakhir '+date(c.lastPurchaseAt):'');reason.className='customer-match-reason';reason.textContent=c.matchReason;b.append(title,small,reason);b.onpointerdown=e=>e.preventDefault();b.onclick=()=>choose(i);popup.append(b);});
      if(!rows.length){const p=document.createElement('p');p.textContent='Pelanggan baru akan disimpan bersama pesanan.';popup.append(p);}
      anchor=document.activeElement;popup.hidden=false;name.setAttribute('aria-expanded','true');position();
    }catch{if(token===sequence)close();}
  };
  for(const input of [name,phone]){
    input.addEventListener('input',()=>{onEdit();sequence++;clearTimeout(timer);timer=setTimeout(fetchRows,180);},{signal});
    input.addEventListener('focus',()=>{clearTimeout(timer);timer=setTimeout(fetchRows,100);},{signal});
    input.addEventListener('keydown',event=>{
      if(event.key==='Escape'){close();return;}
      if(popup.hidden)return;
      if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();active=rows.length?Math.max(0,Math.min(rows.length-1,active+(event.key==='ArrowDown'?1:-1))):-1;highlight();}
      if(event.key==='Enter'&&active>=0){event.preventDefault();choose(active);}
      if(event.key==='Tab')close();
    },{signal});
  }
  document.addEventListener('pointerdown',event=>{if(!popup.contains(event.target)&&event.target!==name&&event.target!==phone)close();},{signal});
  form.addEventListener('focusout',()=>queueMicrotask(()=>{if(![name,phone].includes(document.activeElement)&&!popup.contains(document.activeElement))close();}),{signal});
  window.addEventListener('resize',position,{signal});window.addEventListener('scroll',position,{signal,capture:true});window.visualViewport?.addEventListener('resize',position,{signal});window.visualViewport?.addEventListener('scroll',position,{signal});
  const observer=new MutationObserver(()=>{if(!valid()){controller.abort();clearTimeout(timer);popup.remove();observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});
  return {close};
}
