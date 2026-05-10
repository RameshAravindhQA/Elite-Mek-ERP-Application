import { useState, useRef } from "react";
import { useListInventory, useCreateInventoryItem, useUpdateInventoryItem, useDeleteInventoryItem, useGetInventoryStats, getListInventoryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination } from "@/components/Pagination";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AuditLogDialog } from "@/components/audit/AuditLogDialog";
import { downloadImportTemplate, importModuleFile } from "@/lib/import-utils";
import { downloadRowsAsCsv, openRowsPdfPrint } from "@/lib/export-utils";
import { AlertTriangle, ArchiveX, IndianRupee, Loader2, Package, Plus, Search, FileDown, FileSpreadsheet, Edit, Trash2, Upload, History } from "lucide-react";

export default function Inventory() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [auditRecord, setAuditRecord] = useState<{ id: number; module: string; title: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: stats, isLoading: loadingStats } = useGetInventoryStats();
  
  const queryParams = {
    page,
    limit: pageSize,
    ...(search && { search }),
    ...(categoryFilter !== "all" && { category: categoryFilter }),
  };

  const { data: inventoryData, isLoading: loadingInventory } = useListInventory(queryParams);
  const createItem = useCreateInventoryItem();
  const updateItem = useUpdateInventoryItem();
  const deleteItem = useDeleteInventoryItem();

  const handleTemplateDownload = async () => {
    try {
      await downloadImportTemplate("inventory", "inventory-template.xlsx");
      toast({ title: "Inventory template downloaded" });
    } catch (err: any) {
      toast({ title: "Template download failed", description: err.message || "Unable to download template", variant: "destructive" });
    }
  };

  const handleImportInventory = async (file: File) => {
    try {
      const response = await importModuleFile("inventory", file);
      queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
      toast({ title: `Imported ${response.imported || 0} inventory items` });
    } catch (err: any) {
      toast({ title: "Inventory import failed", description: err.message || "Unable to import file", variant: "destructive" });
    }
  };

  const exportColumns = [
    { header: "SKU", value: (item: any) => item.sku || "-" },
    { header: "Name", value: (item: any) => item.name || "-" },
    { header: "Category", value: (item: any) => item.category || "-" },
    { header: "Quantity", value: (item: any) => Number(item.quantity || 0) },
    { header: "Unit", value: (item: any) => item.unit || "-" },
    { header: "Reorder Level", value: (item: any) => Number(item.reorderLevel || 0) },
    { header: "Cost Price", value: (item: any) => Number(item.costPrice || 0) },
    { header: "Selling Price", value: (item: any) => Number(item.sellingPrice || 0) },
    { header: "Location", value: (item: any) => item.location || "-" },
  ];
  const handleExportPDF = () => {
    const rows = inventoryData?.data || [];
    if (!openRowsPdfPrint("Inventory", rows, exportColumns)) {
      toast({ title: "Export failed", description: "No inventory data available.", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Inventory PDF view opened." });
  };
  const handleExportExcel = () => {
    const rows = inventoryData?.data || [];
    if (!downloadRowsAsCsv("inventory.csv", rows, exportColumns)) {
      toast({ title: "Export failed", description: "No inventory data available.", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Inventory Excel file downloaded." });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0);
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const formData = new FormData(e.currentTarget);
    const payload = {
      sku: formData.get("sku") as string,
      name: formData.get("name") as string,
      category: formData.get("category") as string,
      quantity: Number(formData.get("quantity")),
      unit: formData.get("unit") as string,
      reorderLevel: Number(formData.get("reorderLevel")),
      costPrice: Number(formData.get("costPrice")),
      sellingPrice: Number(formData.get("sellingPrice")),
      location: formData.get("location") as string,
      description: formData.get("description") as string,
    };

    try {
      if (editingItem) {
        await updateItem.mutateAsync({ id: editingItem.id, data: payload as any });
        toast({ title: "Success", description: "Item updated successfully" });
      } else {
        await createItem.mutateAsync({ data: payload as any });
        toast({ title: "Success", description: "Item created successfully" });
      }
      queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
      setPage(1);
      setDialogOpen(false);
      setEditingItem(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save item", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteItem.mutateAsync({ id });
      toast({ title: "Success", description: "Item deleted successfully" });
      queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
      setPage(1);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete item", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory" description="Manage items, stock levels, and pricing" />

      {!loadingStats && stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Total Items" value={stats.totalItems} icon={Package} bg="bg-blue-600" />
          <MetricCard label="Total Value" value={formatCurrency(stats.totalValue || 0)} icon={IndianRupee} bg="bg-emerald-600" />
          <MetricCard label="Low Stock" value={stats.lowStock} icon={AlertTriangle} bg="bg-amber-500" />
          <MetricCard label="Out of Stock" value={stats.outOfStock} icon={ArchiveX} bg="bg-red-600" />
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search items..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-8" />
          </div>
          <Select value={categoryFilter} onValueChange={(val) => { setCategoryFilter(val); setPage(1); }}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="Electronics">Electronics</SelectItem>
              <SelectItem value="Raw Materials">Raw Materials</SelectItem>
              <SelectItem value="Finished Goods">Finished Goods</SelectItem>
              <SelectItem value="Office Supplies">Office Supplies</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleTemplateDownload}><FileDown className="h-4 w-4 mr-2" /> Template</Button>
          <label>
            <Button variant="outline" size="sm" asChild>
              <span><Upload className="h-4 w-4 mr-2" /> Import</span>
            </Button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) handleImportInventory(file); if (e.target) e.target.value = ""; }} />
          </label>
          <Button variant="outline" size="sm" onClick={handleExportPDF}><FileDown className="h-4 w-4 mr-2" /> PDF</Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}><FileSpreadsheet className="h-4 w-4 mr-2" /> Excel</Button>
          <Button onClick={() => { setEditingItem(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Add Item
          </Button>
        </div>
      </div>

      <Card>
        <AuditLogDialog
          open={!!auditRecord}
          onOpenChange={(open) => { if (!open) setAuditRecord(null); }}
          module="inventory"
          recordId={auditRecord?.id}
          recordName={auditRecord?.title}
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Reorder Level</TableHead>
              <TableHead>Cost Price</TableHead>
              <TableHead>Selling Price</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingInventory ? (
              <TableRow><TableCell colSpan={11} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : inventoryData?.data?.length === 0 ? (
              <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No items found</TableCell></TableRow>
            ) : (
              inventoryData?.data?.map((item) => {
                const isOutOfStock = item.quantity <= 0;
                const isLowStock = item.quantity > 0 && item.quantity <= item.reorderLevel;
                const rowClassName = isLowStock ? "bg-amber-50 hover:bg-amber-100/50" : "hover:bg-muted/20";
                
                return (
                  <TableRow key={item.id} className={rowClassName}>
                    <TableCell className="font-medium text-xs">{item.sku}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell className="font-medium">{item.quantity}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell>{item.reorderLevel}</TableCell>
                    <TableCell>{formatCurrency(item.costPrice || 0)}</TableCell>
                    <TableCell>{formatCurrency(item.sellingPrice || 0)}</TableCell>
                    <TableCell>{item.location}</TableCell>
                    <TableCell>
                      {isOutOfStock ? (
                        <span className="bg-red-100 text-red-700 border border-red-200 rounded-full px-2 py-0.5 text-xs font-medium">Out of Stock</span>
                      ) : isLowStock ? (
                        <span className="bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 text-xs font-medium">Low Stock</span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 text-xs font-medium">In Stock</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => { setAuditRecord({ id: item.id, module: "inventory", title: item.name || item.sku || "Inventory Item" }); }}>
                          <History className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => { setEditingItem(item); setDialogOpen(true); }}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-red-500"><Trash2 className="h-4 w-4" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Delete Item?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(item.id)} className="bg-red-500 hover:bg-red-600">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <Pagination
          page={page}
          totalPages={inventoryData?.pagination?.totalPages || 1}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editingItem ? 'Edit Item' : 'Add Item'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>SKU</Label>
              <Input name="sku" defaultValue={editingItem?.sku} required />
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input name="name" defaultValue={editingItem?.name} required />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select name="category" defaultValue={editingItem?.category || 'Electronics'}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Electronics">Electronics</SelectItem>
                  <SelectItem value="Raw Materials">Raw Materials</SelectItem>
                  <SelectItem value="Finished Goods">Finished Goods</SelectItem>
                  <SelectItem value="Office Supplies">Office Supplies</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Select name="unit" defaultValue={editingItem?.unit || 'pcs'}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pcs">pcs</SelectItem>
                  <SelectItem value="rolls">rolls</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="liters">liters</SelectItem>
                  <SelectItem value="meters">meters</SelectItem>
                  <SelectItem value="sets">sets</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input name="quantity" type="number" defaultValue={editingItem?.quantity || 0} required />
            </div>
            <div className="space-y-2">
              <Label>Reorder Level</Label>
              <Input name="reorderLevel" type="number" defaultValue={editingItem?.reorderLevel || 10} required />
            </div>
            <div className="space-y-2">
              <Label>Cost Price (₹)</Label>
              <Input name="costPrice" type="number" step="0.01" defaultValue={editingItem?.costPrice || 0} required />
            </div>
            <div className="space-y-2">
              <Label>Selling Price (₹)</Label>
              <Input name="sellingPrice" type="number" step="0.01" defaultValue={editingItem?.sellingPrice || 0} required />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Location</Label>
              <Input name="location" defaultValue={editingItem?.location} placeholder="Warehouse A, Shelf 3" />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Description</Label>
              <Textarea name="description" defaultValue={editingItem?.description} />
            </div>
            <DialogFooter className="col-span-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
