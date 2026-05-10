import { useMemo } from "react";
import { useListAuditLogs, getListAuditLogsQueryKey } from "@workspace/api-client-react";
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
          <div className="border rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Module</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Old Value</TableHead>
                  <TableHead>New Value</TableHead>
                  <TableHead>Date/Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((log: any) => (
                  <TableRow key={log.id} className="hover:bg-muted/20">
                    <TableCell>
                      <Badge className={getModuleColor(log.module)} variant="outline">{log.module}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getActionColor(log.action)} variant="outline">{log.action}</Badge>
                    </TableCell>
                    <TableCell>{log.userName || "System"}</TableCell>
                    <TableCell className="font-medium">{log.field || log.description || "—"}</TableCell>
                    <TableCell className="max-w-[180px] truncate">{typeof log.oldValues === "object" ? JSON.stringify(log.oldValues) : log.oldValues || "—"}</TableCell>
                    <TableCell className="max-w-[180px] truncate">{typeof log.newValues === "object" ? JSON.stringify(log.newValues) : log.newValues || "—"}</TableCell>
                    <TableCell>{log.createdAt ? format(new Date(log.createdAt), "dd MMM yyyy, HH:mm") : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
