// Move the existing controls, preserving their values, labels and event handlers.
// Each page calls this after drawing its active list; no observer or duplicate UI.
export function alignPageHeader(root) {
  const page=root.querySelector('.master-page'), head=page?.querySelector('.master-top');
  if(!head)return;
  head.classList.add('page-toolbar');page.classList.add('unified-page');
  let slot=head.querySelector('.page-toolbar-filters');
  if(!slot){slot=document.createElement('div');slot.className='page-toolbar-filters';head.insertBefore(slot,head.children[1] || null);}
  const sources=[...page.querySelectorAll('.master-list-head .master-filters, .master-list-head>input.search, .customer-toolbar, .payroll-toolbar, .asset-toolbar')].filter(el=>!head.contains(el));
  slot.replaceChildren();
  for(const source of sources){
    if(source.matches('input'))slot.append(source);
    else {for(const child of [...source.children])if(!child.matches('h2'))slot.append(child);source.remove();}
  }
}

// Master Data keeps its list controls in the active tab's panel.
export function masterPanelHeader(title, { filters = "", actions = "" } = {}) {
  return `<div class="panel-head master-panel-head"><h2>${title}</h2>${filters || actions ? `<div class="master-panel-controls">${filters ? `<div class="master-panel-filters">${filters}</div>` : ""}${actions ? `<div class="master-panel-actions">${actions}</div>` : ""}</div>` : ""}</div>`;
}
