import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListEmployees, useListProjects } from "@workspace/api-client-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/MetricCard";
import { Clock, IndianRupee, Users } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Pagination } from "@/components/Pagination";
import { useApiClient } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { downloadRowsAsCsv, openRowsPdfPrint } from "@/lib/export-utils";
import { Download, Edit, FileText, Plus, Search, Trash2 } from "lucide-react";

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const fmtMoney = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);

export default function Overtime() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [month, setMonth] = useState(currentMonth());
  const [search, setSearch] = useState("");
  const [employeeId, setEmployeeId] = useState("all");
  const [projectId, setProjectId] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [formEmployeeId, setFormEmployeeId] = useState("");
  const [formProjectId, setFormProjectId] = useState("");

  const { data: employeesData } = useListEmployees({ page: 1, limit: 300 });
  const { data: projectsData } = useListProjects({ page: 1, limit: 300 });
  const employees = employeesData?.data || [];
  const projects = projectsData?.data || [];

  const query = useQuery({
    queryKey: ["overtime", page, pageSize, month, search, employeeId, projectId],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize), month });
      if (search) params.set("search", search);
      if (employeeId !== "all") params.set("employeeId", employeeId);
      if (projectId !== "all") params.set("projectId", projectId);
      return apiClient.get(`/overtime?${params.toString()}`).then(r => r.data);
    },
  });

  const rows = query.data?.data || [];
  const exportColumns = [
    { header: "Employee", value: (row: any) => row.employeeName },
    { header: "Project", value: (row: any) => row.projectName || "-" },
    { header: "Date", value: (row: any) => row.workDate },
    { header: "Hours", value: (row: any) => row.hours },
    { header: "Rate", value: (row: any) => row.hourlyRate },
    { header: "Amount", value: (row: any) => row.amount },
    { header: "Proof", value: (row: any) => row.proofUrl || "-" },
  ];

  const totals = useMemo(() => rows.reduce((acc: any, row: any) => ({ hours: acc.hours + Number(row.hours || 0), amount: acc.amount + Number(row.amount || 0) }), { hours: 0, amount: 0 }), [rows]);

  const saveMutation = useMutation({
    mutationFn: (payload: any) => editing ? apiClient.put(`/overtime/${editing.id}`, payload) : apiClient.post("/overtime", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overtime"] });
      toast({ title: editing ? "Overtime updated" : "Overtime recorded" });
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (err: any) => toast({ title: "Save failed", description: err?.message || "Unable to save overtime", variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/overtime/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overtime"] });
      toast({ title: "Overtime deleted" });
    },
  });

  const openNew = () => {
    setEditing(null);
    setFormEmployeeId("");
    setFormProjectId("");
    setDialogOpen(true);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    saveMutation.mutate({
      employeeId: Number(form.get("employeeId")),
      projectId: formProjectId || undefined,
      workDate: form.get("workDate"),
      hours: Number(form.get("hours")),
      proofUrl: form.get("proofUrl"),
      notes: form.get("notes"),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Overtime Records" description="Record project-wise overtime and add it to payroll automatically" actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => openRowsPdfPrint("Overtime Records", rows, exportColumns)}><FileText className="h-4 w-4 mr-2" />PDF</Button>
          <Button variant="outline" size="sm" onClick={() => downloadRowsAsCsv(`overtime-${month}.csv`, rows, exportColumns)}><Download className="h-4 w-4 mr-2" />Excel</Button>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add Overtime</Button>
        </div>
      } />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard label="Overtime Hours" value={`${totals.hours} hrs`} icon={Clock} bg="bg-sky-600" />
        <MetricCard label="Total Payout" value={fmtMoney(totals.amount)} icon={IndianRupee} bg="bg-emerald-600" />
        <MetricCard label="Overtime Records" value={rows.length} icon={Users} bg="bg-violet-600" />
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          <Input type="month" value={month} onChange={e => { setMonth(e.target.value); setPage(1); }} />
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search employee/project..." className="pl-9" />
          </div>
          <Select value={employeeId} onValueChange={v => { setEmployeeId(v); setPage(1); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent searchable><SelectItem value="all">All employees</SelectItem>{employees.map((e: any) => <SelectItem key={e.id} value={String(e.id)} searchText={`${e.firstName} ${e.lastName}`}>{e.firstName} {e.lastName}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={projectId} onValueChange={v => { setProjectId(v); setPage(1); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent searchable><SelectItem value="all">All projects</SelectItem>{projects.map((p: any) => <SelectItem key={p.id} value={String(p.id)} searchText={p.name}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">Total: {totals.hours} hrs / {fmtMoney(totals.amount)}</div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Project</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Hours</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Proof</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length ? rows.map((row: any) => (
              <TableRow key={row.id}>
                <TableCell>{row.employeeName}</TableCell>
                <TableCell>{row.projectName || "-"}</TableCell>
                <TableCell>{row.workDate}</TableCell>
                <TableCell className="text-right">{row.hours}</TableCell>
                <TableCell className="text-right">{fmtMoney(row.amount)}</TableCell>
                <TableCell>{row.proofUrl ? <a className="text-primary underline" href={row.proofUrl} target="_blank">View</a> : "-"}</TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => { setEditing(row); setFormEmployeeId(String(row.employeeId)); setFormProjectId(row.projectId ? String(row.projectId) : ""); setDialogOpen(true); }}><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(row.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></TableCell>
              </TableRow>
            )) : <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">{search ? "No overtime records found for this search." : "No overtime records available."}</TableCell></TableRow>}
          </TableBody>
        </Table>
        <Pagination page={page} totalPages={query.data?.pagination?.totalPages || 1} onPageChange={setPage} pageSize={pageSize} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Overtime" : "Add Overtime"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Employee</Label><input type="hidden" name="employeeId" value={formEmployeeId} /><Select value={formEmployeeId} onValueChange={setFormEmployeeId} required><SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger><SelectContent searchable>{employees.map((e: any) => <SelectItem key={e.id} value={String(e.id)} searchText={`${e.firstName} ${e.lastName}`}>{e.firstName} {e.lastName}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Project</Label><Select value={formProjectId || "none"} onValueChange={v => setFormProjectId(v === "none" ? "" : v)}><SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger><SelectContent searchable><SelectItem value="none">No project</SelectItem>{projects.map((p: any) => <SelectItem key={p.id} value={String(p.id)} searchText={p.name}>{p.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Date</Label><Input name="workDate" type="date" defaultValue={editing?.workDate || new Date().toISOString().slice(0, 10)} required /></div>
              <div className="space-y-2"><Label>Hours</Label><Input name="hours" type="number" min="0" step="0.25" defaultValue={editing?.hours || 1} required /></div>
              <div className="col-span-2 space-y-2"><Label>Proof URL</Label><Input name="proofUrl" defaultValue={editing?.proofUrl || ""} placeholder="Optional link or file path" /></div>
              <div className="col-span-2 space-y-2"><Label>Notes</Label><Textarea name="notes" defaultValue={editing?.notes || ""} /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={saveMutation.isPending}>Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
