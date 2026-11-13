const masterNames = new Intl.Collator('id-ID', { numeric: true, sensitivity: 'base' });
export const compareMasterNames = masterNames.compare;

/** Per-account list preferences. Only filter controls are stored, never editor drafts. */
export function createMasterFilters({identity,storage=()=>globalThis.sessionStorage}){
  const memory=new Map(),key=id=>'manna-master-filters-v1:'+id;
  function data(){
    const id=identity();if(!id)return {};
    if(!memory.has(id)){
      let saved;try{saved=JSON.parse(storage()?.getItem(key(id))||'{}');}catch{}
      memory.set(id,saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{});
    }
    return memory.get(id);
  }
  return {
    read(scope,defaults){const row=data()[scope];return Object.fromEntries(Object.entries(defaults).map(([name,fallback])=>[name,row&&Object.hasOwn(row,name)&&typeof row[name]===typeof fallback?row[name]:fallback]));},
    write(scope,values){const id=identity();if(!id)return;const all=data();all[scope]=Object.fromEntries(Object.entries(values).filter(([,value])=>typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)));try{storage()?.setItem(key(id),JSON.stringify(all));}catch{}},
    clear(){const id=identity();if(!id)return;memory.delete(id);try{storage()?.removeItem(key(id));}catch{}}
  };
}

/** Restore actual controls before applying filters to the freshly rendered rows. */
export function bindMasterFilters(store,scope,root,fields,apply){
  const controls=Object.entries(fields).map(([name,config])=>{const spec=typeof config==='string'?{selector:config}:config;return {name,...spec,node:root.querySelector(spec.selector)};}).filter(c=>c.node);
  const readControl=c=>c.toggle?c.node.getAttribute('aria-pressed')==='true':c.node.type==='checkbox'?c.node.checked:c.node.value;
  const values=()=>Object.fromEntries(controls.map(c=>[c.name,readControl(c)]));
  const defaults=values(),saved=store.read(scope,defaults);
  function toggle(c,checked){c.node.setAttribute('aria-pressed',String(checked));c.node.classList.toggle('active',checked);}
  for(const c of controls){
    if(c.toggle)toggle(c,saved[c.name]);
    else if(c.node.type==='checkbox')c.node.checked=saved[c.name];
    else c.node.value=c.node.tagName==='SELECT'&&![...c.node.options].some(o=>o.value===saved[c.name])?defaults[c.name]:saved[c.name];
  }
  const capture=()=>{const next=values();store.write(scope,next);return next;};
  for(const c of controls)c.node.addEventListener(c.toggle?'click':c.node.tagName==='SELECT'||c.node.type==='checkbox'?'change':'input',event=>{
    if(c.toggle)toggle(c,!readControl(c));
    apply(capture(),event);
  });
  apply(capture(),null);
  return capture;
}
