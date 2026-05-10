# EliteMek ERP System

## Overview
Full-stack TypeScript ERP system for engineering/manufacturing companies built on a pnpm monorepo.

## Architecture
- **Frontend**: React 19 + Vite + TailwindCSS v4 + shadcn/ui (port 18996)
- **Backend**: Express 5 API server (port 8080)
- **Database**: PostgreSQL with Drizzle ORM
- **State**: TanStack Query (React Query) v5
- **Routing**: Wouter
- **Charts**: Recharts

## Workspace Packages
- `frontend` — React/Vite frontend (`@workspace/erp`)
- `backend` — Express 5 backend (`@workspace/api-server`)
- `lib/db` — Drizzle ORM schema + client (`@workspace/db`)
- `lib/api-spec` — OpenAPI spec + codegen (`@workspace/api-spec`)
- `lib/api-client-react` — Generated React Query hooks (`@workspace/api-client-react`)
- `lib/api-zod` — Generated Zod schemas (`@workspace/api-zod`)

## Workflows
- **ERP Frontend**: `PORT=18996 BASE_PATH=/ pnpm --filter @workspace/erp run dev`
- **API Server**: `PORT=8080 pnpm --filter @workspace/api-server run dev`

## Modules
1. **Dashboard** — KPI cards + Line/Bar/Pie charts (Recharts)
2. **Employees** — Card/table view, Amazon-style cards, real photo upload (base64), CSV import/export
3. **Attendance** — Monthly grid with dropdown selectors per cell, bulk save
4. **Payroll** — Monthly payroll processing
5. **Leaves** — Leave request management
6. **Customers** — Customer CRM
7. **Vendors** — Vendor management
8. **Projects** — Card/table view, project image upload (base64), CSV template
9. **Purchase Orders** — PO management
10. **Inventory** — Stock tracking
11. **Inventory Movements** — In/out stock movement tracking
12. **Expenses** — CRUD with CSV import/export, date range filter
13. **Revenue** — Revenue tracking
14. **Invoices** — Invoice management
15. **Documents** — File upload (base64 to DB), project dropdown from live DB
16. **Work Allocation** — Dual-panel UI to assign employees to projects
17. **Notifications** — System notifications
18. **Roles** — Role & permission management
19. **Settings** — System settings (company info, branding, integrations)
20. **Reminders** — Due-date reminders with daily modal popup
21. **Reports** — Analytics reports

## Authentication
- JWT Bearer token stored in localStorage
- Token sent via `Authorization: Bearer <token>` header
- Login at `/login`

## Key Patterns
- File uploads: Convert to base64 data URL in browser, store in text DB column
- API base URL: `import.meta.env.BASE_URL` + `/api` prefix (from `lib/api-client.ts`)
- CSV import: FileReader → parse headers/rows → batch create
- Attendance: Custom endpoints `/attendance/monthly` and `/attendance/bulk`

## Port Mapping
- ERP Frontend dev: 18996 (external: 3000)
- API Server: 8080 (external: 8080)
- Main proxy: 8081 (external: 80)

## Recent Changes
- Dashboard: Added pie chart (expense by category) and bar chart (monthly revenue/expenses)
- Employees: Redesigned to Amazon/Flipkart-style cards with photo upload, CSV import
- Attendance: Converted click-to-cycle to dropdown selectors per cell
- Projects: Added project image upload (base64), CSV template download
- Expenses: Fixed Select.Item empty value bug, added date range filter, CSV import
- Documents: Real file upload (base64), project dropdown from DB
- Work Allocation: New dual-panel employee assignment module
- Settings: Fixed save — now only updates allowed fields (strips id/createdAt)
- AppLayout: Removed audit-logs from sidebar, added Work Allocation under HR & Payroll
