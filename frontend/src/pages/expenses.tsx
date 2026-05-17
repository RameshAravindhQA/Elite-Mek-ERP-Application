import { useState } from "react";
import { useListExpenses, useCreateExpense, useUpdateExpense, useDeleteExpense, useGetExpenseStats, useListProjects, getListExpensesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AuditLogDialog } from "@/components/audit/AuditLogDialog";
import { Loader2, Plus, Search, FileDown, Edit, Trash2, Receipt, TrendingDown, Clock, Upload, Download, History } from "lucide-react";
import { Pagination } from "@/components/Pagination";
import { showInlineFieldErrors, validateRequiredFields } from "@/lib/inline-validation";

const CATEGORIES = ["Travel", "Office Supplies", "Utilities", "Maintenance", "Marketing", "Software", "Training", "Miscellaneous"];
const fmtINR = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

const defaultForm = () => ({ title: "", category: "Miscellaneous", subCategory: "", amount: "", date: format(new Date(), "yyyy-MM-dd"), status: "pending", projectId: "none", description: "" });

function downloadCSVTemplate() {
  const headers = ["title", "category", "subCategory", "amount", "date", "status", "description"];
  const example = ["Office Chairs", "Office Supplies", "Furniture", "15000", "2024-01-15", "pending", "Ergonomic chairs for team"];
  const csv = [headers.join(","), example.join(",")].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "expenses_template.csv"; a.click();
  URL.revokeObjectURL(url);
}

function handleImportCSV(file: File, onCreate: (data: any) => void, toast: any) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target?.result as string;
    const lines = text.split("\n").filter(l => l.trim());
    const headers = lines[0].split(",").map(h => h.trim());
    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(",").map(v => v.trim());
      const row: any = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || ""; });
      if (row.title && row.amount) {
        onCreate({ ...row, amount: Number(row.amount), projectId: null });
        imported++;
      }
    }
    toast({ title: `Imported ${imported} expenses` });
  };
  reader.readAsText(file);
}

