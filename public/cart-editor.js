// Restore canonical line data as controls, independently from a product's
// temporary, not-yet-added configuration draft.
export function restoreCartEditor(scope, line) {
  const set = (selector, value) => { const input=scope.querySelector(selector); if(input && value != null) input.value=String(value); };
  const radio = (name,value) => scope.querySelectorAll(`input[name="${name}"]`).forEach(input=>{input.checked=input.value===String(value);});
  set('#quantity',line.quantity);
  set('#image-width',line.imageWidthCm ?? Number(line.width)*100);
  set('#image-length',line.imageLengthCm ?? Number(line.length ?? line.actualLength)*100);
  set('#allowance',line.allowanceCm || 0);
  radio('width',line.width);
  radio('size-variant',line.sizeVariantId || 'custom');
  radio('material-variant',line.materialVariantId || '');
  radio('sub-variant',line.subVariantId || '');
  for(const choice of line.choices || []) radio(`choice-${choice.groupId}`,choice.optionId);
  radio('template-size',`${line.width}x${line.length ?? line.actualLength}`);
  radio('template-design',line.templateDesign || '');
  set('#template-design-quantity',line.templateDesignQuantity || 1);
  const designId=line.fileServiceId || 'READY', enabled=scope.querySelector('#design-enabled');
  if(enabled) enabled.checked=designId!=='READY';
  if(designId!=='READY') {
    radio('file-service',designId);
    set(`[data-design-qty="${CSS.escape(designId)}"]`,line.fileServiceQuantity || 1);
    set(`[data-design-note="${CSS.escape(designId)}"]`,line.fileServiceNote || '');
  }
  set('#production-note',line.productionNote || '');
  if(line.sheetCalculation) {
    set('#sheet-width',line.sheetCalculation.widthCm);
    set('#sheet-length',line.sheetCalculation.lengthCm);
    const rotation=scope.querySelector('#sheet-rotation');if(rotation) rotation.checked=line.sheetCalculation.allowRotation!==false;
  }
}

export function cartSheetDraft(line) {
  return line.sheetCalculation ? {active:true,open:false,profile:line.sheetCalculation.profile,
    productId:line.productId,variantId:line.materialVariantId || ''} : null;
}
