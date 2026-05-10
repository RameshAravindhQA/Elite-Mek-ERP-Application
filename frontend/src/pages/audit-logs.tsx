import React, { useState } from "react";
import { useListAuditLogs } from "@workspace/api-client-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { Download, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Pagination } from "@/components/Pagination";

const getModuleColor = (module: string) => {
  switch (module?.toLowerCase()) {
    case "employees": return "bg-blue-100 text-blue-800";
    case "payroll": return "bg-purple-100 text-purple-800";
    case "invoices": return "bg-green-100 text-green-800";
    case "inventory": return "bg-amber-100 text-amber-800";
    case "customers": return "bg-cyan-100 text-cyan-800";
    case "vendors": return "bg-orange-100 text-orange-800";
    case "projects": return "bg-indigo-100 text-indigo-800";
    default: return "bg-gray-100 text-gray-800";
  }
};

const getActionColor = (action: string) => {
  switch (action?.toLowerCase()) {
    case "create": return "bg-green-100 text-green-800";
    case "update": return "bg-amber-100 text-amber-800";
    case "delete": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-800";
  }
};

export default function AuditLogs() {
  const [page, setPage] = useState(1);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  const { data, isLoading } = useListAuditLogs({ 
    page, 
    limit: 15,
    module: moduleFilter !== "all" ? moduleFilter : undefined,
    action: actionFilter !== "all" ? actionFilter : undefined
  });

  const toggleRow = (id: number) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <PageHeader title="Audit Logs" description="Track system activity and changes" />
        <Button variant="outline"><Download className="w-4 h-4 mr-2" /> Export</Button>
      </div>

      <div className="flex items-center gap-4">
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Filter by Module" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modules</SelectItem>
            <SelectItem value="employees">Employees</SelectItem>
            <SelectItem value="payroll">Payroll</SelectItem>
            <SelectItem value="invoices">Invoices</SelectItem>
            <SelectItem value="inventory">Inventory</SelectItem>
            <SelectItem value="customers">Customers</SelectItem>
            <SelectItem value="vendors">Vendors</SelectItem>
            <SelectItem value="projects">Projects</SelectItem>
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Filter by Action" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="create">Create</SelectItem>
            <SelectItem value="update">Update</SelectItem>
            <SelectItem value="delete">Delete</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Record ID</TableHead>
              <TableHead>IP Address</TableHead>
              <TableHead>Date/Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : data?.data?.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No logs found</TableCell></TableRow>
            ) : (
              data?.data?.map((log) => (
                <React.Fragment key={log.id}>
                  <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggleRow(log.id)}>
                    <TableCell>
                      {expandedRows[log.id] ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </TableCell>
                    <TableCell><Badge className={getModuleColor(log.module)} variant="outline">{log.module}</Badge></TableCell>
                    <TableCell><Badge className={getActionColor(log.action)} variant="outline">{log.action}</Badge></TableCell>
                    <TableCell className="font-medium max-w-xs truncate">{log.description}</TableCell>
                    <TableCell>{log.userName || "System"}</TableCell>
                    <TableCell>{log.recordId || "-"}</TableCell>
                    <TableCell>{log.ipAddress || "-"}</TableCell>
                    <TableCell>{format(new Date(log.createdAt), 'dd MMM yyyy, HH:mm')}</TableCell>
                  </TableRow>
                  {expandedRows[log.id] && (
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={8} className="p-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Old Values</h4>
                            <pre className="text-xs bg-muted p-2 rounded max-h-40 overflow-auto whitespace-pre-wrap">
                              {log.oldValues ? JSON.stringify(log.oldValues, null, 2) : "None"}
                            </pre>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold mb-2 text-muted-foreground">New Values</h4>
                            <pre className="text-xs bg-muted p-2 rounded max-h-40 overflow-auto whitespace-pre-wrap">
                              {log.newValues ? JSON.stringify(log.newValues, null, 2) : "None"}
                            </pre>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data?.pagination && (
        <Pagination 
          page={page} 
          totalPages={data.pagination.totalPages} 
          onPageChange={setPage} 
        />
      )}
    </div>
  );
}
