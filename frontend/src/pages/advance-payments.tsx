import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useListEmployees } from "@workspace/api-client-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Pagination } from "@/components/Pagination";
import { MetricCard } from "@/components/MetricCard";
import { useApiClient } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { downloadRowsAsCsv, openRowsPdfPrint } from "@/lib/export-utils";
import { Clock, Download, Edit, FileText, Plus, Search, Trash2, Users, IndianRupee } from "lucide-react";

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const fmtMoney = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);

export default function AdvancePayments() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [month, setMonth] = useState(currentMonth());
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [formEmployeeId, setFormEmployeeId] = useState("");
  const [formStatus, setFormStatus] = useState("pending");
  const { data: employeesData } = useListEmployees({ page: 1, limit: 300 });
  const employees = employeesData?.data || [];

  const query = useQuery({
    queryKey: ["advance-payments", page, pageSize, month, search],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize), month });
      if (search) params.set("search", search);
      return apiClient.get(`/advance-payments?${params.toString()}`).then(r => r.data);
    },
  });
  const rows = query.data?.data || [];
  const totals = rows.reduce((acc: any, row: any) => ({ amount: acc.amount + Number(row.amount || 0), pending: acc.pending + (row.status === "pending" ? 1 : 0) }), { amount: 0, pending: 0 });
  const exportColumns = [
    { header: "Employee", value: (row: any) => row.employeeName },
    { header: "Payment Date", value: (row: any) => row.paymentDate },
    { header: "Deduction Month", value: (row: any) => row.deductionMonth },
    { header: "Amount", value: (row: any) => row.amount },
    { header: "Mode", value: (row: any) => row.paymentMode || "-" },
    { header: "Reference", value: (row: any) => row.referenceNo || "-" },
    { header: "Status", value: (row: any) => row.status },
  ];
  const saveMutation = useMutation({
    mutationFn: (payload: any) => editing ? apiClient.put(`/advance-payments/${editing.id}`, payload) : apiClient.post("/advance-payments", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advance-payments"] });
      toast({ title: editing ? "Advance payment updated" : "Advance payment recorded" });
      setDialogOpen(false);
      setEditing(null);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/advance-payments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advance-payments"] });
      toast({ title: "Advance payment deleted" });
    },
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    saveMutation.mutate({
      employeeId: Number(form.get("employeeId")),
      paymentDate: form.get("paymentDate"),
      deductionMonth: form.get("deductionMonth"),
      amount: Number(form.get("amount")),
      paymentMode: form.get("paymentMode"),
      referenceNo: form.get("referenceNo"),
      status: formStatus,
      notes: form.get("notes"),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Advance Payments" description="Maintain employee advances and deduct them from current-month payslips" actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => openRowsPdfPrint("Advance Payments", rows, exportColumns)}><FileText className="h-4 w-4 mr-2" />PDF</Button>
          <Button variant="outline" size="sm" onClick={() => downloadRowsAsCsv(`advance-payments-${month}.csv`, rows, exportColumns)}><Download className="h-4 w-4 mr-2" />Excel</Button>
          <Button size="sm" onClick={() => { setEditing(null); setFormEmployeeId(""); setFormStatus("pending"); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />Add Advance</Button>
        </div>
      } />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard label="Advance Total" value={`₹${totals.amount.toLocaleString('en-IN')}`} icon={IndianRupee} bg="bg-amber-500" />
        <MetricCard label="Pending Advances" value={`${totals.pending}`} icon={Clock} bg="bg-sky-600" />
        <MetricCard label="Advance Records" value={rows.length} icon={Users} bg="bg-violet-600" />
      </div>
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input type="month" value={month} onChange={e => { setMonth(e.target.value); setPage(1); }} />
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search employee/reference..." className="pl-9" />
          </div>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Payment Date</TableHead><TableHead>Deduction Month</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Mode</TableHead><TableHead>Reference</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length ? rows.map((row: any) => (
              <TableRow key={row.id}>
                <TableCell>{row.employeeName}</TableCell>
                <TableCell>{row.paymentDate}</TableCell>
                <TableCell>{row.deductionMonth}</TableCell>
                <TableCell className="text-right">{fmtMoney(row.amount)}</TableCell>
                <TableCell>{row.paymentMode || "-"}</TableCell>
                <TableCell>{row.referenceNo || "-"}</TableCell>
                <TableCell>{row.status}</TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => { setEditing(row); setFormEmployeeId(String(row.employeeId)); setFormStatus(row.status || "pending"); setDialogOpen(true); }}><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(row.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></TableCell>
              </TableRow>
            )) : <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">{search ? "No advance payments found for this search." : "No advance payments available."}</TableCell></TableRow>}
          </TableBody>
        </Table>
        <Pagination page={page} totalPages={query.data?.pagination?.totalPages || 1} onPageChange={setPage} pageSize={pageSize} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
      </Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Advance Payment" : "Add Advance Payment"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Employee</Label><input type="hidden" name="employeeId" value={formEmployeeId} /><Select value={formEmployeeId} onValueChange={setFormEmployeeId} required><SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger><SelectContent searchable>{employees.map((e: any) => <SelectItem key={e.id} value={String(e.id)} searchText={`${e.firstName} ${e.lastName}`}>{e.firstName} {e.lastName}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Amount</Label><Input name="amount" type="number" min="0" step="0.01" defaultValue={editing?.amount || ""} required /></div>
              <div className="space-y-2"><Label>Payment Date</Label><Input name="paymentDate" type="date" defaultValue={editing?.paymentDate || new Date().toISOString().slice(0, 10)} required /></div>
              <div className="space-y-2"><Label>Deduction Month</Label><Input name="deductionMonth" type="month" defaultValue={editing?.deductionMonth || month} required /></div>
              <div className="space-y-2"><Label>Mode</Label><Input name="paymentMode" defaultValue={editing?.paymentMode || ""} placeholder="Cash / Bank / UPI" /></div>
              <div className="space-y-2"><Label>Reference</Label><Input name="referenceNo" defaultValue={editing?.referenceNo || ""} /></div>
              <div className="space-y-2"><Label>Status</Label><Select value={formStatus} onValueChange={setFormStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="deducted">Deducted</SelectItem></SelectContent></Select></div>
              <div className="col-span-2 space-y-2"><Label>Notes</Label><Textarea name="notes" defaultValue={editing?.notes || ""} /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={saveMutation.isPending}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
