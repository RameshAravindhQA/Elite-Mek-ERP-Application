import { useState, useRef } from "react";
import { useListRevenue, useCreateRevenue, useUpdateRevenue, useDeleteRevenue, useGetRevenueStats, getListRevenueQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Pagination } from "@/components/Pagination";
import { downloadImportTemplate, importModuleFile } from "@/lib/import-utils";
import { downloadRowsAsCsv, openRowsPdfPrint } from "@/lib/export-utils";
import { BarChart3, IndianRupee, Loader2, Plus, Search, FileDown, FileSpreadsheet, Edit, Trash2, TrendingUp, Upload } from "lucide-react";

export default function Revenue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRevenue, setEditingRevenue] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: stats, isLoading: loadingStats } = useGetRevenueStats();

  const queryParams = {
    page,
    limit: pageSize,
    ...(search && { search }),
    ...(sourceFilter !== "all" && { source: sourceFilter }),
  };

  const { data: revenueData, isLoading: loadingRevenue } = useListRevenue(queryParams);
  const createRevenue = useCreateRevenue();
  const updateRevenue = useUpdateRevenue();
  const deleteRevenue = useDeleteRevenue();

  const handleTemplateDownload = async () => {
    try {
      await downloadImportTemplate("revenue", "revenue-template.xlsx");
      toast({ title: "Revenue template downloaded" });
    } catch (err: any) {
      toast({ title: "Template download failed", description: err.message || "Unable to download template", variant: "destructive" });
    }
  };

  const handleImportRevenue = async (file: File) => {
    try {
      const response = await importModuleFile("revenue", file);
      queryClient.invalidateQueries({ queryKey: getListRevenueQueryKey() });
      toast({ title: `Imported ${response.imported || 0} revenue entries` });
    } catch (err: any) {
      toast({ title: "Revenue import failed", description: err.message || "Unable to import file", variant: "destructive" });
    }
  };

  const exportColumns = [
    { header: "Title", value: (row: any) => row.title || "-" },
    { header: "Source", value: (row: any) => row.source || "-" },
    { header: "Date", value: (row: any) => row.date || "-" },
    { header: "Amount", value: (row: any) => Number(row.amount || 0) },
    { header: "Description", value: (row: any) => row.description || "-" },
  ];
  const handleExportPDF = async () => {
    const rows = revenueData?.data || [];
    if (!(await openRowsPdfPrint("Revenue", rows, exportColumns))) {
      toast({ title: "Export failed", description: "No revenue data available.", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Revenue PDF view opened." });
  };
  const handleExportExcel = () => {
    const rows = revenueData?.data || [];
    if (!downloadRowsAsCsv("revenue.csv", rows, exportColumns)) {
      toast({ title: "Export failed", description: "No revenue data available.", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Revenue Excel file downloaded." });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0);
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const payload = {
      title: formData.get("title") as string,
      source: formData.get("source") as string,
      amount: Number(formData.get("amount")),
      date: formData.get("date") as string,
      customerId: formData.get("customerId") ? Number(formData.get("customerId")) : undefined,
      projectId: formData.get("projectId") ? Number(formData.get("projectId")) : undefined,
      description: formData.get("description") as string,
    };

    try {
      if (editingRevenue) {
        await updateRevenue.mutateAsync({ id: editingRevenue.id, data: payload as any });
        toast({ title: "Success", description: "Revenue entry updated successfully" });
      } else {
        await createRevenue.mutateAsync({ data: payload as any });
        toast({ title: "Success", description: "Revenue entry created successfully" });
      }
      queryClient.invalidateQueries({ queryKey: getListRevenueQueryKey() });
      setDialogOpen(false);
      setEditingRevenue(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save revenue", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteRevenue.mutateAsync({ id });
      toast({ title: "Success", description: "Revenue entry deleted successfully" });
      queryClient.invalidateQueries({ queryKey: getListRevenueQueryKey() });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete revenue", variant: "destructive" });
    }
  };

  const sources = ["Project", "Service", "Product", "Training", "Support", "Other"];

  return (
    <div className="space-y-6">
      <PageHeader title="Revenue" description="Track income and financial inflows" />

      {!loadingStats && stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard label="This Month" value={formatCurrency(stats.totalThisMonth || 0)} icon={IndianRupee} bg="bg-emerald-600" />
          <MetricCard label="This Year" value={formatCurrency(stats.totalThisYear || 0)} icon={BarChart3} bg="bg-blue-600" />
          <MetricCard label="Growth" value={`+${stats.growth || 0}%`} icon={TrendingUp} bg="bg-cyan-600" />
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search revenue..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleTemplateDownload}><FileDown className="h-4 w-4 mr-2" /> Template</Button>
          <label>
            <Button variant="outline" size="sm" asChild>
              <span><Upload className="h-4 w-4 mr-2" /> Import</span>
            </Button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) handleImportRevenue(file); if (e.target) e.target.value = ""; }} />
          </label>
          <Button variant="outline" size="sm" onClick={handleExportPDF}><FileDown className="h-4 w-4 mr-2" /> PDF</Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}><FileSpreadsheet className="h-4 w-4 mr-2" /> Excel</Button>
          <Button onClick={() => { setEditingRevenue(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Add Revenue
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer ID</TableHead>
              <TableHead>Project ID</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingRevenue ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : revenueData?.data?.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No revenue found</TableCell></TableRow>
            ) : (
              revenueData?.data?.map((rev) => (
                <TableRow key={rev.id} className="hover:bg-muted/20">
                  <TableCell className="font-medium">{rev.title}</TableCell>
                  <TableCell><span className="bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 text-xs font-medium">{rev.source}</span></TableCell>
                  <TableCell className="font-medium text-emerald-600">{formatCurrency(rev.amount || 0)}</TableCell>
                  <TableCell>{rev.date && format(new Date(rev.date), 'dd MMM yyyy')}</TableCell>
                  <TableCell>{rev.customerId || '-'}</TableCell>
                  <TableCell>{rev.projectId || '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" title="Edit revenue" onClick={() => { setEditingRevenue(rev); setDialogOpen(true); }}><Edit className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" title="Delete revenue" className="text-red-500"><Trash2 className="h-4 w-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete Revenue?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(rev.id)} className="bg-red-500 hover:bg-red-600">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <Pagination
          page={page}
          totalPages={revenueData?.pagination?.totalPages || 1}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingRevenue ? 'Edit Revenue' : 'Add Revenue'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="grid gap-4 grid-cols-2">
            <div className="space-y-2 col-span-2">
              <Label>Title</Label>
              <Input name="title" defaultValue={editingRevenue?.title} required />
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Select name="source" defaultValue={editingRevenue?.source || 'Project'}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input name="amount" type="number" step="0.01" defaultValue={editingRevenue?.amount} required />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input name="date" type="date" defaultValue={editingRevenue?.date ? format(new Date(editingRevenue.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')} required />
            </div>
            <div className="space-y-2">
              <Label>Customer ID (Optional)</Label>
              <Input name="customerId" type="number" defaultValue={editingRevenue?.customerId} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Project ID (Optional)</Label>
              <Input name="projectId" type="number" defaultValue={editingRevenue?.projectId} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Description</Label>
              <Textarea name="description" defaultValue={editingRevenue?.description} />
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