export default function Expenses() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [auditRecord, setAuditRecord] = useState<{ id: number; module: string; title: string } | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<any>(defaultForm());

  const { data: stats } = useGetExpenseStats();
  const { data: expensesData, isLoading } = useListExpenses({ 
    page, 
    limit: pageSize,
    ...(search && { search }),
    ...(categoryFilter !== "all" && { category: categoryFilter }),
    ...(statusFilter !== "all" && { status: statusFilter }),
    ...(dateFrom && { fromDate: dateFrom }),
    ...(dateTo && { toDate: dateTo })
  });
  const { data: projectsData } = useListProjects({ page: 1, limit: 100 });
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();

  const filtered = (expensesData?.data || []).filter((e: any) => {
    const matchSearch = !search || e.title.toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === "all" || e.category === categoryFilter;
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    const matchFrom = !dateFrom || e.date >= dateFrom;
    const matchTo = !dateTo || e.date <= dateTo;
    return matchSearch && matchCat && matchStatus && matchFrom && matchTo;
  });

  const openCreate = () => { setEditingExpense(null); setForm(defaultForm()); setDialogOpen(true); };
  const openEdit = (e: any) => {
    setEditingExpense(e);
    setForm({
      title: e.title || "",
      category: e.category || "Miscellaneous",
      subCategory: e.subCategory || "",
      amount: e.amount || "",
      date: e.date || format(new Date(), "yyyy-MM-dd"),
      status: e.status || "pending",
      projectId: e.projectId ? String(e.projectId) : "none",
      description: e.description || ""
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!validateRequiredFields(form, { title: "Title", amount: "Amount" })) { toast({ title: "Title and amount required", variant: "destructive" }); return; }
    if (Number(form.amount) <= 0) {
      showInlineFieldErrors([{ field: "amount", message: "Amount must be greater than zero." }]);
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    const projectIdVal = form.projectId === "none" ? null : (form.projectId ? Number(form.projectId) : null);
    const payload = { ...form, amount: Number(form.amount), projectId: projectIdVal };
    try {
      if (editingExpense) {
        await updateExpense.mutateAsync({ id: editingExpense.id, data: payload });
        toast({ title: "Expense updated" });
      } else {
        await createExpense.mutateAsync({ data: payload });
        toast({ title: "Expense created" });
      }
      queryClient.invalidateQueries({ queryKey: getListExpensesQueryKey() });
      setPage(1);
      setDialogOpen(false);
    } catch { toast({ title: "Failed to save expense", variant: "destructive" }); }
    finally { setIsSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteExpense.mutateAsync({ id: deleteId });
      queryClient.invalidateQueries({ queryKey: getListExpensesQueryKey() });
      setPage(1);
      toast({ title: "Expense deleted" });
      setDeleteId(null);
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  };

  const statusBadge = (s: string) => {
    const m: Record<string, string> = { approved: "bg-green-100 text-green-700", pending: "bg-yellow-100 text-yellow-700", rejected: "bg-red-100 text-red-700" };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m[s] || "bg-gray-100 text-gray-700"}`}>{s || "—"}</span>;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Track and manage business expenses"
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={downloadCSVTemplate}><Download className="w-4 h-4 mr-2" />CSV Template</Button>
            <label>
              <Button variant="outline" size="sm" asChild>
                <span><Upload className="w-4 h-4 mr-2" />Import CSV</span>
              </Button>
              <input type="file" accept=".csv" className="hidden" onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleImportCSV(file, (data) => createExpense.mutateAsync({ data }), toast);
                e.target.value = "";
              }} />
            </label>
            <Button variant="outline" size="sm"><FileDown className="w-4 h-4 mr-2" />Export</Button>
            <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Add Expense</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard label="This Month" value={fmtINR(stats?.totalThisMonth || 0)} icon={Receipt} bg="bg-red-600" />
        <MetricCard label="This Year" value={fmtINR(stats?.totalThisYear || 0)} icon={TrendingDown} bg="bg-blue-600" />
        <MetricCard label="Pending Approval" value={fmtINR(stats?.pendingApproval || 0)} icon={Clock} bg="bg-amber-500" />
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search expenses..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <Select value={categoryFilter} onValueChange={(val) => { setCategoryFilter(val); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
          <Input type="date" className="w-36 h-9 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" className="w-36 h-9 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          {(dateFrom || dateTo) && <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setDateFrom(""); setDateTo(""); }}>Clear</Button>}
        </div>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <AuditLogDialog
          open={!!auditRecord}
          onOpenChange={(open) => { if (!open) setAuditRecord(null); }}
          module="expenses"
          recordId={auditRecord?.id}
          recordName={auditRecord?.title}
        />
        <Table>
          <TableHeader><TableRow>
            <TableHead>Title</TableHead><TableHead>Category</TableHead><TableHead>Date</TableHead>
            <TableHead className="text-right">Amount</TableHead><TableHead>Submitted By</TableHead>
            <TableHead>Status</TableHead><TableHead>Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : filtered.map((e: any) => (
              <TableRow key={e.id} className="hover:bg-muted/20">
                <TableCell className="font-medium">{e.title}</TableCell>
                <TableCell><span className="text-xs">{e.category}{e.subCategory ? ` › ${e.subCategory}` : ""}</span></TableCell>
                <TableCell className="text-muted-foreground text-sm">{e.date}</TableCell>
                <TableCell className="text-right font-semibold">{fmtINR(e.amount)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.submittedBy}</TableCell>
                <TableCell>{statusBadge(e.status)}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setAuditRecord({ id: e.id, module: "expenses", title: e.title || "Expense" })}><History size={13} /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(e)}><Edit size={13} /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteId(e.id)}><Trash2 size={13} /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No expenses found</TableCell></TableRow>}
          </TableBody>
        </Table>
        <Pagination page={page} totalPages={expensesData?.pagination?.totalPages || 1} onPageChange={setPage} pageSize={pageSize} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setEditingExpense(null); setForm(defaultForm()); } setDialogOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingExpense ? "Edit Expense" : "Add Expense"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-2"><Label>Title *</Label><Input name="title" value={form.title} onChange={e => setForm((f: any) => ({ ...f, title: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category || "Miscellaneous"} onValueChange={v => setForm((f: any) => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Sub-Category</Label><Input value={form.subCategory} onChange={e => setForm((f: any) => ({ ...f, subCategory: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Amount (₹) *</Label><Input name="amount" type="number" min={0.01} step="0.01" value={form.amount} onChange={e => setForm((f: any) => ({ ...f, amount: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Date</Label><Input name="date" type="date" value={form.date} onChange={e => setForm((f: any) => ({ ...f, date: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status || "pending"} onValueChange={v => setForm((f: any) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Project (optional)</Label>
              <Select value={form.projectId || "none"} onValueChange={v => setForm((f: any) => ({ ...f, projectId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select project..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {(projectsData?.data || []).map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>{isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}{editingExpense ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Expense?</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
