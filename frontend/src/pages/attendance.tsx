import { useState, useCallback, useRef, useMemo, memo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListEmployees, getListAttendanceQueryKey, getListPayrollQueryKey } from "@workspace/api-client-react";
import { Pagination } from "@/components/Pagination";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, getDaysInMonth } from "date-fns";
import { Download, FileText, CheckCircle, XCircle, Clock, AlertCircle, Grid, List, Save, RefreshCw, Users, Upload, Zap } from "lucide-react";
import { useApiClient } from "@/lib/api-client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { downloadRowsAsCsv, openRowsPdfPrint } from "@/lib/export-utils";
import { downloadImportTemplate, importModuleFile } from "@/lib/import-utils";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; shortCode: string; textColor: string }> = {
  present:      { label: "Present",     color: "text-green-700",  bg: "bg-green-500",  shortCode: "P",  textColor: "text-white" },
  absent:       { label: "Absent",      color: "text-red-700",    bg: "bg-red-500",    shortCode: "A",  textColor: "text-white" },
  late:         { label: "Late",        color: "text-orange-700", bg: "bg-orange-500", shortCode: "L",  textColor: "text-white" },
  half_day:     { label: "Half Day",    color: "text-yellow-700", bg: "bg-yellow-400", shortCode: "HD", textColor: "text-white" },
  sick_leave:   { label: "Sick Leave",  color: "text-purple-700", bg: "bg-purple-500", shortCode: "SL", textColor: "text-white" },
  paid_leave:   { label: "Paid Leave",  color: "text-cyan-700",   bg: "bg-cyan-400",   shortCode: "PL", textColor: "text-white" },
  unpaid_leave: { label: "Unpaid Leave", color: "text-red-900",   bg: "bg-red-200",    shortCode: "UL", textColor: "text-red-900" },
  week_off:     { label: "Week Off",    color: "text-gray-500",  bg: "bg-gray-300",   shortCode: "WO", textColor: "text-gray-600" },
  holiday:      { label: "Holiday",     color: "text-blue-700",  bg: "bg-blue-400",   shortCode: "H",  textColor: "text-white" },
  "":          { label: "Not Marked",  color: "text-gray-300",  bg: "bg-gray-100",   shortCode: "—",  textColor: "text-gray-400" },
};

const STATUS_OPTIONS = ["present", "absent", "late", "half_day", "sick_leave", "paid_leave", "unpaid_leave", "week_off", "holiday"];
const NOT_MARKED_VALUE = "not_marked";
const PROTECTED_BULK_STATUSES = new Set(["sick_leave", "paid_leave", "unpaid_leave", "half_day", "week_off", "holiday"]);

// Memoized cell component to prevent re-renders
const AttendanceCell = memo(function AttendanceCell({
  employeeId,
  dateStr,
  dow,
  status,
  isPending,
  onStatusChange,
  isToday,
}: {
  employeeId: number;
  dateStr: string;
  dow: number;
  status: string;
  isPending: boolean;
  onStatusChange: (val: string) => void;
  isToday: boolean;
}) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG[""];
  const isSunday = dow === 0;

  if (isSunday) {
    return (
      <td className="border-r p-0.5 text-center bg-blue-50/50">
        <div className={`w-10 h-7 mx-auto rounded flex items-center justify-center text-[10px] font-bold ${cfg.bg} ${cfg.textColor}`}>
          {cfg.shortCode}
        </div>
      </td>
    );
  }

  return (
    <td className={cn("border-r p-0.5 text-center", isToday ? "bg-yellow-50/50" : "")}>
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "w-10 h-7 mx-auto rounded text-[10px] font-bold flex items-center justify-center transition-all cursor-pointer",
              cfg.bg,
              cfg.textColor,
              isPending ? "ring-2 ring-yellow-400" : "hover:opacity-80"
            )}
          >
            {cfg.shortCode}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-40 p-0">
          <div className="p-2 space-y-1">
            <button
              onClick={() => onStatusChange("")}
              className="w-full text-left px-3 py-2 text-xs rounded hover:bg-gray-100"
            >
              — Not Marked —
            </button>
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => onStatusChange(s)}
                className="w-full text-left px-3 py-2 text-xs rounded hover:bg-gray-100 flex items-center gap-2"
              >
                <span className={`w-3 h-3 rounded-full inline-block ${STATUS_CONFIG[s].bg}`} />
                {STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </td>
  );
});

