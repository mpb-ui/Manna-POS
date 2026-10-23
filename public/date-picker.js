// Delegation also covers date fields rendered later in dialogs and lazy pages.
export function installDatePickers(scope = document) {
  scope.addEventListener("click", event => {
    const input = event.target.closest?.('input[type="date"], input[type="datetime-local"], input[type="month"], input[type="week"]');
    if (!input || input.disabled || input.readOnly || typeof input.showPicker !== "function") return;
    try {
      input.focus({ preventScroll: true });
      input.showPicker();
      // The calendar icon has its own default action; don't toggle the picker twice.
      event.preventDefault();
    } catch { /* Unsupported browsers retain native controls and keyboard entry. */ }
  });
}
