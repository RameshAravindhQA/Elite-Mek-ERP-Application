import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListLeaves, useCreateLeave, useUpdateLeave, useDeleteLeave, useListEmployees, getListLeavesQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { Download, FileText, Plus, Check, X, Trash, Loader2, CalendarOff, Search, Clock, History } from "lucide-react";
import { Pagination } from "@/components/Pagination";
import { downloadRowsAsCsv, openRowsPdfPrint } from "@/lib/export-utils";
import { AuditLogDialog } from "@/components/audit/AuditLogDialog";

export default function Leaves() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState("all");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<any>(null);
  const [auditRecord, setAuditRecord] = useState<{ id: number; title: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [search, setSearch] = useState("");

  const { data: leavesData, isLoading } = useListLeaves({ 
    page, 
    limit: pageSize,
    ...(search && { search }),
    ...(status !== "all" && { status })
  });
  const { data: employeesData } = useListEmployees({ page: 1, limit: 100 });
  const createMutation = useCreateLeave();
  const updateMutation = useUpdateLeave();
  const deleteMutation = useDeleteLeave();

  const filtered = (leavesData?.data || []).filter((l: any) => status === "all" || l.status === status);
  const pendingCount = (leavesData?.data || []).filter((l: any) => l.status === "pending").length;
  const approvedCount = (leavesData?.data || []).filter((l: any) => l.status === "approved").length;
  const rejectedCount = (leavesData?.data || []).filter((l: any) => l.status === "rejected").length;
  const exportColumns = [
    { header: "Employee", value: (leave: any) => leave.employeeName || leave.employeeId || "-" },
    { header: "Leave Type", value: (leave: any) => leave.leaveType || "-" },
    { header: "Start Date", value: (leave: any) => leave.startDate || "-" },
    { header: "End Date", value: (leave: any) => leave.endDate || "-" },
    { header: "Days", value: (leave: any) => leave.days || 0 },
    { header: "Status", value: (leave: any) => leave.status || "-" },
    { header: "Reason", value: (leave: any) => leave.reason || "-" },
  ];
  const handleExportPDF = async () => {
    if (!(await openRowsPdfPrint("Leaves", filtered, exportColumns))) {
      toast({ title: "Export failed", description: "No leave data available.", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Leaves PDF view opened." });
  };
  const handleExportExcel = () => {
    if (!downloadRowsAsCsv("leaves.csv", filtered, exportColumns)) {
      toast({ title: "Export failed", description: "No leave data available.", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Leaves Excel file downloaded." });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const data = {
      employeeId: Number(fd.get("employeeId")),
      leaveType: fd.get("leaveType") as string,
      startDate: fd.get("startDate") as string,
      endDate: fd.get("endDate") as string,
      reason: fd.get("reason") as string,
      days: "1",
    };
    try {
      await createMutation.mutateAsync({ data });
      queryClient.invalidateQueries({ queryKey: getListLeavesQueryKey() });
      toast({ title: "Leave request submitted" });
      setIsAddOpen(false);
    } catch {
      toast({ title: "Failed to submit leave", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await updateMutation.mutateAsync({ id, data: { status: "approved", approvedBy: "HR Manager" } });
      queryClient.invalidateQueries({ queryKey: getListLeavesQueryKey() });
      toast({ title: "Leave approved" });
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  };

  const handleReject = async (id: number) => {
    try {
      await updateMutation.mutateAsync({ id, data: { status: "rejected" } });
      queryClient.invalidateQueries({ queryKey: getListLeavesQueryKey() });
      toast({ title: "Leave rejected" });
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  };

  const handleDelete = async () => {
    if (!selectedLeave) return;
    try {
      await deleteMutation.mutateAsync({ id: selectedLeave.id });
      queryClient.invalidateQueries({ queryKey: getListLeavesQueryKey() });
      toast({ title: "Leave deleted" });
      setIsDeleteOpen(false);
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  };

  const getStatusBadge = (s: string) => {
    const map: Record<string, string> = { pending: "bg-yellow-100 text-yellow-700 border-yellow-200", approved: "bg-green-100 text-green-700 border-green-200", rejected: "bg-red-100 text-red-700 border-red-200" };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${map[s] || "bg-gray-100 text-gray-700"}`}>{s}</span>;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave Management"
        description="Manage employee leave requests and approvals"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportPDF}><FileText className="w-4 h-4 mr-2" />PDF</Button>
            <Button variant="outline" size="sm" onClick={handleExportExcel}><Download className="w-4 h-4 mr-2" />Excel</Button>
            <Button size="sm" onClick={() => setIsAddOpen(true)}><Plus className="w-4 h-4 mr-2" />New Request</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Total Requests" value={leavesData?.pagination?.total || filtered.length} icon={CalendarOff} bg="bg-blue-600" />
        <MetricCard label="Pending" value={pendingCount} icon={Clock} bg="bg-amber-500" />
        <MetricCard label="Approved" value={approvedCount} icon={Check} bg="bg-emerald-600" />
        <MetricCard label="Rejected" value={rejectedCount} icon={X} bg="bg-red-600" />
      </div>

      {pendingCount > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-4 flex items-center gap-3">
            <CalendarOff className="text-yellow-600" size={20} />
            <span className="text-sm font-medium text-yellow-800">{pendingCount} leave request{pendingCount > 1 ? "s" : ""} pending approval</span>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search leaves..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(pageSize)} onValueChange={(val) => { setPageSize(Number(val)); setPage(1); }}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Rows" /></SelectTrigger>
          <SelectContent>
            {[5, 10, 25, 50, 100].map((size) => (
              <SelectItem key={size} value={String(size)}>{size} rows</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Employee</TableHead>
              <TableHead>Leave Type</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead className="text-center">Days</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No leave records found</TableCell></TableRow>
            ) : filtered.map((leave: any) => (
              <TableRow key={leave.id} className="hover:bg-muted/20">
                <TableCell className="font-medium">{leave.employeeName}</TableCell>
                <TableCell>{leave.leaveType}</TableCell>
                <TableCell>{leave.startDate}</TableCell>
                <TableCell>{leave.endDate}</TableCell>
                <TableCell className="text-center font-medium">{leave.days}</TableCell>
                <TableCell className="text-muted-foreground max-w-[200px] truncate">{leave.reason}</TableCell>
                <TableCell>{getStatusBadge(leave.status)}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {leave.status === "pending" && (
                      <>
                        <Button size="sm" variant="ghost" className="text-green-600 h-7 w-7 p-0" onClick={() => handleApprove(leave.id)}><Check size={14} /></Button>
                        <Button size="sm" variant="ghost" className="text-red-600 h-7 w-7 p-0" onClick={() => handleReject(leave.id)}><X size={14} /></Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setAuditRecord({ id: leave.id, title: `${leave.employeeName || "Leave"} - ${leave.leaveType || ""}` })}><History size={14} /></Button>
                    <Button size="sm" variant="ghost" className="text-red-500 h-7 w-7 p-0" onClick={() => { setSelectedLeave(leave); setIsDeleteOpen(true); }}><Trash size={14} /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination page={page} totalPages={leavesData?.pagination?.totalPages || 1} onPageChange={setPage} />
      </div>

      <AuditLogDialog
        open={!!auditRecord}
        onOpenChange={(open) => { if (!open) setAuditRecord(null); }}
        module="leaves"
        recordId={auditRecord?.id}
        recordName={auditRecord?.title}
      />

      {/* Add Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Leave Request</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select name="employeeId" required>
                <SelectTrigger><SelectValue placeholder="Select employee..." /></SelectTrigger>
                <SelectContent>
                  {(employeesData?.data || []).map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.firstName} {e.lastName} ({e.employeeId})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Leave Type</Label>
              <Select name="leaveType" required>
                <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                <SelectContent>
                  {["Sick Leave", "Casual Leave", "Earned Leave", "Emergency Leave", "Maternity Leave", "Paternity Leave", "Absence", "Unpaid Absence"].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>From Date</Label><Input name="startDate" type="date" required /></div>
              <div className="space-y-2"><Label>To Date</Label><Input name="endDate" type="date" required /></div>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea name="reason" placeholder="Describe the reason for leave..." required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Submit</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Leave Request?</AlertDialogTitle><AlertDialogDescription>This will permanently remove this leave record.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
