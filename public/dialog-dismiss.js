const bindings=new WeakMap(),pending=new WeakMap();
const idle=dialog=>!pending.get(dialog)&&!dialog.querySelector('[data-saving]');

/** Count writes started by a modal until the complete API response is processed. */
export function trackDialogMutation(document,method='GET'){
  if(['GET','HEAD','OPTIONS'].includes(String(method).toUpperCase()))return ()=>{};
  const dialog=document.activeElement?.closest?.('dialog[open]')||[...document.querySelectorAll('dialog[open]')].at(-1);
  if(!dialog)return ()=>{};
  pending.set(dialog,(pending.get(dialog)||0)+1);let ended=false;
  return ()=>{if(!ended){ended=true;pending.set(dialog,Math.max(0,(pending.get(dialog)||1)-1));}};
}

/** A deliberate click on the backdrop acts like Escape, including cancel guards. */
export function bindBackdropClose(dialog,{canClose=()=>true}={}){
  bindings.get(dialog)?.();let outsideDown=false;
  const outside=event=>{const r=dialog.getBoundingClientRect();return event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);};
  const down=event=>{outsideDown=event.button===0&&outside(event);};
  const cancel=()=>{outsideDown=false;};
  const click=event=>{
    const dismiss=outsideDown&&outside(event);outsideDown=false;
    if(!dismiss||!dialog.open||!idle(dialog)||!canClose())return;
    if(dialog.dispatchEvent(new Event('cancel',{cancelable:true})))dialog.close();
  };
  const closed=()=>{if(!dialog.open)cleanup();};
  function cleanup(){dialog.removeEventListener('pointerdown',down);dialog.removeEventListener('pointercancel',cancel);dialog.removeEventListener('click',click);dialog.removeEventListener('close',closed);if(bindings.get(dialog)===cleanup)bindings.delete(dialog);}
  dialog.addEventListener('pointerdown',down);dialog.addEventListener('pointercancel',cancel);dialog.addEventListener('click',click);dialog.addEventListener('close',closed);bindings.set(dialog,cleanup);
  return cleanup;
}