export default function Attendance() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => format(today, "yyyy-MM-dd"), [today]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<"grid" | "list">("list");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingPayroll, setIsSyncingPayroll] = useState(false);
  const [search, setSearch] = useState("");

  const downloadAttendanceTemplate = async () => {
    try {
      await downloadImportTemplate("attendance", "attendance-template.xlsx");
      toast({ title: "Attendance template downloaded" });
    } catch (err) {
      toast({ title: "Unable to download template", description: (err as Error).message, variant: "destructive" });
    }
  };

  const handleImportAttendance = async (file: File) => {
    try {
      const data = await importModuleFile("attendance", file);
      queryClient.invalidateQueries({ queryKey: ["attendance-monthly", month] });
      queryClient.invalidateQueries({ queryKey: ["attendance-summary", month] });
      toast({ title: `Imported ${data.imported || 0} attendance records` });
    } catch (err) {
      toast({ title: "Attendance import failed", description: (err as Error).message, variant: "destructive" });
    }
  };

  const { data: monthlyData, isLoading, refetch, error } = useQuery({
    queryKey: ["attendance-monthly", month],
    queryFn: () => apiClient.get(`/attendance/monthly?month=${month}`).then(r => r.data),
  });

  const { data: summary } = useQuery({
    queryKey: ["attendance-summary", month],
    queryFn: () => apiClient.get(`/attendance/summary?month=${month}`).then(r => r.data),
  });

  const handleSyncPayroll = async () => {
    const employeeIds = Array.from(new Set((monthlyData?.grid || []).map((row: any) => Number(row.employee.id)).filter(Boolean)));
    if (!employeeIds.length) {
      toast({ title: "No employees found", description: "There are no attendance records to sync payroll from.", variant: "destructive" });
      return;
    }

    setIsSyncingPayroll(true);
    let successCount = 0;
    let failCount = 0;

    for (const employeeId of employeeIds) {
      try {
        await apiClient.post("/payroll/generate", { employeeId, month });
        successCount++;
      } catch {
        failCount++;
      }
    }

    queryClient.invalidateQueries({ queryKey: getListPayrollQueryKey() });
    queryClient.invalidateQueries({ queryKey: ["attendance-monthly", month] });
    queryClient.invalidateQueries({ queryKey: ["attendance-summary", month] });

    if (successCount > 0) {
      toast({ title: "Payroll sync completed", description: `${successCount} payroll records generated${failCount ? `, ${failCount} failed` : ""}.` });
    } else {
      toast({ title: "Payroll sync failed", description: "No payroll records were generated.", variant: "destructive" });
    }
    setIsSyncingPayroll(false);
  };

  const days = useMemo(() => {
    const daysInMonth = getDaysInMonth(new Date(`${month}-01`));
    return Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(`${month}-${String(i + 1).padStart(2, "0")}`);
      return { day: i + 1, dow: d.getDay(), dateStr: `${month}-${String(i + 1).padStart(2, "0")}` };
    });
  }, [month]);

  const getStatusForCell = useCallback((employeeId: number, dateStr: string, existingAttendance: Record<string, string>, dow: number) => {
    const key = `${employeeId}__${dateStr}`;
    if (pendingChanges[key] !== undefined) return pendingChanges[key];
    if (existingAttendance[dateStr]) return existingAttendance[dateStr];
    if (dow === 0) return "week_off";
    return "present";
  }, [pendingChanges]);

  const handleStatusChange = (employeeId: number, dateStr: string, newStatus: string, dow: number) => {
    if (dow === 0) return;
    const key = `${employeeId}__${dateStr}`;
    setPendingChanges(prev => ({ ...prev, [key]: newStatus }));
  };

  const handleSave = async () => {
    if (Object.keys(pendingChanges).length === 0) {
      toast({ title: "No changes to save" });
      return;
    }
    setIsSaving(true);
    try {
      const records = Object.entries(pendingChanges).map(([key, status]) => {
        const [empId, date] = key.split("__");
        return { employeeId: Number(empId), date, status };
      });
      await apiClient.post("/attendance/bulk", { records });
      queryClient.invalidateQueries({ queryKey: ["attendance-monthly", month] });
      queryClient.invalidateQueries({ queryKey: ["attendance-summary", month] });
      queryClient.invalidateQueries({ queryKey: getListAttendanceQueryKey() });
      setPendingChanges({});
      toast({ title: `Attendance saved for ${records.length} entries` });
    } catch {
      toast({ title: "Failed to save attendance", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const markWorkingDaysPresent = () => {
    const changes: Record<string, string> = {};
    attendanceRows.forEach((row: any) => {
      days.forEach(({ dow, dateStr }) => {
        if (dow === 0) return;
        const currentStatus = row.statusMap?.[dateStr] || "";
        if (PROTECTED_BULK_STATUSES.has(currentStatus)) return;
        const key = `${row.employee.id}__${dateStr}`;
        if (currentStatus !== "present") changes[key] = "present";
      });
    });
    setPendingChanges(prev => ({ ...prev, ...changes }));
    toast({
      title: `Marked ${Object.keys(changes).length} working-day cells as present`,
      description: "Sunday, leave, holiday, and week-off cells were preserved.",
    });
  };

  const attendanceRows = useMemo(() => {
    if (!monthlyData?.grid) return [];
    const q = search.toLowerCase();

    return monthlyData.grid
      .filter((row: any) => {
        if (!search) return true;
        const name = row.employee.name?.toLowerCase() || "";
        const empId = row.employee.employeeId?.toLowerCase() || "";
        const dept = row.employee.department?.toLowerCase() || "";
        return name.includes(q) || empId.includes(q) || dept.includes(q);
      })
      .map((row: any) => {
        let presentCount = 0;
        let absentCount = 0;
        let lateCount = 0;
        let halfDayCount = 0;
        let sickCount = 0;
        let paidLeaveCount = 0;
        let unpaidLeaveCount = 0;
        const statusMap: Record<string, string> = {};

        days.forEach(({ dateStr, dow }) => {
          const status = getStatusForCell(row.employee.id, dateStr, row.attendance, dow);
          statusMap[dateStr] = status;
          if (["present", "late", "half_day"].includes(status)) presentCount++;
          if (status === "absent") absentCount++;
          if (status === "late") lateCount++;
          if (status === "half_day") halfDayCount++;
          if (status === "sick_leave") sickCount++;
          if (status === "paid_leave") paidLeaveCount++;
          if (status === "unpaid_leave") unpaidLeaveCount++;
        });

        return { ...row, statusMap, presentCount, absentCount, lateCount, halfDayCount, sickCount, paidLeaveCount, unpaidLeaveCount };
      });
  }, [monthlyData?.grid, days, search, getStatusForCell]);

  const totalPages = Math.max(1, Math.ceil(attendanceRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = attendanceRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const exportColumns = [
    { header: "Employee", value: (row: any) => row.employee.name || "-" },
    { header: "Employee ID", value: (row: any) => row.employee.employeeId || "-" },
    { header: "Department", value: (row: any) => row.employee.department || "-" },
    { header: "Present", value: (row: any) => row.presentCount },
    { header: "Absent", value: (row: any) => row.absentCount },
    { header: "Late", value: (row: any) => row.lateCount },
    { header: "Half Day", value: (row: any) => row.halfDayCount },
    { header: "Paid Leave", value: (row: any) => row.paidLeaveCount },
    { header: "Unpaid Leave", value: (row: any) => row.unpaidLeaveCount },
  ];
  const handleExportPDF = async () => {
    if (!(await openRowsPdfPrint(`Attendance ${month}`, attendanceRows, exportColumns))) {
      toast({ title: "Export failed", description: "No attendance data available.", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Attendance PDF view opened." });
  };
  const handleExportExcel = () => {
    if (!downloadRowsAsCsv(`attendance-${month}.csv`, attendanceRows, exportColumns)) {
      toast({ title: "Export failed", description: "No attendance data available.", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Attendance Excel file downloaded." });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Track and manage employee attendance by month"
        actions={
          <div className="flex gap-2 flex-wrap items-center">
            <Button variant="outline" size="sm" onClick={downloadAttendanceTemplate}><Download className="w-4 h-4 mr-2" />Template</Button>
            <label>
              <Button variant="outline" size="sm" asChild>
                <span><Upload className="w-4 h-4 mr-2" />Import</span>
              </Button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleImportAttendance(file);
                if (e.target) e.target.value = "";
              }} />
            </label>
            <Button variant="outline" size="sm" onClick={handleExportPDF}><FileText className="w-4 h-4 mr-2" />PDF</Button>
            <Button variant="outline" size="sm" onClick={handleExportExcel}><Download className="w-4 h-4 mr-2" />Excel</Button>
            <Button variant="outline" size="sm" onClick={() => setView(v => v === "grid" ? "list" : "grid")}>
              {view === "grid" ? <List className="w-4 h-4 mr-2" /> : <Grid className="w-4 h-4 mr-2" />}
              {view === "grid" ? "List" : "Grid"}
            </Button>
            <Button variant="outline" size="sm" onClick={markWorkingDaysPresent} title="Mark all Monday-Saturday non-leave cells as present">
              Mark Mon-Sat Present
            </Button>
            <Button size="sm" onClick={handleSyncPayroll} disabled={isSyncingPayroll} className="bg-slate-700 text-white hover:bg-slate-800">
              <Zap className="w-4 h-4 mr-2" />{isSyncingPayroll ? "Syncing..." : "Sync Payroll"}
            </Button>
            {Object.keys(pendingChanges).length > 0 && (
              <Button size="sm" onClick={handleSave} disabled={isSaving} className="bg-green-600 hover:bg-green-700">
                <Save className="w-4 h-4 mr-2" />{isSaving ? "Saving..." : `Save (${Object.keys(pendingChanges).length})`}
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Present", value: summary?.present || 0, icon: CheckCircle, bg: "bg-emerald-600" },
          { label: "Absent", value: summary?.absent || 0, icon: XCircle, bg: "bg-red-600" },
          { label: "Late", value: summary?.late || 0, icon: Clock, bg: "bg-orange-600" },
          { label: "Half Day", value: summary?.halfDay || 0, icon: AlertCircle, bg: "bg-amber-500" },
          { label: "Sick Leave", value: summary?.sickLeave || 0, icon: Users, bg: "bg-violet-600" },
          { label: "Paid Leave", value: summary?.paidLeave || 0, icon: Users, bg: "bg-cyan-600" },
          { label: "Unpaid Leave", value: summary?.unpaidLeave || 0, icon: Users, bg: "bg-rose-600" },
        ].map(({ label, value, icon, bg }) => (
          <MetricCard key={label} label={label} value={value} icon={icon} bg={bg} />
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-44" />
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Input placeholder="Search employee..." value={search} onChange={e => setSearch(e.target.value)} className="pl-3" />
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
        <div className="flex gap-2 flex-wrap text-xs">
          {Object.entries(STATUS_CONFIG).filter(([k]) => k).map(([status, cfg]) => (
            <div key={status} className="flex items-center gap-1">
              <span className={`w-5 h-5 rounded text-xs flex items-center justify-center font-bold ${cfg.bg} ${cfg.textColor}`}>{cfg.shortCode}</span>
              <span className="text-muted-foreground hidden sm:inline">{cfg.label}</span>
            </div>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">Loading attendance...</CardContent></Card>
      ) : error ? (
        <Card><CardContent className="py-16 text-center text-red-500">Error loading attendance: {(error as any)?.message || 'Unknown error'}</CardContent></Card>
      ) : view === "grid" ? (
        <>
        <Table className="min-w-full text-xs">
          <thead>
            <TableRow className="bg-muted/50 sticky top-0 z-10">
              <th className="sticky left-0 z-20 bg-muted/80 text-left p-2 font-semibold min-w-[180px] border-r">Employee</th>
              {days.map(({ day, dow, dateStr }) => {
                const isSunday = dow === 0;
                const isToday = dateStr === todayStr;
                return (
                  <th key={day} className={cn("p-1 text-center font-medium border-r min-w-[52px]",
                    isSunday ? "bg-blue-50 text-blue-600" : "",
                    isToday ? "bg-yellow-50 text-yellow-700 font-bold" : ""
                  )}>
                    <div>{day}</div>
                    <div className="font-normal text-[10px] text-muted-foreground">{["Su","Mo","Tu","We","Th","Fr","Sa"][dow]}</div>
                  </th>
                );
              })}
              <th className="p-2 text-center font-semibold min-w-[60px]">P/A</th>
            </TableRow>
          </thead>
          <tbody>
            {paginatedRows.map((row: any) => (
                <TableRow key={row.employee.id} className="hover:bg-muted/20 border-b">
                  <td className="sticky left-0 bg-card z-10 border-r p-2 font-medium">
                    <div className="font-semibold">{row.employee.name}</div>
                    <div className="text-[10px] text-muted-foreground">{row.employee.employeeId} • {row.employee.department}</div>
                  </td>
                  {days.map(({ day, dow, dateStr }) => {
                    const isToday = dateStr === todayStr;
                    const status = row.statusMap[dateStr] || "";
                    const isPending = pendingChanges[`${row.employee.id}__${dateStr}`] !== undefined;

                    return (
                      <AttendanceCell
                        key={day}
                        employeeId={row.employee.id}
                        dateStr={dateStr}
                        dow={dow}
                        status={status}
                        isPending={isPending}
                        isToday={isToday}
                        onStatusChange={(val) => handleStatusChange(row.employee.id, dateStr, val, dow)}
                      />
                    );
                  })}
                  <td className="p-2 text-center">
                    <span className="font-semibold text-green-700">{row.presentCount}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-red-600">{row.absentCount}</span>
                  </td>
                </TableRow>
            ))}
            {attendanceRows.length === 0 && (
              <TableRow><td colSpan={days.length + 2} className="text-center py-8 text-muted-foreground">No employees found</td></TableRow>
            )}
          </tbody>
        </Table>
        <Pagination
          page={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
        </>
      ) : (
        <>
        <Card>
          <CardContent className="p-0">
            <Table className="w-full text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-center">Present</TableHead>
                  <TableHead className="text-center">Absent</TableHead>
                  <TableHead className="text-center">Late</TableHead>
                  <TableHead className="text-center">Half Day</TableHead>
                  <TableHead className="text-center">Sick</TableHead>
                  <TableHead className="text-center">Paid Leave</TableHead>
                  <TableHead className="text-center">Unpaid Leave</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRows.map((row: any) => (
                  <TableRow key={row.employee.id}>
                    <TableCell className="p-3 font-medium">{row.employee.name}</TableCell>
                    <TableCell className="p-3 text-muted-foreground text-xs">{row.employee.department}</TableCell>
                    <TableCell className="p-3 text-center"><span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold">{row.presentCount}</span></TableCell>
                    <TableCell className="p-3 text-center"><span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-semibold">{row.absentCount}</span></TableCell>
                    <TableCell className="p-3 text-center"><span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-semibold">{row.lateCount}</span></TableCell>
                    <TableCell className="p-3 text-center"><span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-semibold">{row.halfDayCount}</span></TableCell>
                    <TableCell className="p-3 text-center"><span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-semibold">{row.sickCount}</span></TableCell>
                    <TableCell className="p-3 text-center"><span className="px-2 py-1 bg-cyan-100 text-cyan-700 rounded text-xs font-semibold">{row.paidLeaveCount}</span></TableCell>
                    <TableCell className="p-3 text-center"><span className="px-2 py-1 bg-rose-100 text-rose-700 rounded text-xs font-semibold">{row.unpaidLeaveCount}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Pagination
          page={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
        </>
      )}
    </div>
  );
}
