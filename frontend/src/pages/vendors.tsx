import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListVendors,
  useCreateVendor,
  useUpdateVendor,
  useDeleteVendor,
  getListVendorsQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { MetricCard } from "@/components/MetricCard";
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
import { Building2, Search, Download, FileText, Plus, Edit, Trash, MoreVertical, Upload, History, Tags, UserCheck } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Pagination } from "@/components/Pagination";

export default function Vendors() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [auditRecord, setAuditRecord] = useState<{ id: number; module: string; title: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: vendorsData, isLoading } = useListVendors({
    page,
    limit: pageSize,
    search: search || undefined,
  });

  const createMutation = useCreateVendor();
  const updateMutation = useUpdateVendor();
  const deleteMutation = useDeleteVendor();

  const exportColumns = [
    { header: "Name", value: (vendor: any) => vendor.name || "-" },
    { header: "Company", value: (vendor: any) => vendor.company || "-" },
    { header: "Email", value: (vendor: any) => vendor.email || "-" },
    { header: "Phone", value: (vendor: any) => vendor.phone || "-" },
    { header: "GST Number", value: (vendor: any) => vendor.gstNumber || "-" },
    { header: "Category", value: (vendor: any) => vendor.category || "-" },
    { header: "Status", value: (vendor: any) => vendor.status || "-" },
  ];
  const handleExportPDF = () => {
    const rows = vendorsData?.data || [];
    if (!openRowsPdfPrint("Vendors", rows, exportColumns)) {
      toast({ title: "Export failed", description: "No vendor data available.", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Vendor PDF view opened." });
  };
  const handleExportExcel = () => {
    const rows = vendorsData?.data || [];
    if (!downloadRowsAsCsv("vendors.csv", rows, exportColumns)) {
      toast({ title: "Export failed", description: "No vendor data available.", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Vendor Excel file downloaded." });
  };

  const handleTemplateDownload = async () => {
    try {
      await downloadImportTemplate("vendors", "vendors-template.xlsx");
      toast({ title: "Vendor template downloaded" });
    } catch (err: any) {
      toast({ title: "Template download failed", description: err.message || "Unable to download template", variant: "destructive" });
    }
  };

  const handleImportVendors = async (file: File) => {
    try {
      const response = await importModuleFile("vendors", file);
      queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
      toast({ title: `Imported ${response.imported || 0} vendors` });
    } catch (err: any) {
      toast({ title: "Vendor import failed", description: err.message || "Unable to import file", variant: "destructive" });
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
      category: formData.get("category") as string,
      status: formData.get("status") as string,
    };

    try {
      if (editingVendor) {
        await updateMutation.mutateAsync({ id: editingVendor.id, data });
        toast({ title: "Vendor updated successfully" });
      } else {
        await createMutation.mutateAsync({ data });
        toast({ title: "Vendor created successfully" });
      }
      queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
      setPage(1);
      setDialogOpen(false);
      setEditingVendor(null);
    } catch (error) {
      toast({ title: editingVendor ? "Error updating vendor" : "Error creating vendor", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMutation.mutateAsync({ id: deleteId });
      toast({ title: "Vendor deleted successfully" });
      queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
      setPage(1);
    } catch (error) {
      toast({ title: "Error deleting vendor", variant: "destructive" });
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
        title="Vendors" 
        description="Manage your suppliers and partners" 
        actions={
          <div className="flex gap-2 flex-wrap items-center">
            <Button variant="outline" size="sm" onClick={handleTemplateDownload}><Download className="w-4 h-4 mr-2" />Template</Button>
            <label>
              <Button variant="outline" size="sm" asChild>
                <span><Upload className="w-4 h-4 mr-2" />Import</span>
              </Button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) handleImportVendors(file); if (e.target) e.target.value = ""; }} />
            </label>
            <Button variant="outline" onClick={handleExportPDF}><FileText className="w-4 h-4 mr-2" /> PDF</Button>
            <Button variant="outline" onClick={handleExportExcel}><Download className="w-4 h-4 mr-2" /> Excel</Button>
            <Button onClick={() => { setEditingVendor(null); setDialogOpen(true); }}><Plus className="w-4 h-4 mr-2" /> Add Vendor</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Total Vendors" value={vendorsData?.pagination?.total || 0} icon={Building2} bg="bg-blue-600" />
        <MetricCard label="Active" value={(vendorsData?.data || []).filter((vendor: any) => vendor.status === "active").length} icon={UserCheck} bg="bg-emerald-600" />
        <MetricCard label="Categories" value={new Set((vendorsData?.data || []).map((vendor: any) => vendor.category).filter(Boolean)).size} icon={Tags} bg="bg-violet-600" />
        <MetricCard label="GST Records" value={(vendorsData?.data || []).filter((vendor: any) => vendor.gstNumber).length} icon={FileText} bg="bg-orange-600" />
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search vendors..." 
            className="pl-8" 
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={category} onValueChange={(val) => { setCategory(val); setPage(1); }}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent searchable>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="Raw Materials">Raw Materials</SelectItem>
            <SelectItem value="Components">Components</SelectItem>
            <SelectItem value="Electronics">Electronics</SelectItem>
            <SelectItem value="Safety Equipment">Safety Equipment</SelectItem>
            <SelectItem value="Printing">Printing</SelectItem>
            <SelectItem value="IT Services">IT Services</SelectItem>
            <SelectItem value="Logistics">Logistics</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <div className="border rounded-md bg-card">
          <AuditLogDialog
            open={!!auditRecord}
            onOpenChange={(open) => { if (!open) setAuditRecord(null); }}
            module="vendors"
            recordId={auditRecord?.id}
            recordName={auditRecord?.title}
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>GST Number</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendorsData?.data?.map((vendor: any) => (
                <TableRow key={vendor.id}>
                  <TableCell className="font-medium">{vendor.name}</TableCell>
                  <TableCell>{vendor.company || '-'}</TableCell>
                  <TableCell>{vendor.email || '-'}</TableCell>
                  <TableCell>{vendor.phone || '-'}</TableCell>
                  <TableCell>{vendor.gstNumber || '-'}</TableCell>
                  <TableCell>{vendor.category || '-'}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(vendor.status)}`}>
                      {vendor.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditingVendor(vendor); setDialogOpen(true); }}>
                          <Edit className="w-4 h-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setAuditRecord({ id: vendor.id, module: "vendors", title: vendor.name || vendor.company || "Vendor" }); }}>
                          <History className="w-4 h-4 mr-2" /> Audit Log
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600" onClick={() => setDeleteId(vendor.id)}>
                          <Trash className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={vendorsData?.pagination?.totalPages || 1} onPageChange={setPage} pageSize={pageSize} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditingVendor(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingVendor ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 mt-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input name="name" required defaultValue={editingVendor?.name || ""} />
            </div>
            <div className="space-y-2">
              <Label>Company</Label>
              <Input name="company" defaultValue={editingVendor?.company || ""} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input name="email" type="email" defaultValue={editingVendor?.email || ""} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input name="phone" defaultValue={editingVendor?.phone || ""} />
            </div>
            <div className="space-y-2">
              <Label>GST Number</Label>
              <Input name="gstNumber" defaultValue={editingVendor?.gstNumber || ""} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select name="category" defaultValue={editingVendor?.category || "Raw Materials"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Raw Materials">Raw Materials</SelectItem>
                  <SelectItem value="Components">Components</SelectItem>
                  <SelectItem value="Electronics">Electronics</SelectItem>
                  <SelectItem value="Safety Equipment">Safety Equipment</SelectItem>
                  <SelectItem value="Printing">Printing</SelectItem>
                  <SelectItem value="IT Services">IT Services</SelectItem>
                  <SelectItem value="Logistics">Logistics</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Address</Label>
              <textarea className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm" name="address" rows={3} defaultValue={editingVendor?.address || ""}></textarea>
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Status</Label>
              <Select name="status" defaultValue={editingVendor?.status || "active"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex justify-end gap-2 mt-4">
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditingVendor(null); }}>Cancel</Button>
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
            <AlertDialogDescription>This action cannot be undone. This will permanently delete the vendor.</AlertDialogDescription>
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
