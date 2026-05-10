- [ ] Verify Tailwind config / v4 setup for generating backdrop-blur utilities.
- [x] Investigate Dialog/AlertDialog overlay implementation (uses backdrop-blur + fixed inset).
- [x] Add blur fallback class (bb-blur-overlay) and ensure overlays include it.
- [ ] Fix TS errors from AlertDialog/Dialog component typing (if any remain).
- [ ] Re-test open dialog + alert dialog: blur visible and options clickable.
- [ ] If still blocked, inspect stacking context (e.g., body/page-transition filters/transform) and adjust overlay z-index.

