import { useState } from "react";
import { useListInventoryMovements, useCreateInventoryMovement, getListInventoryMovementsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination } from "@/components/Pagination";
import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, Loader2, Plus, Search, FileDown, FileSpreadsheet } from "lucide-react";
import { downloadRowsAsCsv, openRowsPdfPrint } from "@/lib/export-utils";

export default function InventoryMovements() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const queryParams = {
    page,
    limit: pageSize,
    ...(search && { search }),
  };

  const { data: movementsData, isLoading: loadingMovements } = useListInventoryMovements(queryParams);
  const createMovement = useCreateInventoryMovement();
  const movementRows = movementsData?.data || [];

  const exportColumns = [
    { header: "Date", value: (movement: any) => movement.createdAt || movement.date || "-" },
    { header: "Item", value: (movement: any) => movement.itemName || movement.itemId || "-" },
    { header: "Type", value: (movement: any) => movement.type || "-" },
    { header: "Quantity", value: (movement: any) => Number(movement.quantity || 0) },
    { header: "Previous Stock", value: (movement: any) => Number(movement.previousStock || 0) },
    { header: "Current Stock", value: (movement: any) => Number(movement.currentStock || 0) },
    { header: "Reference", value: (movement: any) => movement.reference || "-" },
    { header: "Created By", value: (movement: any) => movement.createdBy || "-" },
  ];
  const handleExportPDF = () => {
    if (!openRowsPdfPrint("Inventory Movements", movementRows, exportColumns)) {
      toast({ title: "Export failed", description: "No movement data available.", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Inventory movement PDF view opened." });
  };
  const handleExportExcel = () => {
    if (!downloadRowsAsCsv("inventory-movements.csv", movementRows, exportColumns)) {
      toast({ title: "Export failed", description: "No movement data available.", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Inventory movement Excel file downloaded." });
  };

  const getTypeClassName = (type: string) => {
    switch (type) {
      case 'IN': return "bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 text-xs font-medium";
      case 'OUT': return "bg-red-100 text-red-700 border border-red-200 rounded-full px-2 py-0.5 text-xs font-medium";
      case 'TRANSFER': return "bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 text-xs font-medium";
      case 'ADJUSTMENT': return "bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 text-xs font-medium";
      default: return "bg-gray-100 text-gray-700 border border-gray-200 rounded-full px-2 py-0.5 text-xs font-medium";
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const formData = new FormData(e.currentTarget);
    const payload = {
      itemId: Number(formData.get("itemId")),
      type: formData.get("type") as string,
      quantity: Number(formData.get("quantity")),
      reference: formData.get("reference") as string,
      notes: formData.get("notes") as string,
    };

    try {
      await createMovement.mutateAsync({ data: payload as any });
      toast({ title: "Success", description: "Movement recorded successfully" });
      queryClient.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
      setDialogOpen(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to record movement", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory Movements" description="Track stock ins, outs, and transfers" />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Total Movements" value={movementsData?.pagination?.total || movementRows.length} icon={ArrowRightLeft} bg="bg-blue-600" />
        <MetricCard label="Stock In" value={movementRows.filter((movement: any) => movement.type === "IN").length} icon={ArrowDownToLine} bg="bg-emerald-600" />
        <MetricCard label="Stock Out" value={movementRows.filter((movement: any) => movement.type === "OUT").length} icon={ArrowUpFromLine} bg="bg-red-600" />
        <MetricCard label="Adjustments" value={movementRows.filter((movement: any) => movement.type === "ADJUSTMENT").length} icon={FileSpreadsheet} bg="bg-amber-500" />
      </div>

      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search movements..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-8" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportPDF}><FileDown className="h-4 w-4 mr-2" /> PDF</Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}><FileSpreadsheet className="h-4 w-4 mr-2" /> Excel</Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Record Movement
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Previous Stock</TableHead>
              <TableHead>Current Stock</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Created By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingMovements ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : movementsData?.data?.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No movements found</TableCell></TableRow>
            ) : (
              movementsData?.data?.map((movement: any) => (
                <TableRow key={movement.id} className="hover:bg-muted/20">
                  <TableCell>{format(new Date(movement.createdAt || new Date()), 'dd MMM yyyy HH:mm')}</TableCell>
                  <TableCell className="font-medium">{movement.item?.name || `Item #${movement.itemId}`}</TableCell>
                  <TableCell><span className={getTypeClassName(movement.type)}>{movement.type}</span></TableCell>
                  <TableCell className="font-medium">{movement.type === 'OUT' ? '-' : '+'}{movement.quantity}</TableCell>
                  <TableCell>{movement.previousStock || 0}</TableCell>
                  <TableCell>{movement.currentStock || 0}</TableCell>
                  <TableCell>{movement.reference || '-'}</TableCell>
                  <TableCell>{movement.createdBy ? `User #${movement.createdBy}` : '-'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <Pagination
          page={page}
          totalPages={movementsData?.pagination?.totalPages || 1}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Inventory Movement</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="grid gap-4">
            <div className="space-y-2">
              <Label>Item ID</Label>
              <Input name="itemId" type="number" required />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select name="type" defaultValue="IN">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN">IN (Receive Stock)</SelectItem>
                  <SelectItem value="OUT">OUT (Issue Stock)</SelectItem>
                  <SelectItem value="TRANSFER">TRANSFER (Move Stock)</SelectItem>
                  <SelectItem value="ADJUSTMENT">ADJUSTMENT (Count Correction)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input name="quantity" type="number" required />
            </div>
            <div className="space-y-2">
              <Label>Reference</Label>
              <Input name="reference" placeholder="PO Number, Invoice, etc." />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input name="notes" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Record
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
