import { useState, useRef } from "react";
import { useListProjects, useCreateProject, useUpdateProject, useDeleteProject, useGetProjectStats, useListCustomers, useListEmployees, getListProjectsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Plus, Search, Download, Upload, Edit, Trash2, Grid, List, Briefcase, DollarSign, CheckCircle, Clock, ImageIcon, MoreVertical, History } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Pagination } from "@/components/Pagination";
import { format } from "date-fns";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AuditLogDialog } from "@/components/audit/AuditLogDialog";

const fmtINR = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

const defaultForm = () => ({
  name: "", description: "", status: "active", priority: "medium",
  budget: "", startDate: "", endDate: "", customerId: "none", managerId: "none", progress: 0, imageUrl: ""
});

function downloadCSVTemplate() {
  const headers = ["name","description","status","priority","budget","startDate","endDate","progress"];
  const example = ["Website Redesign","Full website overhaul","active","high","500000","2024-01-01","2024-06-30","25"];
  const csv = [headers.join(","), example.join(",")].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "projects_template.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function Projects() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [view, setView] = useState<"table" | "card">("card");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [auditRecord, setAuditRecord] = useState<{ id: number; module: string; title: string } | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<any>(defaultForm());
  const [imagePreview, setImagePreview] = useState<string>("");

  const { data: stats } = useGetProjectStats();
  const { data: projectsData, isLoading } = useListProjects({ 
    page, 
    limit: pageSize,
    ...(search && { search }),
    ...(statusFilter !== "all" && { status: statusFilter }),
    ...(priorityFilter !== "all" && { priority: priorityFilter })
  });
  const { data: customersData } = useListCustomers({ page: 1, limit: 100 });
  const { data: employeesData } = useListEmployees({ page: 1, limit: 100 });
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const filtered = (projectsData?.data || []).filter((p: any) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    const matchPriority = priorityFilter === "all" || p.priority === priorityFilter;
    return matchSearch && matchStatus && matchPriority;
  });

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      setImagePreview(base64);
      setForm((f: any) => ({ ...f, imageUrl: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const openCreate = () => {
    setEditingProject(null);
    setForm(defaultForm());
    setImagePreview("");
    setDialogOpen(true);
  };

  const openEdit = (p: any) => {
    setEditingProject(p);
    setForm({
      name: p.name, description: p.description || "", status: p.status, priority: p.priority,
      budget: p.budget || "", startDate: p.startDate || "", endDate: p.endDate || "",
      customerId: p.customerId ? String(p.customerId) : "none",
      managerId: p.managerId ? String(p.managerId) : "none",
      progress: p.progress, imageUrl: p.imageUrl || ""
    });
    setImagePreview(p.imageUrl || "");
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name) { toast({ title: "Project name required", variant: "destructive" }); return; }
    setIsSubmitting(true);
    const payload = {
      ...form,
      budget: form.budget ? Number(form.budget) : null,
      customerId: form.customerId !== "none" && form.customerId ? Number(form.customerId) : null,
      managerId: form.managerId !== "none" && form.managerId ? Number(form.managerId) : null,
      progress: Number(form.progress)
    };
    try {
      if (editingProject) {
        await updateProject.mutateAsync({ id: editingProject.id, data: payload });
        toast({ title: "Project updated" });
      } else {
        await createProject.mutateAsync({ data: payload });
        toast({ title: "Project created" });
      }
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      setPage(1);
      setDialogOpen(false);
    } catch { toast({ title: "Failed to save project", variant: "destructive" }); }
    finally { setIsSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteProject.mutateAsync({ id: deleteId });
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      setPage(1);
      toast({ title: "Project deleted" });
      setDeleteId(null);
    } catch { toast({ title: "Failed to delete", variant: "destructive" }); }
  };

  const priorityColor = (p: string) => ({
    critical: "text-red-600 bg-red-50", high: "text-orange-600 bg-orange-50",
    medium: "text-yellow-600 bg-yellow-50", low: "text-green-600 bg-green-50"
  }[p] || "text-gray-600 bg-gray-50");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Project Management"
        description="Track projects, budgets, progress and tasks"
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={downloadCSVTemplate}><Download className="w-4 h-4 mr-2" />CSV Template</Button>
            <Button variant="outline" size="sm" onClick={() => setView(v => v === "card" ? "table" : "card")}>
              {view === "card" ? <List className="w-4 h-4 mr-2" /> : <Grid className="w-4 h-4 mr-2" />}
              {view === "card" ? "Table" : "Cards"}
            </Button>
            <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-2" />New Project</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total", value: stats?.total || 0, icon: Briefcase, bg: "bg-blue-600" },
          { label: "Active", value: stats?.active || 0, icon: Clock, bg: "bg-emerald-600" },
          { label: "Completed", value: stats?.completed || 0, icon: CheckCircle, bg: "bg-violet-600" },
          { label: "Total Budget", value: fmtINR(stats?.totalBudget || 0), icon: DollarSign, bg: "bg-orange-600" },
        ].map(({ label, value, icon, bg }) => (
          <MetricCard key={label} label={label} value={value} icon={icon} bg={bg} />
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search projects..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="planning">Planning</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(val) => { setPriorityFilter(val); setPage(1); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : view === "card" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((p: any) => (
            <Card key={p.id} className="overflow-hidden hover:shadow-lg transition-all duration-200 group border">
              <div className="relative h-40 bg-gradient-to-br from-primary/10 via-primary/5 to-background overflow-hidden">
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Briefcase size={40} className="text-primary/20" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                  <StatusBadge status={p.status} />
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${priorityColor(p.priority)}`}>{p.priority}</span>
                </div>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="secondary" size="icon" className="h-7 w-7 bg-white/90">
                        <MoreVertical className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(p)}><Edit className="w-4 h-4 mr-2" />Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600" onClick={() => setDeleteId(p.id)}><Trash2 className="w-4 h-4 mr-2" />Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <CardContent className="p-4">
                <h3 className="font-semibold text-sm leading-tight mb-1">{p.name}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{p.description}</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span className="font-medium text-foreground">{p.progress}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${p.progress >= 100 ? "bg-green-500" : p.progress >= 50 ? "bg-blue-500" : "bg-orange-400"}`} style={{ width: `${Math.min(p.progress, 100)}%` }} />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-3 pt-2 border-t">
                  <span>{p.startDate ? format(new Date(p.startDate), "dd MMM yy") : "—"} → {p.endDate ? format(new Date(p.endDate), "dd MMM yy") : "—"}</span>
                  {p.budget && <span className="font-medium text-foreground">{fmtINR(p.budget)}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-3 text-center py-16 text-muted-foreground">No projects found</div>
          )}
        </div>
      ) : (
        <div className="border rounded-lg bg-card overflow-hidden">
          <AuditLogDialog
            open={!!auditRecord}
            onOpenChange={(open) => { if (!open) setAuditRecord(null); }}
            module="projects"
            recordId={auditRecord?.id}
            recordName={auditRecord?.title}
          />
          <Table>
            <TableHeader><TableRow>
              <TableHead>Project</TableHead><TableHead>Status</TableHead><TableHead>Priority</TableHead>
              <TableHead className="text-right">Budget</TableHead><TableHead className="text-center">Progress</TableHead>
              <TableHead>Timeline</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((p: any) => (
                <TableRow key={p.id} className="hover:bg-muted/20">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt="" className="w-8 h-8 rounded object-cover border shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0"><Briefcase size={14} className="text-primary" /></div>
                      )}
                      <div>
                        <div className="font-medium text-sm">{p.name}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">{p.description}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${priorityColor(p.priority)}`}>{p.priority}</span></TableCell>
                  <TableCell className="text-right">{p.budget ? fmtINR(p.budget) : "—"}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center gap-2 justify-center">
                      <div className="h-1.5 w-20 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${p.progress}%` }} />
                      </div>
                      <span className="text-xs font-medium w-8">{p.progress}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.startDate || "—"} → {p.endDate || "TBD"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setAuditRecord({ id: p.id, module: "projects", title: p.name || "Project" })}><History size={13} /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(p)}><Edit size={13} /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteId(p.id)}><Trash2 size={13} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No projects found</TableCell></TableRow>}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={projectsData?.pagination?.totalPages || 1} onPageChange={setPage} pageSize={pageSize} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setEditingProject(null); setImagePreview(""); } setDialogOpen(open); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingProject ? "Edit Project" : "New Project"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Project Image</Label>
              <div
                className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary transition-colors relative overflow-hidden"
                style={{ height: imagePreview ? "auto" : "100px" }}
                onClick={() => photoInputRef.current?.click()}
              >
                {imagePreview ? (
                  <div className="relative">
                    <img src={imagePreview} alt="Preview" className="w-full h-32 object-cover rounded" />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded">
                      <span className="text-white text-sm font-medium">Click to change</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                    <ImageIcon size={24} />
                    <span className="text-sm">Click to upload project image</span>
                  </div>
                )}
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Project Name *</Label>
                <Input value={form.name} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="Project name..." />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))} className="min-h-[70px]" />
              </div>
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select value={form.customerId || "none"} onValueChange={v => setForm((f: any) => ({ ...f, customerId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select customer..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {(customersData?.data || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Manager</Label>
                <Select value={form.managerId || "none"} onValueChange={v => setForm((f: any) => ({ ...f, managerId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select manager..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {(employeesData?.data || []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.firstName} {e.lastName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm((f: any) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["planning","active","on_hold","completed","cancelled"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm((f: any) => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["critical","high","medium","low"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Budget (₹)</Label>
                <Input type="number" value={form.budget} onChange={e => setForm((f: any) => ({ ...f, budget: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Progress (%)</Label>
                <Input type="number" min={0} max={100} value={form.progress} onChange={e => setForm((f: any) => ({ ...f, progress: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm((f: any) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm((f: any) => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editingProject ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Project?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the project.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
