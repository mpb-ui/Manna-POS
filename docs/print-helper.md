# Native receipt printing

Manna POS uses Manna Print Helper for Nota Ulang, payment proofs and Print SPK.
The existing HTML print remains an explicit fallback in the launch dialog.
Print Tanda Terima and deposit/PO/report/payroll print flows remain separate.

POST `/api/print-jobs` requires the current browser login. It validates document
kind and existing role permissions, reads the whole invoice, and prepares an
immutable document projection. Work Order contains no financial fields. Invoice
and payment proof permissions match their existing actions. Historical proofs
retain original payment totals/discount/balance and order creation date in WITA.

The result contains a `mannaprint://open?job=...` URI and a public job ID.
The 256-bit random capability expires after three minutes, is stored only by its
SHA256 hash, and can return the document once. The native client POSTs it in an
Authorization header to `/print-helper/claim`; no credential is placed in a server
URL. User activity, session version, permissions and order revision are rechecked
before redemption. Duplicate concurrent redemption cannot return two documents.
Memory bounds and per-user creation limits prevent an unbounded print queue.
Nothing is persisted to the orders, payments, customer balance or stock tables.

`/print-helper/status` accepts an acknowledgement after redemption. Authenticated
GET `/api/print-jobs/:id` exposes status only to its creating session. All document
and job responses use `Cache-Control: no-store`. Opened means JasperViewer opened;
it does not mean the physical printer successfully printed. The POS does not mark
payments, jobs or stock complete based on a print acknowledgement.

No print-server database or extra Render service is needed. Jobs are process-local
on the current single-instance service. A restart invalidates pending capabilities
safely; the user retries from the POS. Before horizontal scaling, move this bounded
short-lived queue to a shared store while preserving atomic single-use redemption.

Windows installation and build instructions: `desktop/print-helper/README.md`.
Physical printer verification must cover short/long invoices, long product names,
DP and final payment, mixed deposit/cash/change, and a complete Work Order. Verify
both the preview and the final paper at 100% scale on the installed 80 mm driver.
