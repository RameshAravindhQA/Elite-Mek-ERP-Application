import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
  getListCustomersQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadImportTemplate, importModuleFile } from "@/lib/import-utils";
import { downloadRowsAsCsv, openRowsPdfPrint } from "@/lib/export-utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AuditLogDialog } from "@/components/audit/AuditLogDialog";
import { Label } from "@/components/ui/label";
import { Search, Download, FileText, Plus, Edit, Trash, Upload, History, Users, UserCheck, UserMinus } from "lucide-react";
import { Pagination } from "@/components/Pagination";

export default function Customers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [auditRecord, setAuditRecord] = useState<{ id: number; module: string; title: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: customersData, isLoading } = useListCustomers({
    page,
    limit: pageSize,
    search: search || undefined,
  });

  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer();
  const deleteMutation = useDeleteCustomer();

  const exportColumns = [
    { header: "Name", value: (customer: any) => customer.name || "-" },
    { header: "Company", value: (customer: any) => customer.company || "-" },
    { header: "Email", value: (customer: any) => customer.email || "-" },
    { header: "Phone", value: (customer: any) => customer.phone || "-" },
    { header: "GST Number", value: (customer: any) => customer.gstNumber || "-" },
    { header: "Status", value: (customer: any) => customer.status || "-" },
  ];
  const handleExportPDF = async () => {
    const rows = customersData?.data || [];
    if (!(await openRowsPdfPrint("Customers", rows, exportColumns))) {
      toast({ title: "Export failed", description: "No customer data available.", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Customer PDF view opened." });
  };
  const handleExportExcel = () => {
    const rows = customersData?.data || [];
    if (!downloadRowsAsCsv("customers.csv", rows, exportColumns)) {
      toast({ title: "Export failed", description: "No customer data available.", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Customer Excel file downloaded." });
  };

  const handleTemplateDownload = async () => {
    try {
      await downloadImportTemplate("customers", "customers-template.xlsx");
      toast({ title: "Customer template downloaded" });
    } catch (err: any) {
      toast({ title: "Template download failed", description: err.message || "Unable to download template", variant: "destructive" });
    }
  };

  const handleImportCustomers = async (file: File) => {
    try {
      const response = await importModuleFile("customers", file);
      queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      toast({ title: `Imported ${response.imported || 0} customers` });
    } catch (err: any) {
      toast({ title: "Customer import failed", description: err.message || "Unable to import file", variant: "destructive" });
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      phone: formData.get("phone") as string,
      company: formData.get("company") as string,
      address: formData.get("address") as string,
      gstNumber: formData.get("gstNumber") as string,
      status: formData.get("status") as string,
    };

    try {
      if (editingCustomer) {
        await updateMutation.mutateAsync({ id: editingCustomer.id, data });
        toast({ title: "Customer updated successfully" });
      } else {
        await createMutation.mutateAsync({ data });
        toast({ title: "Customer created successfully" });
      }
      queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      setPage(1);
      setDialogOpen(false);
      setEditingCustomer(null);
    } catch (error) {
      toast({ title: editingCustomer ? "Error updating customer" : "Error creating customer", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMutation.mutateAsync({ id: deleteId });
      toast({ title: "Customer deleted successfully" });
      queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      setPage(1);
    } catch (error) {
      toast({ title: "Error deleting customer", variant: "destructive" });
    } finally {
      setDeleteId(null);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status.toLowerCase()) {
      case "active": return "bg-emerald-100 text-emerald-700 border border-emerald-200";
      case "inactive": return "bg-red-100 text-red-700 border border-red-200";
      default: return "bg-gray-100 text-gray-700 border border-gray-200";
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Customers" 
        description="Manage your client relationships" 
        actions={
          <div className="flex gap-2 flex-wrap items-center">
            <Button variant="outline" size="sm" onClick={handleTemplateDownload}><Download className="w-4 h-4 mr-2" />Template</Button>
            <label>
              <Button variant="outline" size="sm" asChild>
                <span><Upload className="w-4 h-4 mr-2" />Import</span>
              </Button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) handleImportCustomers(file); if (e.target) e.target.value = ""; }} />
            </label>
            <Button variant="outline" onClick={handleExportPDF}><FileText className="w-4 h-4 mr-2" /> PDF</Button>
            <Button variant="outline" onClick={handleExportExcel}><Download className="w-4 h-4 mr-2" /> Excel</Button>
            <Button onClick={() => { setEditingCustomer(null); setDialogOpen(true); }}><Plus className="w-4 h-4 mr-2" /> Add Customer</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Customers", value: customersData?.pagination.total || 0, icon: Users, bg: "bg-blue-600" },
          { label: "Active", value: (customersData?.data || []).filter(c => c.status === 'active').length, icon: UserCheck, bg: "bg-emerald-600" },
          { label: "Inactive", value: (customersData?.data || []).filter(c => c.status === 'inactive').length, icon: UserMinus, bg: "bg-red-600" },
          { label: "Companies", value: new Set((customersData?.data || []).map(c => c.company).filter(Boolean)).size, icon: FileText, bg: "bg-indigo-600" },
        ].map(({ label, value, icon, bg }) => (
          <MetricCard key={label} label={label} value={value} icon={icon} bg={bg} />
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search customers..." 
            className="pl-8" 
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={status} onValueChange={(val) => { setStatus(val); setPage(1); }}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <div className="border rounded-md bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>GST Number</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Revenue (₹)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customersData?.data?.map((customer: any) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell>{customer.company || '-'}</TableCell>
                  <TableCell>{customer.email || '-'}</TableCell>
                  <TableCell>{customer.phone || '-'}</TableCell>
                  <TableCell>{customer.gstNumber || '-'}</TableCell>
                  <TableCell>{customer.totalOrders || 0}</TableCell>
                  <TableCell>₹{(customer.totalRevenue || 0).toLocaleString('en-IN')}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(customer.status)}`}>
                      {customer.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" title="Edit customer" onClick={() => { setEditingCustomer(customer); setDialogOpen(true); }}><Edit className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" title="Audit history" onClick={() => { setAuditRecord({ id: customer.id, module: "customers", title: customer.name || customer.company || "Customer" }); }}><History className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" title="Delete customer" className="text-red-600" onClick={() => setDeleteId(customer.id)}><Trash className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={customersData?.pagination?.totalPages || 1} onPageChange={setPage} pageSize={pageSize} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
        </div>
      )}

      <AuditLogDialog
        open={!!auditRecord}
        onOpenChange={(open) => { if (!open) setAuditRecord(null); }}
        module="customers"
        recordId={auditRecord?.id}
        recordName={auditRecord?.title}
      />

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditingCustomer(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? "Edit Customer" : "Add Customer"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 mt-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input name="name" required defaultValue={editingCustomer?.name || ""} />
            </div>
            <div className="space-y-2">
              <Label>Company</Label>
              <Input name="company" defaultValue={editingCustomer?.company || ""} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input name="email" type="email" defaultValue={editingCustomer?.email || ""} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input name="phone" defaultValue={editingCustomer?.phone || ""} />
            </div>
            <div className="space-y-2">
              <Label>GST Number</Label>
              <Input name="gstNumber" defaultValue={editingCustomer?.gstNumber || ""} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select name="status" defaultValue={editingCustomer?.status || "active"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Address</Label>
              <textarea className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm" name="address" rows={3} defaultValue={editingCustomer?.address || ""}></textarea>
            </div>
            <div className="col-span-2 flex justify-end gap-2 mt-4">
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditingCustomer(null); }}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. This will permanently delete the customer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
