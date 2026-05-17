import { useMemo } from "react";
import {
  useListAuditLogs,
  getListAuditLogsQueryKey,
  useListCustomers,
  getListCustomersQueryKey,
  useListEmployees,
  getListEmployeesQueryKey,
  useListProjects,
  getListProjectsQueryKey,
  useListVendors,
  getListVendorsQueryKey,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type AuditLogDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: string;
  recordId?: number;
  recordName?: string;
};

const getModuleColor = (module: string) => {
  switch (module?.toLowerCase()) {
    case "employees": return "bg-blue-100 text-blue-800";
    case "payroll": return "bg-purple-100 text-purple-800";
    case "invoices": return "bg-green-100 text-green-800";
    case "inventory": return "bg-amber-100 text-amber-800";
    case "customers": return "bg-cyan-100 text-cyan-800";
    case "vendors": return "bg-orange-100 text-orange-800";
    case "projects": return "bg-indigo-100 text-indigo-800";
    case "expenses": return "bg-rose-100 text-rose-800";
    default: return "bg-gray-100 text-gray-800";
  }
};

const getActionColor = (action: string) => {
  switch (action?.toLowerCase()) {
    case "create": return "bg-emerald-100 text-emerald-800";
    case "update": return "bg-amber-100 text-amber-800";
    case "delete": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-800";
  }
};

const formatAuditValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
};

const formatFieldName = (field: string) => field.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());

const buildChangedFields = (log: any) => {
  const oldValues = log.oldValues && typeof log.oldValues === "object" ? log.oldValues : {};
  const newValues = log.newValues && typeof log.newValues === "object" ? log.newValues : {};
  const keys = Array.from(new Set([...Object.keys(oldValues), ...Object.keys(newValues)]));

  return keys
    .filter((key) => JSON.stringify((oldValues as any)[key] ?? null) !== JSON.stringify((newValues as any)[key] ?? null))
    .map((key) => ({
      field: key,
      oldValue: (oldValues as any)[key],
      newValue: (newValues as any)[key],
    }));
};

export function AuditLogDialog({ open, onOpenChange, module, recordId, recordName }: AuditLogDialogProps) {
  const params = useMemo(
    () => ({ module, recordId, limit: 50 }),
    [module, recordId]
  );

  const { data, isLoading } = useListAuditLogs(params, {
    query: {
      enabled: open && !!recordId,
      queryKey: getListAuditLogsQueryKey(params),
    },
  });

  const employeesParams = { page: 1, limit: 500 };
  const projectsParams = { page: 1, limit: 500 };
  const customersParams = { page: 1, limit: 500 };
  const vendorsParams = { page: 1, limit: 500 };
  const { data: employeesData } = useListEmployees(employeesParams, { query: { enabled: open, queryKey: getListEmployeesQueryKey(employeesParams) } });
  const { data: projectsData } = useListProjects(projectsParams, { query: { enabled: open, queryKey: getListProjectsQueryKey(projectsParams) } });
  const { data: customersData } = useListCustomers(customersParams, { query: { enabled: open, queryKey: getListCustomersQueryKey(customersParams) } });
  const { data: vendorsData } = useListVendors(vendorsParams, { query: { enabled: open, queryKey: getListVendorsQueryKey(vendorsParams) } });

  const lookup = useMemo(() => {
    const employees = new Map<number, string>();
    const projects = new Map<number, string>();
    const customers = new Map<number, string>();
    const vendors = new Map<number, string>();

    (employeesData?.data || []).forEach((employee: any) => {
      employees.set(Number(employee.id), [employee.firstName, employee.lastName].filter(Boolean).join(" ") || employee.employeeId || `Employee #${employee.id}`);
    });
    (projectsData?.data || []).forEach((project: any) => projects.set(Number(project.id), project.name || `Project #${project.id}`));
    (customersData?.data || []).forEach((customer: any) => customers.set(Number(customer.id), customer.name || customer.company || `Customer #${customer.id}`));
    (vendorsData?.data || []).forEach((vendor: any) => vendors.set(Number(vendor.id), vendor.name || `Vendor #${vendor.id}`));

    return { employees, projects, customers, vendors };
  }, [customersData?.data, employeesData?.data, projectsData?.data, vendorsData?.data]);

  const formatDisplayValue = (field: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return "-";
    const normalizedField = field.toLowerCase();
    const id = Number(value);

    if (normalizedField === "employeeids" && Array.isArray(value)) {
      return value.map(item => lookup.employees.get(Number(item)) || `Employee #${item}`).join("\n");
    }
    if (normalizedField === "employeeid" && Number.isFinite(id)) return lookup.employees.get(id) || `Employee #${value}`;
    if (normalizedField === "projectid" && Number.isFinite(id)) return lookup.projects.get(id) || `Project #${value}`;
    if (normalizedField === "customerid" && Number.isFinite(id)) return lookup.customers.get(id) || `Customer #${value}`;
    if (normalizedField === "vendorid" && Number.isFinite(id)) return lookup.vendors.get(id) || `Vendor #${value}`;

    return formatAuditValue(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{recordName ? `${recordName} Audit History` : "Audit History"}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {recordId ? `Record ${recordId} (${module.replace(/_/g, " ")})` : "Select a record to view audit details."}
          </p>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !data?.data?.length ? (
          <div className="rounded-xl border border-dashed border-muted p-10 text-center text-sm text-muted-foreground">
            No audit logs available for this record.
          </div>
        ) : (
          <div className="space-y-4">
            {data.data.map((log: any) => {
              const changedFields = buildChangedFields(log);
              return (
                <div key={log.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Badge className={getModuleColor(log.module)} variant="outline">{log.module}</Badge>
                        <Badge className={getActionColor(log.action)} variant="outline">{log.action}</Badge>
                      </div>
                      <p className="font-medium">{log.description || "Audit change"}</p>
                      <p className="text-xs text-muted-foreground">
                        {log.userName || "System"} - {log.createdAt ? format(new Date(log.createdAt), "dd MMM yyyy, HH:mm") : "-"}
                      </p>
                    </div>
                  </div>
                  {changedFields.length ? (
                    <div className="mt-4 overflow-hidden rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[180px]">Field</TableHead>
                            <TableHead>Old Value</TableHead>
                            <TableHead>New Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {changedFields.map((change) => (
                            <TableRow key={change.field}>
                              <TableCell className="font-medium">{formatFieldName(change.field)}</TableCell>
                              <TableCell className="max-w-[320px] whitespace-pre-wrap break-words align-top text-red-700">{formatDisplayValue(change.field, change.oldValue)}</TableCell>
                              <TableCell className="max-w-[320px] whitespace-pre-wrap break-words align-top text-emerald-700">{formatDisplayValue(change.field, change.newValue)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No field-level values were captured for this log.</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
