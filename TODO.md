# TODO

## Completed/Planned Work

- [ ] A) Fix table hover default light color after reset
  - [ ] Update `frontend/src/contexts/ThemeUIContext.tsx` to always compute `--table-row-hover` based on current `tableHeaderColor` and `themeMode` (or apply a safe fallback).


- [ ] B) Fix payslip ZIP download endpoint
  - [ ] Add backend route `POST /api/payroll/batch/download-zip`
  - [ ] Implement ZIP streaming response with generated payslip PDFs
  - [ ] Ensure correct headers (`application/zip`, `Content-Disposition`) and error handling


