import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/api-client";
import { PageHeader } from "@/components/layout/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/Pagination";
import { useToast } from "@/hooks/use-toast";
import { downloadRowsAsCsv, openRowsCsv, openRowsPdfPrint } from "@/lib/export-utils";
import { BarChart3, Download, FileText, Filter, Loader2, Search, TableProperties } from "lucide-react";

type ReportColumn = {
  header: string;
  key: string;
  value?: (row: any) => string | number | null | undefined;
};

type ReportConfig = {
  id: string;
  name: string;
  category: string;
  endpoint: string;
  description: string;
  statusKey?: string;
  dateKey?: string;
  columns: ReportColumn[];
  normalize?: (row: any) => any;
  scenarios?: ReportScenario[];
};

type ReportScenario = {
  id: string;
  label: string;
  description: string;
  predicate: (row: any) => boolean;
};

const formatMoney = (value: unknown) => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
};

const formatDate = (value: unknown) => {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const text = (value: unknown) => (value == null || value === "" ? "-" : String(value));
const isThisMonth = (value: unknown) => {
  if (!value) return false;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
};

const activeScenario = { id: "active", label: "Active only", description: "Only records currently marked active.", predicate: (row: any) => String(row.status || "").toLowerCase() === "active" };
const pendingScenario = { id: "pending", label: "Pending only", description: "Only records waiting for action.", predicate: (row: any) => String(row.status || "").toLowerCase() === "pending" };
const thisMonthScenario = (dateKey = "date"): ReportScenario => ({
  id: "this-month",
  label: "This month",
  description: "Only records dated in the current month.",
  predicate: (row: any) => isThisMonth(row[dateKey]),
});

const REPORTS: ReportConfig[] = [
  {
    id: "employees",
    name: "Employees",
    category: "HR & Payroll",
    endpoint: "/employees?page=1&limit=500",
    description: "Employee master records, departments, salaries and active status.",
    statusKey: "status",
    dateKey: "joiningDate",
    columns: [
      { header: "Employee", key: "name", value: r => `${r.firstName || ""} ${r.lastName || ""}`.trim() },
      { header: "Code", key: "employeeId" },
      { header: "Department", key: "department" },
      { header: "Designation", key: "designation" },
      { header: "Status", key: "status" },
      { header: "Joining Date", key: "joiningDate", value: r => formatDate(r.joiningDate) },
      { header: "Salary", key: "salary", value: r => formatMoney(r.salary) },
    ],
    scenarios: [
      activeScenario,
      { id: "inactive", label: "Inactive only", description: "Employees currently marked inactive.", predicate: row => String(row.status || "").toLowerCase() === "inactive" },
      { id: "high-salary", label: "High salary", description: "Employees with salary above 50,000.", predicate: row => Number(row.salary || 0) >= 50000 },
    ],
  },
  {
    id: "attendance",
    name: "Attendance",
    category: "HR & Payroll",
    endpoint: "/attendance?page=1&limit=500",
    description: "Daily employee attendance, hours and marking status.",
    statusKey: "status",
    dateKey: "date",
    columns: [
      { header: "Employee", key: "employeeName" },
      { header: "Code", key: "employeeCode" },
      { header: "Department", key: "department" },
      { header: "Date", key: "date", value: r => formatDate(r.date) },
      { header: "Status", key: "status" },
      { header: "Hours", key: "hoursWorked" },
      { header: "Marked By", key: "markedBy" },
    ],
    scenarios: [
      thisMonthScenario("date"),
      { id: "absent-late", label: "Absent / late", description: "Attendance exceptions requiring review.", predicate: row => ["absent", "late", "half_day"].includes(String(row.status || "").toLowerCase()) },
    ],
  },
  {
    id: "payroll",
    name: "Payroll",
    category: "HR & Payroll",
    endpoint: "/reports/payroll",
    description: "Payroll by employee, month, salary and payment status.",
    statusKey: "status",
    dateKey: "createdAt",
    columns: [
      { header: "Employee", key: "employeeName" },
      { header: "Department", key: "department" },
      { header: "Month", key: "month" },
      { header: "Basic", key: "basicSalary", value: r => formatMoney(r.basicSalary) },
      { header: "Net Salary", key: "netSalary", value: r => formatMoney(r.netSalary) },
      { header: "Status", key: "status" },
    ],
    scenarios: [
      pendingScenario,
      { id: "paid", label: "Paid payroll", description: "Payroll already marked paid.", predicate: row => String(row.status || "").toLowerCase() === "paid" },
      { id: "large-net", label: "Net above 50,000", description: "Payroll records with larger net salary.", predicate: row => Number(row.netSalary || 0) >= 50000 },
    ],
  },
  {
    id: "overtime",
    name: "Overtime",
    category: "HR & Payroll",
    endpoint: "/reports/overtime",
    description: "Project-wise and employee-wise overtime with date range filtering.",
    statusKey: "status",
    dateKey: "workDate",
    columns: [
      { header: "Employee", key: "employeeName" },
      { header: "Project", key: "projectName" },
      { header: "Date", key: "workDate", value: r => formatDate(r.workDate) },
      { header: "Hours", key: "hours" },
      { header: "Rate", key: "hourlyRate", value: r => formatMoney(r.hourlyRate) },
      { header: "Amount", key: "amount", value: r => formatMoney(r.amount) },
      { header: "Proof", key: "proofUrl" },
    ],
    scenarios: [
      thisMonthScenario("workDate"),
      { id: "with-project", label: "Project assigned", description: "Overtime linked to a project.", predicate: row => !!row.projectName && row.projectName !== "No project" },
    ],
  },
  {
    id: "advance-payments",
    name: "Advance Payments",
    category: "HR & Payroll",
    endpoint: "/reports/advance-payments",
    description: "Employee advance payments that deduct from monthly payslips.",
    statusKey: "status",
    dateKey: "paymentDate",
    columns: [
      { header: "Employee", key: "employeeName" },
      { header: "Payment Date", key: "paymentDate", value: r => formatDate(r.paymentDate) },
      { header: "Deduction Month", key: "deductionMonth" },
      { header: "Amount", key: "amount", value: r => formatMoney(r.amount) },
      { header: "Mode", key: "paymentMode" },
      { header: "Reference", key: "referenceNo" },
      { header: "Status", key: "status" },
    ],
    scenarios: [
      pendingScenario,
      { id: "deducted", label: "Deducted", description: "Advances already deducted.", predicate: row => String(row.status || "").toLowerCase() === "deducted" },
    ],
  },
  {
    id: "leaves",
    name: "Leaves",
    category: "HR & Payroll",
    endpoint: "/leaves?page=1&limit=500",
    description: "Leave requests with status, dates, duration and reason.",
    statusKey: "status",
    dateKey: "startDate",
    columns: [
      { header: "Employee", key: "employeeName" },
      { header: "Leave Type", key: "leaveType" },
      { header: "From", key: "startDate", value: r => formatDate(r.startDate) },
      { header: "To", key: "endDate", value: r => formatDate(r.endDate) },
      { header: "Days", key: "days" },
      { header: "Status", key: "status" },
      { header: "Reason", key: "reason" },
    ],
    scenarios: [
      pendingScenario,
      { id: "approved", label: "Approved leaves", description: "Approved leave requests.", predicate: row => String(row.status || "").toLowerCase() === "approved" },
      thisMonthScenario("startDate"),
    ],
  },
  {
    id: "customers",
    name: "Customers",
    category: "Sales & Clients",
    endpoint: "/customers?page=1&limit=500",
    description: "Customer directory, contact details, status and revenue.",
    statusKey: "status",
    dateKey: "createdAt",
    columns: [
      { header: "Customer", key: "name" },
      { header: "Company", key: "company" },
      { header: "Email", key: "email" },
      { header: "Phone", key: "phone" },
      { header: "Status", key: "status" },
      { header: "Revenue", key: "totalRevenue", value: r => formatMoney(r.totalRevenue) },
    ],
    scenarios: [
      activeScenario,
      { id: "with-revenue", label: "With revenue", description: "Customers with recorded revenue.", predicate: row => Number(row.totalRevenue || 0) > 0 },
    ],
  },
  {
    id: "invoices",
    name: "Invoices",
    category: "Sales & Clients",
    endpoint: "/reports/invoices",
    description: "Invoice ledger with customers, status, due dates and amounts.",
    statusKey: "status",
    dateKey: "issueDate",
    columns: [
      { header: "Invoice", key: "invoiceNumber" },
      { header: "Customer", key: "customerName" },
      { header: "Issue Date", key: "issueDate", value: r => formatDate(r.issueDate) },
      { header: "Due Date", key: "dueDate", value: r => formatDate(r.dueDate) },
      { header: "Status", key: "status" },
      { header: "Total", key: "totalAmount", value: r => formatMoney(r.totalAmount) },
      { header: "Paid", key: "paidAmount", value: r => formatMoney(r.paidAmount) },
    ],
    scenarios: [
      pendingScenario,
      { id: "overdue", label: "Overdue", description: "Invoices marked overdue.", predicate: row => String(row.status || "").toLowerCase() === "overdue" },
      { id: "partial", label: "Partially paid", description: "Invoices with partial payment.", predicate: row => String(row.status || "").toLowerCase() === "partial" || (Number(row.paidAmount || 0) > 0 && Number(row.paidAmount || 0) < Number(row.totalAmount || 0)) },
    ],
  },
  {
    id: "revenue",
    name: "Revenue",
    category: "Sales & Clients",
    endpoint: "/reports/revenue",
    description: "Revenue records by source, date and amount.",
    dateKey: "date",
    columns: [
      { header: "Title", key: "title" },
      { header: "Source", key: "source" },
      { header: "Date", key: "date", value: r => formatDate(r.date) },
      { header: "Amount", key: "amount", value: r => formatMoney(r.amount) },
      { header: "Notes", key: "notes" },
    ],
    scenarios: [thisMonthScenario("date")],
  },
  {
    id: "ledger",
    name: "Ledger",
    category: "Sales & Clients",
    endpoint: "/ledger?page=1&limit=500",
    description: "Ledger accounts, balances, type and active status.",
    statusKey: "status",
    dateKey: "startDate",
    columns: [
      { header: "Account", key: "accountName" },
      { header: "Code", key: "accountCode" },
      { header: "Type", key: "accountType" },
      { header: "Start Date", key: "startDate", value: r => formatDate(r.startDate) },
      { header: "Status", key: "status" },
      { header: "Current Balance", key: "currentBalance", value: r => formatMoney(r.currentBalance) },
    ],
    scenarios: [
      activeScenario,
      { id: "non-zero", label: "Non-zero balance", description: "Ledger accounts with a current balance.", predicate: row => Number(row.currentBalance || 0) !== 0 },
    ],
  },
  {
    id: "vendors",
    name: "Vendors",
    category: "Procurement",
    endpoint: "/vendors?page=1&limit=500",
    description: "Vendor directory, categories, contact details and status.",
    statusKey: "status",
    dateKey: "createdAt",
    columns: [
      { header: "Vendor", key: "name" },
      { header: "Company", key: "company" },
      { header: "Category", key: "category" },
      { header: "Email", key: "email" },
      { header: "Phone", key: "phone" },
      { header: "Status", key: "status" },
    ],
    scenarios: [activeScenario],
  },
  {
    id: "purchase-orders",
    name: "Purchase Orders",
    category: "Procurement",
    endpoint: "/purchase-orders?page=1&limit=500",
    description: "Purchase orders by customer, project, status and value.",
    statusKey: "status",
    dateKey: "orderDate",
    columns: [
      { header: "PO Number", key: "poNumber" },
      { header: "Customer", key: "customerName" },
      { header: "Project", key: "projectName" },
      { header: "Order Date", key: "orderDate", value: r => formatDate(r.orderDate) },
      { header: "Status", key: "status" },
      { header: "Total", key: "totalAmount", value: r => formatMoney(r.totalAmount) },
    ],
    scenarios: [
      pendingScenario,
      { id: "approved", label: "Approved", description: "Approved purchase orders.", predicate: row => String(row.status || "").toLowerCase() === "approved" },
      thisMonthScenario("orderDate"),
    ],
  },
  {
    id: "projects",
    name: "Projects",
    category: "Operations",
    endpoint: "/reports/projects",
    description: "Project status, budget, spending and progress.",
    statusKey: "status",
    dateKey: "startDate",
    columns: [
      { header: "Project", key: "name" },
      { header: "Status", key: "status" },
      { header: "Start", key: "startDate", value: r => formatDate(r.startDate) },
      { header: "End", key: "endDate", value: r => formatDate(r.endDate) },
      { header: "Progress", key: "progress", value: r => `${Number(r.progress || 0)}%` },
      { header: "Budget", key: "budget", value: r => formatMoney(r.budget) },
      { header: "Spent", key: "spent", value: r => formatMoney(r.spent) },
    ],
    scenarios: [
      activeScenario,
      { id: "over-budget", label: "Over budget", description: "Projects where spending exceeds budget.", predicate: row => Number(row.spent || 0) > Number(row.budget || 0) },
      { id: "delayed", label: "Delayed risk", description: "Projects not complete after planned end date.", predicate: row => row.endDate && new Date(row.endDate) < new Date() && Number(row.progress || 0) < 100 },
    ],
  },
  {
    id: "work-allocation",
    name: "Work Allocation",
    category: "Operations",
    endpoint: "/work-allocation/all",
    description: "Customer, project and employee allocation records.",
    statusKey: "status",
    dateKey: "createdAt",
    columns: [
      { header: "Customer", key: "customerName" },
      { header: "Project", key: "projectName" },
      { header: "Employee", key: "employeeName" },
      { header: "Code", key: "employeeCode" },
      { header: "Status", key: "status" },
      { header: "Created", key: "createdAt", value: r => formatDate(r.createdAt) },
    ],
    scenarios: [activeScenario],
  },
  {
    id: "inventory",
    name: "Inventory",
    category: "Operations",
    endpoint: "/reports/inventory",
    description: "Inventory quantities, categories, reorder levels and value.",
    dateKey: "createdAt",
    columns: [
      { header: "Item", key: "name" },
      { header: "SKU", key: "sku" },
      { header: "Category", key: "category" },
      { header: "Quantity", key: "quantity" },
      { header: "Reorder", key: "reorderLevel" },
      { header: "Cost", key: "costPrice", value: r => formatMoney(r.costPrice) },
      { header: "Value", key: "value", value: r => formatMoney(Number(r.quantity || 0) * Number(r.costPrice || 0)) },
    ],
    scenarios: [
      { id: "low-stock", label: "Low stock", description: "Items at or below reorder level.", predicate: row => Number(row.quantity || 0) <= Number(row.reorderLevel || 0) },
      { id: "high-value", label: "High value", description: "Items with stock value above 50,000.", predicate: row => Number(row.quantity || 0) * Number(row.costPrice || 0) >= 50000 },
    ],
  },
  {
    id: "inventory-movements",
    name: "Inventory Movements",
    category: "Operations",
    endpoint: "/inventory-movements?page=1&limit=500",
    description: "Stock in/out movements with before and after balances.",
    statusKey: "type",
    dateKey: "createdAt",
    columns: [
      { header: "Item", key: "itemName" },
      { header: "Type", key: "type" },
      { header: "Quantity", key: "quantity" },
      { header: "Previous", key: "previousStock" },
      { header: "Current", key: "currentStock" },
      { header: "Reference", key: "reference" },
      { header: "Created By", key: "createdBy" },
    ],
    scenarios: [
      { id: "stock-in", label: "Stock in", description: "Inbound stock movements.", predicate: row => String(row.type || "").toLowerCase().includes("in") },
      { id: "stock-out", label: "Stock out", description: "Outbound stock movements.", predicate: row => String(row.type || "").toLowerCase().includes("out") },
    ],
  },
  {
    id: "expenses",
    name: "Expenses",
    category: "Finance",
    endpoint: "/reports/expenses",
    description: "Expense records by category, approval status and amount.",
    statusKey: "status",
    dateKey: "date",
    columns: [
      { header: "Title", key: "title" },
      { header: "Category", key: "category" },
      { header: "Date", key: "date", value: r => formatDate(r.date) },
      { header: "Status", key: "status" },
      { header: "Amount", key: "amount", value: r => formatMoney(r.amount) },
      { header: "Description", key: "description" },
    ],
    scenarios: [pendingScenario, thisMonthScenario("date")],
  },
  {
    id: "documents",
    name: "Documents",
    category: "Admin",
    endpoint: "/documents?page=1&limit=500",
    description: "Company and project documents with type, tags and upload date.",
    statusKey: "fileType",
    dateKey: "createdAt",
    columns: [
      { header: "Title", key: "title" },
      { header: "Project", key: "projectName" },
      { header: "Type", key: "fileType" },
      { header: "Size", key: "fileSize" },
      { header: "Uploaded By", key: "uploadedBy" },
      { header: "Date", key: "createdAt", value: r => formatDate(r.createdAt) },
    ],
    scenarios: [
      { id: "pdf-docs", label: "PDF documents", description: "Only PDF attachments.", predicate: row => String(row.fileType || "").toLowerCase().includes("pdf") },
      thisMonthScenario("createdAt"),
    ],
  },
];

const categories = ["all", ...Array.from(new Set(REPORTS.map(report => report.category)))];

const getRows = (payload: any) => {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
};

const getCell = (row: any, column: ReportColumn) => text(column.value ? column.value(row) : row[column.key]);

export default function Reports() {
  const apiClient = useApiClient();
  const { toast } = useToast();
  const [reportId, setReportId] = useState("employees");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [scenario, setScenario] = useState("all");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const activeReport = REPORTS.find(report => report.id === reportId) || REPORTS[0];
  const visibleReports = category === "all" ? REPORTS : REPORTS.filter(report => report.category === category);

  const { data, isLoading, isFetching } = useQuery<any[]>({
    queryKey: ["report-generator", activeReport.id, activeReport.endpoint],
    queryFn: async () => {
      const response = await apiClient.get(activeReport.endpoint);
      return getRows(response.data).map((row: any) => activeReport.normalize ? activeReport.normalize(row) : row);
    },
  });

  const rows: any[] = data || [];
  const statusOptions = useMemo(() => {
    if (!activeReport.statusKey) return [];
    return Array.from(new Set(rows.map((row: any) => row[activeReport.statusKey!]).filter(Boolean).map(String))).sort() as string[];
  }, [activeReport, rows]);
  const scenarioOptions = activeReport.scenarios || [];

  const filteredRows = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;
    const q = search.trim().toLowerCase();

    return rows.filter((row: any) => {
      if (scenario !== "all") {
        const selectedScenario = scenarioOptions.find(item => item.id === scenario);
        if (selectedScenario && !selectedScenario.predicate(row)) return false;
      }
      if (activeReport.statusKey && status !== "all" && String(row[activeReport.statusKey] || "") !== status) return false;
      if (activeReport.dateKey && (from || to)) {
        const raw = row[activeReport.dateKey];
        const time = raw ? new Date(String(raw)).getTime() : NaN;
        if (Number.isNaN(time)) return false;
        if (from && time < from) return false;
        if (to && time > to) return false;
      }
      if (!q) return true;
      return activeReport.columns.some(column => getCell(row, column).toLowerCase().includes(q));
    });
  }, [activeReport, rows, status, fromDate, toDate, search, scenario, scenarioOptions]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const resetPage = () => setPage(1);

  const exportColumns = activeReport.columns.map(column => ({
    header: column.header,
    value: (row: any) => getCell(row, column),
  }));

  const handleExportPDF = () => {
    if (!openRowsPdfPrint(`${activeReport.name} Report`, filteredRows, exportColumns)) {
      toast({ title: "Export failed", description: "No report data available.", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: `${activeReport.name} PDF report opened.` });
  };

  const handleExportExcel = () => {
    if (!openRowsCsv(`${activeReport.id}-report.csv`, filteredRows, exportColumns)) {
      toast({ title: "Export failed", description: "No report data available.", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: `${activeReport.name} Excel report opened in a new tab.` });
  };

  const totalAmount = useMemo(() => {
    const amountKey = ["amount", "totalAmount", "netSalary", "currentBalance", "value"].find(key => filteredRows.some((row: any) => row[key] != null));
    if (!amountKey) return null;
    return filteredRows.reduce((sum: number, row: any) => sum + Number(row[amountKey] || 0), 0);
  }, [filteredRows]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Report Generator"
        description="Unified reports across every ERP module with search, filters, date ranges, and exports"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleExportPDF}><FileText className="w-4 h-4 mr-2" />PDF</Button>
            <Button variant="outline" size="sm" onClick={handleExportExcel}><Download className="w-4 h-4 mr-2" />Excel</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard label="Available Reports" value={REPORTS.length} icon={TableProperties} bg="bg-blue-600" />
        <MetricCard label="Filtered Rows" value={filteredRows.length} icon={Filter} bg="bg-emerald-600" />
        <MetricCard label="Category" value={activeReport.category} icon={BarChart3} bg="bg-violet-600" />
        <MetricCard label="Amount Summary" value={totalAmount == null ? "-" : formatMoney(totalAmount)} icon={Download} bg="bg-amber-500" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-6">
          <div className="lg:col-span-1">
            <label className="mb-2 block text-sm font-medium">Category</label>
            <Select
              value={category}
              onValueChange={(value) => {
                setCategory(value);
                const next = value === "all" ? REPORTS[0] : REPORTS.find(report => report.category === value);
                if (next) setReportId(next.id);
                setStatus("all");
                setScenario("all");
                resetPage();
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map(item => <SelectItem key={item} value={item}>{item === "all" ? "All Categories" : item}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="lg:col-span-2">
            <label className="mb-2 block text-sm font-medium">Report</label>
            <Select value={reportId} onValueChange={(value) => { setReportId(value); setStatus("all"); setScenario("all"); resetPage(); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {visibleReports.map(report => <SelectItem key={report.id} value={report.id}>{report.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Status / Type</label>
            <Select value={status} onValueChange={(value) => { setStatus(value); resetPage(); }} disabled={!statusOptions.length}>
              <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {statusOptions.map((option: string) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Scenario</label>
            <Select value={scenario} onValueChange={(value) => { setScenario(value); resetPage(); }} disabled={!scenarioOptions.length}>
              <SelectTrigger><SelectValue placeholder="All scenarios" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All scenarios</SelectItem>
                {scenarioOptions.map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">From</label>
            <Input type="date" value={fromDate} onChange={event => { setFromDate(event.target.value); resetPage(); }} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">To</label>
            <Input type="date" value={toDate} onChange={event => { setToDate(event.target.value); resetPage(); }} />
          </div>
          <div className="lg:col-span-6">
            <label className="mb-2 block text-sm font-medium">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={event => { setSearch(event.target.value); resetPage(); }} placeholder="Search the current report..." className="pl-9" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">{activeReport.name}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{activeReport.description}</p>
            {scenario !== "all" && (
              <p className="mt-1 text-xs text-primary">
                Scenario: {scenarioOptions.find(option => option.id === scenario)?.description}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary">{activeReport.category}</Badge>
            {isFetching && <Badge variant="outline">Refreshing</Badge>}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-56 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {activeReport.columns.map(column => <TableHead key={column.header}>{column.header}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRows.length ? paginatedRows.map((row: any, index: number) => (
                  <TableRow key={`${activeReport.id}-${row.id || index}`} className="hover:bg-muted/20">
                    {activeReport.columns.map(column => (
                      <TableCell key={column.header} className="max-w-[260px] truncate">
                        {getCell(row, column)}
                      </TableCell>
                    ))}
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={activeReport.columns.length} className="py-10 text-center text-muted-foreground">
                      No records match the selected filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
          <div className="px-4">
            <Pagination
              page={safePage}
              totalPages={totalPages}
              onPageChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
