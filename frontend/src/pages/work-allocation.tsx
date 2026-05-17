import { useState, useMemo } from "react";
import { useListCustomers, useListEmployees, useListProjects } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft, Users, Briefcase, History, UserCheck, Save, FileText, Download, Edit, Eye } from "lucide-react";
import { format } from "date-fns";
import { useApiClient } from "@/lib/api-client";
import { AuditLogDialog } from "@/components/audit/AuditLogDialog";
import { downloadRowsAsCsv, openRowsPdfPrint } from "@/lib/export-utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export default function WorkAllocation() {
  const { toast } = useToast();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  const [selectedProject, setSelectedProject] = useState<string>("none");
  const [selectedCustomer, setSelectedCustomer] = useState<string>("all");
  const [searchLeft, setSearchLeft] = useState("");
  const [searchRight, setSearchRight] = useState("");
  const [recordSearch, setRecordSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [activeTab, setActiveTab] = useState("allocate");
  const [selectedLeft, setSelectedLeft] = useState<Set<number>>(new Set());
  const [selectedRight, setSelectedRight] = useState<Set<number>>(new Set());
  const [allocations, setAllocations] = useState<Record<number, number[]>>({}); // projectId -> employeeIds
  const [isSaving, setIsSaving] = useState(false);
  const [auditRecord, setAuditRecord] = useState<{ id: number; title: string } | null>(null);

  const { data: employeesData } = useListEmployees({ page: 1, limit: 200, status: "active" });
  const { data: projectsData } = useListProjects({ page: 1, limit: 100 });
  const { data: customersData } = useListCustomers({ page: 1, limit: 200 });
  const { data: allAllocationData } = useQuery({
    queryKey: ["work-allocation-all"],
    queryFn: () => apiClient.get("/work-allocation/all").then(r => r.data),
  });

  const { data: allocationData, refetch: refetchAllocation } = useQuery({
    queryKey: ["work-allocation", selectedProject],
    queryFn: () => selectedProject !== "none"
      ? apiClient.get(`/work-allocation?projectId=${selectedProject}`).then(r => r.data)
      : Promise.resolve({ employeeIds: [] }),
    enabled: selectedProject !== "none",
  });

  const allEmployees = useMemo(() => employeesData?.data || [], [employeesData]);
  const visibleProjects = useMemo(() => (projectsData?.data || []).filter((project: any) => selectedCustomer === "all" || String(project.customerId || "") === selectedCustomer), [projectsData?.data, selectedCustomer]);
  const allocatedIds = useMemo(() => new Set(allocationData?.employeeIds || []), [allocationData]);
  const projectAllocated = useMemo(() => {
    const pid = Number(selectedProject);
    return allocations[pid] !== undefined ? new Set(allocations[pid]) : allocatedIds;
  }, [allocations, selectedProject, allocatedIds]);

  const globalAllocatedIds = useMemo(() => new Set((allAllocationData?.data || [])
    .map((row: any) => Number(row.employeeId))
    .filter(Boolean)
  ), [allAllocationData]);

  const availableEmployees = useMemo(() =>
    allEmployees.filter(e => !globalAllocatedIds.has(e.id) && !projectAllocated.has(e.id) &&
      (!searchLeft || `${e.firstName} ${e.lastName}`.toLowerCase().includes(searchLeft.toLowerCase()) ||
        e.department?.toLowerCase().includes(searchLeft.toLowerCase()))
    ), [allEmployees, projectAllocated, globalAllocatedIds, searchLeft]);

  const assignmentDateForRow = (row: any) => {
    const dateValue = row.assignedAt || row.createdAt || row.date;
    const parsed = dateValue ? new Date(dateValue) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  };

  const filteredAllocationRecords = useMemo(() => {
    return (allAllocationData?.data || []).filter((row: any) => {
      const search = recordSearch.trim().toLowerCase();
      const assignedDate = assignmentDateForRow(row);
      if (search) {
        const haystack = [row.customerName, row.projectName, row.employeeName, row.employeeCode, row.status]
          .filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (fromDate && assignedDate) {
        const start = new Date(fromDate);
        if (assignedDate < start) return false;
      }
      if (toDate && assignedDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        if (assignedDate > end) return false;
      }
      return true;
    });
  }, [allAllocationData, recordSearch, fromDate, toDate]);

  const allocationExportColumns = [
    { header: "Customer", value: (row: any) => row.customerName || "-" },
    { header: "Project", value: (row: any) => row.projectName || "-" },
    { header: "Employee", value: (row: any) => row.employeeName || "-" },
    { header: "Code", value: (row: any) => row.employeeCode || "-" },
    { header: "Status", value: (row: any) => row.status || "-" },
    { header: "Assigned Date", value: (row: any) => {
        const date = assignmentDateForRow(row);
        return date ? format(date, "dd MMM yyyy") : "-";
      }
    },
  ];

  const handleExportAllocationCsv = () => {
    if (!downloadRowsAsCsv(`allocation-records-${new Date().toISOString().slice(0, 10)}.csv`, filteredAllocationRecords, allocationExportColumns)) {
      toast({ title: "Export failed", variant: "destructive" });
      return;
    }
    toast({ title: "Excel exported", description: `${filteredAllocationRecords.length} allocation records downloaded.` });
  };

  const handleExportAllocationPdf = async () => {
    if (!(await openRowsPdfPrint("Allocation Records", filteredAllocationRecords, allocationExportColumns))) {
      toast({ title: "Export failed", variant: "destructive" });
      return;
    }
    toast({ title: "PDF exported", description: `${filteredAllocationRecords.length} allocation records downloaded.` });
  };

  const exportSingleAllocationCsv = (row: any) => {
    if (downloadRowsAsCsv(`allocation-${row.employeeCode || row.id}.csv`, [row], allocationExportColumns)) {
      toast({ title: "Excel exported", description: row.employeeName || "Allocation record downloaded." });
    }
  };

  const exportSingleAllocationPdf = async (row: any) => {
    if (await openRowsPdfPrint(`${row.employeeName || "Allocation"} Record`, [row], allocationExportColumns)) {
      toast({ title: "PDF exported", description: row.employeeName || "Allocation record downloaded." });
    } else {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const assignedEmployees = useMemo(() =>
    allEmployees.filter(e => projectAllocated.has(e.id) &&
      (!searchRight || `${e.firstName} ${e.lastName}`.toLowerCase().includes(searchRight.toLowerCase()) ||
        e.department?.toLowerCase().includes(searchRight.toLowerCase()))
    ), [allEmployees, projectAllocated, searchRight]);

  const moveToRight = () => {
    if (selectedLeft.size === 0) return;
    const pid = Number(selectedProject);
    const current = new Set(projectAllocated);
    selectedLeft.forEach(id => current.add(id));
    setAllocations(prev => ({ ...prev, [pid]: Array.from(current) as number[] }));
    setSelectedLeft(new Set());
  };

  const moveToLeft = () => {
    if (selectedRight.size === 0) return;
    const pid = Number(selectedProject);
    const current = new Set(projectAllocated);
    selectedRight.forEach(id => current.delete(id));
    setAllocations(prev => ({ ...prev, [pid]: Array.from(current) as number[] }));
    setSelectedRight(new Set());
  };

  const moveAllToRight = () => {
    const pid = Number(selectedProject);
    const current = new Set(projectAllocated);
    availableEmployees.forEach(e => current.add(e.id));
    setAllocations(prev => ({ ...prev, [pid]: Array.from(current) as number[] }));
    setSelectedLeft(new Set());
  };

  const moveAllToLeft = () => {
    const pid = Number(selectedProject);
    setAllocations(prev => ({ ...prev, [pid]: [] }));
    setSelectedRight(new Set());
  };

  const handleSave = async () => {
    if (selectedProject === "none") { toast({ title: "Please select a project", variant: "destructive" }); return; }
    const pid = Number(selectedProject);
    const employeeIds = allocations[pid] !== undefined ? allocations[pid] : Array.from(allocatedIds);
    setIsSaving(true);
    try {
      await apiClient.post("/work-allocation", { projectId: pid, employeeIds });
      queryClient.invalidateQueries({ queryKey: ["work-allocation"] });
      queryClient.invalidateQueries({ queryKey: ["work-allocation-all"] });
      toast({ title: `Work allocation saved (${employeeIds.length} employees assigned)` });
    } catch {
      toast({ title: "Failed to save allocation", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleLeft = (id: number) => {
    setSelectedLeft(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  };

  const toggleRight = (id: number) => {
    setSelectedRight(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  };

  const selectedProjectData = (projectsData?.data || []).find((p: any) => String(p.id) === selectedProject);

  const EmpCard = ({ emp, selected, onToggle, side }: { emp: any; selected: boolean; onToggle: () => void; side: "left" | "right" }) => (
    <div
      className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all select-none border ${
        selected
          ? "bg-primary/10 border-primary/40 shadow-sm ring-1 ring-primary/20"
          : "border-transparent hover:border-primary/30 hover:bg-[hsl(var(--table-row-hover))] hover:shadow-sm"
      }`}
      onClick={onToggle}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
        {emp.imageUrl ? (
          <img src={emp.imageUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          `${emp.firstName?.[0]}${emp.lastName?.[0]}`
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{emp.firstName} {emp.lastName}</p>
        <p className="text-xs text-muted-foreground truncate">{emp.designation || emp.department}</p>
      </div>
      <Badge variant="secondary" className="text-[10px] shrink-0">{emp.department}</Badge>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Allocation"
        description="Assign active employees to projects using the dual-panel selector"
        actions={
          <Button onClick={handleSave} disabled={isSaving || selectedProject === "none"} className="bg-green-600 hover:bg-green-700">
            <Save className="w-4 h-4 mr-2" />{isSaving ? "Saving..." : "Save Allocation"}
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Active Employees", value: allEmployees.length, icon: Users, bg: "bg-blue-600" },
          { label: "Active Projects", value: (projectsData?.data || []).length, icon: Briefcase, bg: "bg-emerald-600" },
          { label: "Assigned", value: assignedEmployees.length, icon: UserCheck, bg: "bg-violet-600" },
        ].map(({ label, value, icon, bg }) => (
          <MetricCard key={label} label={label} value={value} icon={icon} bg={bg} />
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-2 gap-2 rounded-full bg-muted/50 p-1">
          <TabsTrigger value="allocate" className="rounded-full data-[state=active]:bg-sky-600 data-[state=active]:text-white data-[state=active]:shadow-md">Allocate</TabsTrigger>
          <TabsTrigger value="records" className="rounded-full data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md">Records</TabsTrigger>
        </TabsList>

        <TabsContent value="allocate" className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <History className="w-5 h-5 text-muted-foreground" />
              <Select value={selectedCustomer} onValueChange={v => { setSelectedCustomer(v); setSelectedProject("none"); setSelectedLeft(new Set()); setSelectedRight(new Set()); }}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Select customer..." />
                </SelectTrigger>
                <SelectContent searchable>
                  <SelectItem value="all">All customers</SelectItem>
                  {(customersData?.data || []).map((customer: any) => (
                    <SelectItem key={customer.id} value={String(customer.id)}>{customer.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedProject} onValueChange={v => { setSelectedProject(v); setSelectedLeft(new Set()); setSelectedRight(new Set()); }}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Select a project to allocate..." />
                </SelectTrigger>
                <SelectContent searchable>
                  <SelectItem value="none">— Select Project —</SelectItem>
                  {visibleProjects.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)} searchText={`${p.name} ${p.status}`}>
                      <div className="flex items-center gap-2">
                        <span>{p.name}</span>
                        <Badge variant="outline" className="text-[10px]">{p.status}</Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedProjectData && (
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{selectedProjectData.name}</span>
                <span className="mx-2">·</span>
                <span>{assignedEmployees.length} assigned</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 items-start">
            <Card className="border">
              <CardHeader className="pb-3 pt-4 px-4">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2"><Users size={14} />Available Employees</span>
                  <Badge variant="secondary">{availableEmployees.length}</Badge>
                </CardTitle>
                <div className="relative mt-2">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <Input placeholder="Search..." value={searchLeft} onChange={e => setSearchLeft(e.target.value)} className="pl-8 h-8 text-sm" />
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="h-[400px] overflow-y-auto space-y-1 pr-1">
                  {availableEmployees.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                      {selectedProject === "none" ? "Select a project first" : "No free employees available"}
                    </div>
                  ) : availableEmployees.map(emp => (
                    <EmpCard key={emp.id} emp={emp} selected={selectedLeft.has(emp.id)} onToggle={() => toggleLeft(emp.id)} side="left" />
                  ))}
                </div>
                {selectedLeft.size > 0 && (
                  <div className="mt-2 text-xs text-muted-foreground text-center">{selectedLeft.size} selected</div>
                )}
              </CardContent>
            </Card>

            <div className="flex lg:flex-col gap-2 items-center justify-center py-4 lg:py-16">
              <Button
                variant="outline" size="icon" className="h-9 w-9"
                onClick={moveAllToRight} disabled={selectedProject === "none" || availableEmployees.length === 0}
                title="Assign all"
              >
                <ChevronsRight className="w-4 h-4" />
              </Button>
              <Button
                variant="default" size="icon" className="h-9 w-9"
                onClick={moveToRight} disabled={selectedLeft.size === 0 || selectedProject === "none"}
                title="Assign selected"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                variant="default" size="icon" className="h-9 w-9"
                onClick={moveToLeft} disabled={selectedRight.size === 0 || selectedProject === "none"}
                title="Remove selected"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline" size="icon" className="h-9 w-9"
                onClick={moveAllToLeft} disabled={selectedProject === "none" || assignedEmployees.length === 0}
                title="Remove all"
              >
                <ChevronsLeft className="w-4 h-4" />
              </Button>
            </div>

            <Card className="border">
              <CardHeader className="pb-3 pt-4 px-4">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2"><UserCheck size={14} />Assigned to Project</span>
                  <Badge className="bg-green-100 text-green-700">{assignedEmployees.length}</Badge>
                </CardTitle>
                <div className="relative mt-2">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <Input placeholder="Search..." value={searchRight} onChange={e => setSearchRight(e.target.value)} className="pl-8 h-8 text-sm" />
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="h-[400px] overflow-y-auto space-y-1 pr-1">
                  {assignedEmployees.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                      <UserCheck size={32} className="opacity-30" />
                      <span className="text-sm">No employees assigned yet</span>
                      <span className="text-xs">Use the arrows to assign employees</span>
                    </div>
                  ) : assignedEmployees.map(emp => (
                    <EmpCard key={emp.id} emp={emp} selected={selectedRight.has(emp.id)} onToggle={() => toggleRight(emp.id)} side="right" />
                  ))}
                </div>
                {selectedRight.size > 0 && (
                  <div className="mt-2 text-xs text-muted-foreground text-center">{selectedRight.size} selected</div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground flex items-center gap-2">
            <span>💡 Click to select multiple employees, then use arrows to move them between panels. Press Save to apply.</span>
          </div>
        </TabsContent>

        <TabsContent value="records" className="space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_auto] items-end">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Search records</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 w-3.5 h-3.5 text-muted-foreground" />
                <Input placeholder="Search customer, project, employee..." value={recordSearch} onChange={e => setRecordSearch(e.target.value)} className="pl-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">From date</label>
                <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">To date</label>
                <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={handleExportAllocationCsv}><Download className="w-4 h-4 mr-2" />Export Excel</Button>
              <Button variant="outline" size="sm" onClick={handleExportAllocationPdf}><FileText className="w-4 h-4 mr-2" />Export PDF</Button>
            </div>
          </div>

          <Card className="border">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Allocation Records</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2">Customer</th>
                    <th>Project</th>
                    <th>Employee</th>
                    <th>Code</th>
                    <th>Status</th>
                    <th>Assigned Date</th>
                    <th className="min-w-[220px] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAllocationRecords.length ? filteredAllocationRecords.map((row: any) => (
                    <tr key={row.id} className="border-b hover:bg-muted/70">
                      <td className="py-2">{row.customerName || "-"}</td>
                      <td>{row.projectName || "-"}</td>
                      <td>{row.employeeName}</td>
                      <td>{row.employeeCode || "-"}</td>
                      <td>{row.status || "-"}</td>
                      <td>{assignmentDateForRow(row) ? format(assignmentDateForRow(row) as Date, "dd MMM yyyy") : "-"}</td>
                      <td className="text-right">
                        <Button size="icon" variant="ghost" title="Audit history" onClick={() => row.projectId && setAuditRecord({ id: Number(row.projectId), title: `${row.projectName || "Project"} Allocation` })}><History className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" title="View allocation" onClick={() => toast({ title: row.employeeName || "Allocation", description: `${row.projectName || "-"} - ${row.customerName || "-"}` })}><Eye className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" title="Edit allocation" onClick={() => {
                          if (row.projectId) {
                            setSelectedProject(String(row.projectId));
                            setSelectedCustomer(row.customerId ? String(row.customerId) : "all");
                            setActiveTab("allocate");
                            setSelectedLeft(new Set());
                            setSelectedRight(new Set());
                          }
                        }}><Edit className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" title="Export this row as Excel" onClick={() => exportSingleAllocationCsv(row)}><Download className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" title="Export this row as PDF" onClick={() => void exportSingleAllocationPdf(row)}><FileText className="w-4 h-4" /></Button>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No allocation records matching your filters.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <AuditLogDialog
        open={!!auditRecord}
        onOpenChange={(open) => !open && setAuditRecord(null)}
        module="work_allocation"
        recordId={auditRecord?.id}
        recordName={auditRecord?.title}
      />
    </div>
  );
}
