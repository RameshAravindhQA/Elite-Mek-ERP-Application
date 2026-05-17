import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListPayroll, useUpdatePayroll, useGetPayrollStats, useListEmployees, getListPayrollQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { Download, FileText, DollarSign, Clock, CheckCircle, Plus, Loader2, Zap, Users, TrendingUp, MessageCircle } from "lucide-react";
import { Pagination } from "@/components/Pagination";
import { getAuthHeaders, useApiClient } from "@/lib/api-client";
import { useMutation } from "@tanstack/react-query";
import { downloadRowsAsCsv, openRowsPdfPrint } from "@/lib/export-utils";

const fmtINR = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

export default function Payroll() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedSendEmployee, setSelectedSendEmployee] = useState("all");
  const [generateOpen, setGenerateOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [selectedPayroll, setSelectedPayroll] = useState<any>(null);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [excuseNotes, setExcuseNotes] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [isZipDownloading, setIsZipDownloading] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);

  const { data: stats } = useGetPayrollStats();
  const { data: payrollData, isLoading } = useListPayroll({ page, limit: pageSize, month });
  const { data: employeesData } = useListEmployees({ page: 1, limit: 100 });
  const updateMutation = useUpdatePayroll();

  const filteredData = (payrollData?.data || []).filter((p: any) =>
    statusFilter === "all" || p.status === statusFilter
  );
  const exportColumns = [
    { header: "Employee", value: (row: any) => row.employeeName || row.employeeId || "-" },
    { header: "Department", value: (row: any) => row.department || "-" },
    { header: "Month", value: (row: any) => row.month || month },
    { header: "Basic Salary", value: (row: any) => Number(row.basicSalary || 0) },
    { header: "Overtime", value: (row: any) => Number(row.overtimeAmount || 0) },
    { header: "Advance", value: (row: any) => Number(row.advanceDeduction || 0) },
    { header: "Net Salary", value: (row: any) => Number(row.netSalary || 0) },
    { header: "Status", value: (row: any) => row.status || "-" },
  ];
  const handleExportPDF = async () => {
    if (!(await openRowsPdfPrint("Payroll", filteredData, exportColumns))) {
      toast({ title: "Export failed", description: "No payroll data available.", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Payroll PDF view opened." });
  };
  const handleExportExcel = () => {
    if (!downloadRowsAsCsv("payroll.csv", filteredData, exportColumns)) {
      toast({ title: "Export failed", description: "No payroll data available.", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Payroll Excel file downloaded." });
  };

  const handleDownloadPayslipsZip = async () => {
    const payrollIds = (filteredData || []).map((row: any) => row.id).filter(Boolean);
    if (!payrollIds.length) {
      toast({ title: "No payslips to download", description: "Please generate payroll records first.", variant: "destructive" });
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      toast({ title: "Download failed", description: "Login is required to download ZIP.", variant: "destructive" });
      return;
    }

    setIsZipDownloading(true);
    try {
      const response = await fetch("/api/payroll/batch/download-zip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/zip",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({ payrollIds }),
      });

      if (!response.ok) {
        let errorMessage = `Unable to download ZIP (HTTP ${response.status})`;
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await response.json().catch(() => null);
          if (data?.error) errorMessage = data.error;
        }
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error("Downloaded ZIP was empty. Please regenerate payroll and try again.");
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("zip")) {
        throw new Error("Server did not return a ZIP file. Please try again.");
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `payslips-${month || "batch"}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const downloadedCount = Number(response.headers.get("x-payslip-count")) || payrollIds.length;
      toast({ title: "ZIP downloaded", description: `Downloaded ${downloadedCount} payslip(s).` });
    } catch (err: any) {
      toast({ title: "Failed to download ZIP", description: err?.message || "Please try again.", variant: "destructive" });
    } finally {
      setIsZipDownloading(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedEmployee) { toast({ title: "Please select an employee", variant: "destructive" }); return; }
    setIsGenerating(true);
    try {
      await apiClient.post("/payroll/generate", { employeeId: Number(selectedEmployee), month, excuseNotes });
      queryClient.invalidateQueries({ queryKey: getListPayrollQueryKey() });
      setPage(1);
      toast({ title: "Payroll generated successfully", description: `Payroll for ${month} computed from attendance data.` });
      setGenerateOpen(false);
      setSelectedEmployee("");
      setExcuseNotes("");
    } catch (e: any) {
      toast({ title: "Failed to generate payroll", description: e?.response?.data?.error || "Error occurred", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBulkGenerate = async () => {
    const employees = employeesData?.data || [];
    if (!employees.length) {
      toast({ title: "No employees to sync", description: "Please add employees or refresh the list.", variant: "destructive" });
      return;
    }

    setIsBulkGenerating(true);
    let count = 0;
    try {
      for (const emp of employees) {
        try {
          await apiClient.post("/payroll/generate", { employeeId: emp.id, month });
          count++;
        } catch {}
      }
      await queryClient.invalidateQueries({ queryKey: getListPayrollQueryKey({ page, limit: pageSize, month }) });
      await queryClient.invalidateQueries({ queryKey: getListPayrollQueryKey() });
      setPage(1);
      toast({ title: `Bulk payroll completed`, description: `Generated payroll for ${count} employees for ${month}. Review overtime, advances and bonuses before marking paid.` });
    } catch {
      toast({ title: "Bulk payroll generation failed", variant: "destructive" });
    } finally {
      setIsBulkGenerating(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!selectedPayroll) return;
    try {
      await updateMutation.mutateAsync({ id: selectedPayroll.id, data: { status: "paid", paidAt: new Date().toISOString() } });
      queryClient.invalidateQueries({ queryKey: getListPayrollQueryKey() });
      setPage(1);
      toast({ title: "Payroll marked as paid", description: `${selectedPayroll.employeeName} - ${fmtINR(selectedPayroll.netSalary)}` });
      setPayOpen(false);
      setSelectedPayroll(null);
    } catch {
      toast({ title: "Failed to mark as paid", variant: "destructive" });
    }
  };

  const handleDownloadPayslip = async (payroll: any) => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast({ title: "Download failed", description: "You must be logged in to download payslips", variant: "destructive" });
      return;
    }

    try {
      const response = await fetch(`/api/payroll/${payroll.id}/payslip`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/pdf",
        },
        credentials: "include",
      });

      if (!response.ok) {
        let message = `Unable to download payslip (HTTP ${response.status})`;
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await response.json().catch(() => null);
          message = data?.error || data?.message || message;
        } else {
          const text = await response.text().catch(() => "");
          if (text) message = text;
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `payslip-${payroll.employeeName || payroll.employeeId}-${payroll.month}.pdf`
        .replace(/\s+/g, "-")
        .toLowerCase();
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Payslip downloaded", description: `${payroll.employeeName} - ${payroll.month}` });
    } catch (err: any) {
      toast({ title: "Failed to download payslip", description: err?.message || "Please try again", variant: "destructive" });
    }
  };

  const handleSendPayslipWhatsApp = async (payroll: any) => {
    setIsSendingWhatsApp(true);
    try {
      const response = await apiClient.post<{
        success: boolean;
        message: string;
        recipient: string;
        messageId?: string;
      }>(`/payroll/${payroll.id}/send-whatsapp`, {});
      
      // Log for debugging
      console.log("WhatsApp response:", response);
      
      const payload = response?.data;
      
      // Check for success
      if (!payload?.success) {
        throw new Error(payload?.message || "Failed to send WhatsApp message");
      }
      
      toast({ 
        title: "WhatsApp sent successfully", 
        description: `${payload.message} to ${payload.recipient}` 
      });
    } catch (err: any) {
      console.error("WhatsApp error:", err);
      const errorMessage = err?.response?.data?.error || err?.message || "Failed to send WhatsApp message. Please try again.";
      toast({ title: "Failed to send WhatsApp", description: errorMessage, variant: "destructive" });
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const handleSendSelectedPayslip = async () => {
    if (!selectedSendEmployee || selectedSendEmployee === "all") {
      toast({ title: "Select an employee", description: "Choose a specific employee before sending a payslip.", variant: "destructive" });
      return;
    }

    const payroll = filteredData.find((p: any) => String(p.employeeId) === selectedSendEmployee || String(p.employeeId) === String(selectedSendEmployee));
    if (!payroll) {
      toast({ title: "Payslip not found", description: "Generate or select payroll for the chosen employee first.", variant: "destructive" });
      return;
    }

    await handleSendPayslipWhatsApp(payroll);
  };

  const getStatusBadge = (status: string) => {
    const cfg: Record<string, string> = { paid: "bg-green-100 text-green-700 border-green-200", pending: "bg-yellow-100 text-yellow-700 border-yellow-200", processing: "bg-blue-100 text-blue-700 border-blue-200" };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${cfg[status] || "bg-gray-100 text-gray-700"}`}>{status}</span>;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll"
        description="Manage employee salaries — generate from attendance, compute formulas, mark payments"
        actions={
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleExportPDF}><FileText className="w-4 h-4 mr-2" />PDF</Button>
              <Button variant="outline" size="sm" onClick={handleExportExcel}><Download className="w-4 h-4 mr-2" />Excel</Button>
              <Button variant="outline" size="sm" onClick={handleDownloadPayslipsZip} disabled={isZipDownloading || filteredData.length === 0}>
                <Download className="w-4 h-4 mr-2" />ZIP Payslips
              </Button>
              <Button variant="outline" size="sm" onClick={handleBulkGenerate} disabled={isBulkGenerating}>
                <Users className="w-4 h-4 mr-2" />{isBulkGenerating ? "Syncing..." : "Sync Attendance + OT + Advances"}
              </Button>
              <Button size="sm" onClick={() => setGenerateOpen(true)}>
                <Zap className="w-4 h-4 mr-2" />Generate Payroll
              </Button>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <Select value={selectedSendEmployee} onValueChange={setSelectedSendEmployee}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All employees</SelectItem>
                  {(employeesData?.data || []).map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.firstName} {e.lastName} ({e.employeeId})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="secondary" onClick={handleSendSelectedPayslip} disabled={selectedSendEmployee === "all" || isSendingWhatsApp}>
                <MessageCircle className="w-4 h-4 mr-2" />Send Payslip
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Default selection is <span className="font-semibold text-foreground">All employees</span>. Select one employee to send their payslip.
              <br />WhatsApp send is restricted to <span className="font-semibold text-foreground">+91 96005 79204</span> only.
            </p>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard label="Total Paid" value={fmtINR(stats?.totalPaid || 0)} icon={CheckCircle} bg="bg-emerald-600" />
        <MetricCard label="Pending" value={fmtINR(stats?.totalPending || 0)} icon={Clock} bg="bg-amber-500" />
        <MetricCard label="This Month" value={fmtINR(stats?.thisMonth || 0)} icon={TrendingUp} bg="bg-blue-600" />
      </div>

      {/* Filters */}
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        Before payroll generation, sync attendance and maintain overtime, advance payments, bonus, and other adjustments for the selected month. Payroll generation uses those records to calculate the payslip.
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input type="month" value={month} onChange={e => { setMonth(e.target.value); setPage(1); }} className="w-44" />
        <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
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

      {/* Table */}
      <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Employee</TableHead>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Basic</TableHead>
              <TableHead className="text-right">HRA</TableHead>
              <TableHead className="text-right">Allowances</TableHead>
              <TableHead className="text-right">Overtime</TableHead>
              <TableHead className="text-right">Advance</TableHead>
              <TableHead className="text-right">PF + ESIC</TableHead>
              <TableHead className="text-right">Net Salary</TableHead>
              <TableHead className="text-center">Days</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={12} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : filteredData.length === 0 ? (
              <TableRow><TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                No payroll records found. Generate payroll from attendance data.
              </TableCell></TableRow>
            ) : filteredData.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.employeeName}</TableCell>
                <TableCell className="text-muted-foreground">{p.month}</TableCell>
                <TableCell className="text-right">{fmtINR(p.basicSalary)}</TableCell>
                <TableCell className="text-right">{fmtINR(p.hra)}</TableCell>
                <TableCell className="text-right">{fmtINR(p.allowances)}</TableCell>
                <TableCell className="text-right text-emerald-700">{fmtINR(p.overtimeAmount || 0)}</TableCell>
                <TableCell className="text-right text-red-600">-{fmtINR(p.advanceDeduction || 0)}</TableCell>
                <TableCell className="text-right text-red-600">{fmtINR((p.pf || 0) + (p.esic || 0))}</TableCell>
                <TableCell className="text-right font-semibold text-green-700">{fmtINR(p.netSalary)}</TableCell>
                <TableCell className="text-center text-xs">
                  <span className="text-green-600 font-medium">{p.presentDays}P</span>
                  {p.absentDays > 0 && <span className="text-red-500 ml-1">{p.absentDays}A</span>}
                </TableCell>
                <TableCell className="text-center">{getStatusBadge(p.status)}</TableCell>
                <TableCell className="space-x-2">
                  <Button size="sm" variant="ghost" onClick={() => handleDownloadPayslip(p)}>
                    Payslip
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleSendPayslipWhatsApp(p)} disabled={isSendingWhatsApp}>
                    <MessageCircle className="w-4 h-4 mr-2" />Send WhatsApp
                  </Button>
                  {p.status !== "paid" && (
                    <Button size="sm" variant="outline" onClick={() => { setSelectedPayroll(p); setPayOpen(true); }}>
                      Mark Paid
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination page={page} totalPages={payrollData?.pagination?.totalPages || 1} onPageChange={setPage} pageSize={pageSize} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </div>

      {/* Generate Single Payroll */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generate Payroll from Attendance</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger><SelectValue placeholder="Select employee..." /></SelectTrigger>
                <SelectContent>
                  {(employeesData?.data || []).map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.firstName} {e.lastName} ({e.employeeId})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Payroll Month</Label>
              <Input type="month" value={month} onChange={e => setMonth(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Excuse Notes (optional)</Label>
              <Textarea value={excuseNotes} onChange={e => setExcuseNotes(e.target.value)} placeholder="Any excused absences or special notes..." className="min-h-[80px]" />
            </div>
            <div className="bg-blue-50 rounded-md p-3 text-sm text-blue-700">
              Payroll will be computed based on attendance data, applying salary formula (Basic 60%, HRA 20%, Allowances 20%) with PF/ESIC deductions where applicable.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Paid */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm Payment</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-green-50 rounded-md p-4 space-y-2">
              <div className="flex justify-between"><span className="text-sm text-muted-foreground">Employee</span><span className="font-medium">{selectedPayroll?.employeeName}</span></div>
              <div className="flex justify-between"><span className="text-sm text-muted-foreground">Month</span><span className="font-medium">{selectedPayroll?.month}</span></div>
              <div className="flex justify-between"><span className="text-sm text-muted-foreground">Basic</span><span>{fmtINR(selectedPayroll?.basicSalary)}</span></div>
              <div className="flex justify-between"><span className="text-sm text-muted-foreground">HRA</span><span>{fmtINR(selectedPayroll?.hra)}</span></div>
              <div className="flex justify-between"><span className="text-sm text-muted-foreground">Allowances</span><span>{fmtINR(selectedPayroll?.allowances)}</span></div>
              <div className="flex justify-between text-emerald-700"><span className="text-sm">Overtime</span><span>+{fmtINR(selectedPayroll?.overtimeAmount || 0)}</span></div>
              <div className="flex justify-between text-red-600"><span className="text-sm">Advance</span><span>-{fmtINR(selectedPayroll?.advanceDeduction || 0)}</span></div>
              {(selectedPayroll?.pf + selectedPayroll?.esic) > 0 && (
                <div className="flex justify-between text-red-600"><span className="text-sm">PF + ESIC</span><span>-{fmtINR((selectedPayroll?.pf || 0) + (selectedPayroll?.esic || 0))}</span></div>
              )}
              <div className="flex justify-between border-t pt-2"><span className="font-semibold">Net Salary</span><span className="text-lg font-bold text-green-700">{fmtINR(selectedPayroll?.netSalary)}</span></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button onClick={handleMarkPaid} className="bg-green-600 hover:bg-green-700">Confirm Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
