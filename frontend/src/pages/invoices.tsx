import { useState, useRef } from "react";
import { useListInvoices, useCreateInvoice, useUpdateInvoice, useDeleteInvoice, useGetInvoiceStats, useListAuditLogs, getListInvoicesQueryKey, getListAuditLogsQueryKey, useListProjects, useListCustomers } from "@workspace/api-client-react";
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
import { Pagination } from "@/components/Pagination";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { downloadImportTemplate, importModuleFile } from "@/lib/import-utils";
import { downloadRowsAsCsv, openRowsPdfPrint } from "@/lib/export-utils";
import { AlertTriangle, CheckCircle, IndianRupee, Loader2, Plus, Search, FileDown, FileSpreadsheet, Edit, Trash2, History, Trash, Upload, Receipt, Eye } from "lucide-react";

export default function Invoices() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lineItems, setLineItems] = useState<any[]>([{ description: '', quantity: 1, unitPrice: 0, taxRate: 0 }]);
  const [auditSheetOpen, setAuditSheetOpen] = useState(false);
  const [auditInvoice, setAuditInvoice] = useState<any>(null);
  const [projectId, setProjectId] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [detailInvoice, setDetailInvoice] = useState<any>(null);

  const { data: stats, isLoading: loadingStats } = useGetInvoiceStats();
  const { data: projectsData } = useListProjects({ page: 1, limit: 100 });
  const { data: customersData } = useListCustomers({ page: 1, limit: 100 });
  const filteredProjects = (projectsData?.data || []).filter((project: any) => !customerId || String(project.customerId || "") === customerId);

  const queryParams = {
    page,
    limit: pageSize,
    ...(search && { search }),
    ...(statusFilter !== "all" && { status: statusFilter }),
  };

  const { data: invoicesData, isLoading: loadingInvoices } = useListInvoices(queryParams);
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  const deleteInvoice = useDeleteInvoice();

  const auditParams = {
    module: "invoices" as any,
    recordId: auditInvoice?.id,
    limit: 50
  };
  const { data: auditData, isLoading: loadingAudit } = useListAuditLogs(auditParams, { query: { enabled: !!auditInvoice, queryKey: getListAuditLogsQueryKey(auditParams) } });

  const handleTemplateDownload = async () => {
    try {
      await downloadImportTemplate("invoices", "invoices-template.xlsx");
      toast({ title: "Invoice template downloaded" });
    } catch (err: any) {
      toast({ title: "Template download failed", description: err.message || "Unable to download template", variant: "destructive" });
    }
  };

  const handleImportInvoices = async (file: File) => {
    try {
      const response = await importModuleFile("invoices", file);
      queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
      toast({ title: `Imported ${response.imported || 0} invoices` });
    } catch (err: any) {
      toast({ title: "Invoice import failed", description: err.message || "Unable to import file", variant: "destructive" });
    }
  };

  const exportColumns = [
    { header: "Invoice #", value: (invoice: any) => getInvoiceNumber(invoice) },
    { header: "Customer", value: (invoice: any) => invoice.customerName || invoice.customerId || "-" },
    { header: "Project", value: (invoice: any) => invoice.projectName || invoice.projectId || "-" },
    { header: "Status", value: (invoice: any) => invoice.status || "-" },
    { header: "Issue Date", value: (invoice: any) => invoice.issueDate || "-" },
    { header: "Due Date", value: (invoice: any) => invoice.dueDate || "-" },
    { header: "Total", value: (invoice: any) => Number(invoice.totalAmount || 0) },
    { header: "Paid", value: (invoice: any) => Number(invoice.paidAmount || 0) },
    { header: "Balance", value: (invoice: any) => Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0) },
  ];

  const handleExportPDF = async () => {
    const rows = invoicesData?.data || [];
    if (!(await openRowsPdfPrint("Invoices", rows, exportColumns))) {
      toast({ title: "Export failed", description: "No invoice data available to export.", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Invoice PDF view opened." });
  };
  const handleExportExcel = () => {
    const rows = invoicesData?.data || [];
    if (!downloadRowsAsCsv("invoices.csv", rows, exportColumns)) {
      toast({ title: "Export failed", description: "No invoice data available to export.", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Invoice Excel file downloaded." });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0);
  };

  const formatAuditField = (field: string) => field.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());

  const formatAuditValue = (field: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return "-";
    const normalizedField = field.toLowerCase();
    const id = Number(value);
    if (normalizedField === "customerid" && Number.isFinite(id)) {
      const customer = customersData?.data?.find((item: any) => Number(item.id) === id);
      return customer?.name || customer?.company || `Customer #${value}`;
    }
    if (normalizedField === "projectid" && Number.isFinite(id)) {
      const project = (projectsData?.data || []).find((item: any) => Number(item.id) === id);
      return project?.name || `Project #${value}`;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value, null, 2);
  };

  const buildAuditChanges = (log: any) => {
    const oldValues = log.oldValues && typeof log.oldValues === "object" ? log.oldValues : {};
    const newValues = log.newValues && typeof log.newValues === "object" ? log.newValues : {};
    const keys = Array.from(new Set([...Object.keys(oldValues), ...Object.keys(newValues)]));
    return keys
      .filter((key) => JSON.stringify((oldValues as any)[key] ?? null) !== JSON.stringify((newValues as any)[key] ?? null))
      .map((key) => ({ field: key, oldValue: (oldValues as any)[key], newValue: (newValues as any)[key] }));
  };

  const getInvoiceNumber = (invoice: any) => {
    const rawNumber = invoice?.invoiceNumber ?? invoice?.invoiceNo ?? invoice?.invoice_no ?? invoice?.no ?? invoice?.code
    const normalized = rawNumber !== undefined && rawNumber !== null ? String(rawNumber).trim() : ""
    if (normalized) return normalized
    return invoice?.id !== undefined ? `INV-${String(invoice.id).padStart(4, "0")}` : "INV-0000"
  }

  const getStatusClassName = (status: string) => {
    const s = status?.toLowerCase() || '';
    if (['paid'].includes(s)) return "bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 text-xs font-medium";
    if (['sent', 'partial'].includes(s)) return "bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 text-xs font-medium";
    if (['overdue'].includes(s)) return "bg-red-100 text-red-700 border border-red-200 rounded-full px-2 py-0.5 text-xs font-medium";
    if (['draft'].includes(s)) return "bg-gray-100 text-gray-700 border border-gray-200 rounded-full px-2 py-0.5 text-xs font-medium";
    return "bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 text-xs font-medium";
  };

  const openEditDialog = (invoice: any) => {
    setEditingInvoice(invoice);
    setLineItems(invoice.items && Array.isArray(invoice.items) && invoice.items.length > 0 ? invoice.items : [{ description: '', quantity: 1, unitPrice: 0, taxRate: 0 }]);
    setCustomerId(invoice.customerId ? String(invoice.customerId) : "");
    setProjectId(invoice.projectId ? String(invoice.projectId) : "");
    setDialogOpen(true);
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let taxTotal = 0;
    lineItems.forEach(item => {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const taxRate = Number(item.taxRate);
      const lineSub = quantity * unitPrice;
      subtotal += lineSub;
      taxTotal += lineSub * (taxRate / 100);
    });
    return { subtotal, taxTotal, grandTotal: subtotal + taxTotal };
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const totals = calculateTotals();
    const payload = {
      customerId: Number(customerId),
      projectId: projectId || undefined,
      issueDate: formData.get("issueDate") as string,
      dueDate: formData.get("dueDate") as string,
      status: formData.get("status") as string,
      notes: formData.get("notes") as string,
      items: lineItems.map(item => ({
        ...item,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        taxRate: Number(item.taxRate),
      })),
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      totalAmount: totals.grandTotal,
      quotationNumber: formData.get("quotationNumber") as string,
      poNumber: formData.get("poNumber") as string,
      vendorCode: formData.get("vendorCode") as string,
      deliveryNote: formData.get("deliveryNote") as string,
      deliveryNoteDate: formData.get("deliveryNoteDate") as string,
      supplierRef: formData.get("supplierRef") as string,
      otherReferences: formData.get("otherReferences") as string,
      destination: formData.get("destination") as string,
      termsOfDelivery: formData.get("termsOfDelivery") as string,
      modeTermsOfPayment: formData.get("modeTermsOfPayment") as string,
      termsConditions: formData.get("termsConditions") as string,
    };

    try {
      if (editingInvoice) {
        await updateInvoice.mutateAsync({ id: editingInvoice.id, data: payload as any });
        toast({ title: "Success", description: "Invoice updated successfully" });
      } else {
        await createInvoice.mutateAsync({ data: payload as any });
        toast({ title: "Success", description: "Invoice created successfully" });
      }
      queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
      setDialogOpen(false);
      setEditingInvoice(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save Invoice", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadInvoiceFile = async (invoice: any, type: "pdf" | "excel") => {
    const token = localStorage.getItem("token");
    const response = await fetch(`/api/invoices/${invoice.id}/${type}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      toast({ title: "Download failed", description: `Unable to download ${type.toUpperCase()}`, variant: "destructive" });
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${getInvoiceNumber(invoice)}.${type === "pdf" ? "pdf" : "xlsx"}`.replace(/\s+/g, "-").toLowerCase();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteInvoice.mutateAsync({ id });
      toast({ title: "Success", description: "Invoice deleted successfully" });
      queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete Invoice", variant: "destructive" });
    }
  };

  const totals = calculateTotals();

  return (
    <div className="space-y-6">
      <PageHeader title="Invoices" description="Manage billing and payments" />

      {!loadingStats && stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Total Invoiced" value={formatCurrency(stats.totalInvoiced || 0)} icon={Receipt} bg="bg-blue-600" />
          <MetricCard label="Total Paid" value={formatCurrency(stats.totalPaid || 0)} icon={CheckCircle} bg="bg-emerald-600" />
          <MetricCard label="Overdue" value={formatCurrency(stats.totalOverdue || 0)} icon={AlertTriangle} bg="bg-red-600" />
          <MetricCard label="Pending" value={formatCurrency(stats.totalPending || 0)} icon={IndianRupee} bg="bg-amber-500" />
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent searchable>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleTemplateDownload}><FileDown className="h-4 w-4 mr-2" /> Template</Button>
          <label>
            <Button variant="outline" size="sm" asChild>
              <span><Upload className="h-4 w-4 mr-2" /> Import</span>
            </Button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) handleImportInvoices(file); if (e.target) e.target.value = ""; }} />
          </label>
          <Button variant="outline" size="sm" onClick={handleExportPDF}><FileDown className="h-4 w-4 mr-2" /> PDF</Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}><FileSpreadsheet className="h-4 w-4 mr-2" /> Excel</Button>
          <Button onClick={() => { setEditingInvoice(null); setLineItems([{ description: '', quantity: 1, unitPrice: 0, taxRate: 0 }]); setCustomerId(""); setProjectId(""); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Create Invoice
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Issue Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingInvoices ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : invoicesData?.data?.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No invoices found</TableCell></TableRow>
            ) : (
              invoicesData?.data?.map((invoice) => (
                <TableRow key={invoice.id} className="hover:bg-muted/20">
                  <TableCell className="font-medium"><button className="text-foreground underline-offset-2 hover:text-foreground hover:underline" onClick={() => setDetailInvoice(invoice)}>{getInvoiceNumber(invoice)}</button></TableCell>
                  <TableCell>{(invoice as any).customerName || (invoice.customerId ? `#${invoice.customerId}` : '-')}</TableCell>
                  <TableCell>{(invoice as any).projectName || ((invoice as any).projectId ? `#${(invoice as any).projectId}` : '-')}</TableCell>
                  <TableCell><span className={getStatusClassName(invoice.status)}>{invoice.status}</span></TableCell>
                  <TableCell>{invoice.issueDate && format(new Date(invoice.issueDate), 'dd MMM yyyy')}</TableCell>
                  <TableCell>{invoice.dueDate ? format(new Date(invoice.dueDate), 'dd MMM yyyy') : '-'}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(invoice.totalAmount || 0)}</TableCell>
                  <TableCell className="text-right text-emerald-600">{formatCurrency(invoice.paidAmount || 0)}</TableCell>
                  <TableCell className="text-right font-medium text-red-600">{formatCurrency((invoice.totalAmount || 0) - (invoice.paidAmount || 0))}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" title="Audit history" onClick={() => { setAuditInvoice(invoice); setAuditSheetOpen(true); }}><History className="h-4 w-4 text-muted-foreground" /></Button>
                      <Button variant="ghost" size="icon" title="View invoice" onClick={() => setDetailInvoice(invoice)}><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Download PDF" onClick={() => downloadInvoiceFile(invoice, "pdf")}><FileDown className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Download Excel" onClick={() => downloadInvoiceFile(invoice, "excel")}><FileSpreadsheet className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Edit invoice" onClick={() => openEditDialog(invoice)}><Edit className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" title="Delete invoice" className="text-red-500"><Trash2 className="h-4 w-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete Invoice?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(invoice.id)} className="bg-red-500 hover:bg-red-600">Delete</AlertDialogAction>
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
          totalPages={invoicesData?.pagination?.totalPages || 1}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingInvoice ? 'Edit Invoice' : 'Create Invoice'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select value={customerId} onValueChange={(value) => { setCustomerId(value); setProjectId(""); }} required>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent searchable>
                    {(customersData?.data || []).map((customer: any) => (
                      <SelectItem key={customer.id} value={String(customer.id)} searchText={customer.name}>{customer.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Project</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger><SelectValue placeholder="Select project (optional)" /></SelectTrigger>
                  <SelectContent searchable>
                    {filteredProjects.map((project: any) => (
                      <SelectItem key={project.id} value={String(project.id)} searchText={project.name}>{project.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select name="status" defaultValue={editingInvoice?.status || 'draft'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent searchable>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quotation Number</Label>
                <Input name="quotationNumber" defaultValue={editingInvoice?.quotationNumber || ""} placeholder="Qtn No / Date" />
              </div>
              <div className="space-y-2">
                <Label>PO Number</Label>
                <Input name="poNumber" defaultValue={editingInvoice?.poNumber || ""} placeholder="Buyer's order No" />
              </div>
              <div className="space-y-2">
                <Label>Mode / Terms of Payment</Label>
                <Input name="modeTermsOfPayment" defaultValue={editingInvoice?.modeTermsOfPayment || "100% payment"} />
              </div>
              <div className="space-y-2">
                <Label>Vendor Code</Label>
                <Input name="vendorCode" defaultValue={editingInvoice?.vendorCode || ""} />
              </div>
              <div className="space-y-2">
                <Label>Delivery Note</Label>
                <Input name="deliveryNote" defaultValue={editingInvoice?.deliveryNote || ""} />
              </div>
              <div className="space-y-2">
                <Label>Delivery Note Date</Label>
                <Input name="deliveryNoteDate" type="date" defaultValue={editingInvoice?.deliveryNoteDate ? format(new Date(editingInvoice.deliveryNoteDate), 'yyyy-MM-dd') : ""} />
              </div>
              <div className="space-y-2">
                <Label>Supplier's Ref.</Label>
                <Input name="supplierRef" defaultValue={editingInvoice?.supplierRef || ""} />
              </div>
              <div className="space-y-2">
                <Label>Destination</Label>
                <Input name="destination" defaultValue={editingInvoice?.destination || ""} />
              </div>
              <div className="space-y-2">
                <Label>Terms of Delivery</Label>
                <Input name="termsOfDelivery" defaultValue={editingInvoice?.termsOfDelivery || "IMMEDIATE"} />
              </div>
              <div className="space-y-2">
                <Label>Issue Date</Label>
                <Input name="issueDate" type="date" defaultValue={editingInvoice?.issueDate ? format(new Date(editingInvoice.issueDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')} required />
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input name="dueDate" type="date" defaultValue={editingInvoice?.dueDate ? format(new Date(editingInvoice.dueDate), 'yyyy-MM-dd') : ''} required />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Other Reference(s)</Label>
                <Textarea name="otherReferences" defaultValue={editingInvoice?.otherReferences || ""} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Terms & Conditions</Label>
                <Textarea name="termsConditions" defaultValue={editingInvoice?.termsConditions || "Kindly pay the Due Amount Immediate"} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Notes</Label>
                <Textarea name="notes" defaultValue={editingInvoice?.notes} />
              </div>
            </div>

            <div className="border rounded-md p-4 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-medium">Line Items</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => setLineItems([...lineItems, { description: '', quantity: 1, unitPrice: 0, taxRate: 0 }])}>Add Item</Button>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-[minmax(180px,1fr)_80px_80px_112px_80px_96px_40px] gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Description</span>
                  <span>HSN/SAC</span>
                  <span>Qty</span>
                  <span>Unit Price</span>
                  <span>Tax %</span>
                  <span className="text-right">Amount</span>
                  <span />
                </div>
                {lineItems.map((item, index) => (
                  <div key={index} className="grid grid-cols-[minmax(180px,1fr)_80px_80px_112px_80px_96px_40px] gap-2 items-center">
                    <Input placeholder="Description" value={item.description} onChange={(e) => {
                      const newItems = [...lineItems]; newItems[index].description = e.target.value; setLineItems(newItems);
                    }} required />
                    <Input placeholder="HSN" value={item.hsn || ""} onChange={(e) => {
                      const newItems = [...lineItems]; newItems[index].hsn = e.target.value; setLineItems(newItems);
                    }} />
                    <Input type="number" placeholder="Qty" value={item.quantity} onChange={(e) => {
                      const newItems = [...lineItems]; newItems[index].quantity = e.target.value; setLineItems(newItems);
                    }} min="1" required />
                    <Input type="number" placeholder="Price" value={item.unitPrice} onChange={(e) => {
                      const newItems = [...lineItems]; newItems[index].unitPrice = e.target.value; setLineItems(newItems);
                    }} min="0" step="0.01" required />
                    <Input type="number" placeholder="Tax %" value={item.taxRate} onChange={(e) => {
                      const newItems = [...lineItems]; newItems[index].taxRate = e.target.value; setLineItems(newItems);
                    }} min="0" step="0.01" />
                    <div className="text-right text-sm font-medium">{formatCurrency((item.quantity * item.unitPrice) * (1 + item.taxRate / 100))}</div>
                    <Button type="button" variant="ghost" size="icon" title="Remove line item" onClick={() => {
                      const newItems = lineItems.filter((_, i) => i !== index);
                      setLineItems(newItems.length ? newItems : [{ description: '', quantity: 1, unitPrice: 0, taxRate: 0 }]);
                    }}><Trash className="h-4 w-4 text-red-500" /></Button>
                  </div>
                ))}
              </div>
              <div className="flex flex-col items-end pt-4 border-t gap-1 text-sm">
                <div>Subtotal: {formatCurrency(totals.subtotal)}</div>
                <div>Tax: {formatCurrency(totals.taxTotal)}</div>
                <div className="text-xl font-bold mt-2">Total: {formatCurrency(totals.grandTotal)}</div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={!!detailInvoice} onOpenChange={(open) => !open && setDetailInvoice(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detailInvoice ? getInvoiceNumber(detailInvoice) : "Invoice Details"}</SheetTitle>
            <SheetDescription>{detailInvoice?.customerName} {detailInvoice?.projectName ? `- ${detailInvoice.projectName}` : ""}</SheetDescription>
          </SheetHeader>
          {detailInvoice && (
            <div className="mt-6 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Invoice No.", getInvoiceNumber(detailInvoice)],
                  ["Quotation No.", detailInvoice.quotationNumber],
                  ["PO Number", detailInvoice.poNumber],
                  ["Payment Terms", detailInvoice.modeTermsOfPayment],
                  ["Issue Date", detailInvoice.issueDate],
                  ["Due Date", detailInvoice.dueDate],
                  ["Destination", detailInvoice.destination],
                  ["Terms of Delivery", detailInvoice.termsOfDelivery],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="font-medium">{value || "-"}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-md border p-3">
                <div className="font-semibold">Line Items</div>
                <div className="mt-3 space-y-2">
                  {(detailInvoice.items || []).map((item: any, index: number) => (
                    <div key={index} className="flex justify-between gap-3 border-b pb-2">
                      <div><div className="font-medium">{item.description}</div><div className="text-xs text-muted-foreground">HSN/SAC: {item.hsn || "-"} | Qty: {item.quantity}</div></div>
                      <div className="font-semibold">{formatCurrency(Number(item.quantity || 0) * Number(item.unitPrice || 0))}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(detailInvoice.subtotal)}</span></div>
                <div className="flex justify-between"><span>CGST</span><span>{formatCurrency(Number(detailInvoice.taxAmount || 0) / 2)}</span></div>
                <div className="flex justify-between"><span>SGST</span><span>{formatCurrency(Number(detailInvoice.taxAmount || 0) / 2)}</span></div>
                <div className="mt-2 flex justify-between border-t pt-2 text-base font-bold"><span>Total</span><span>{formatCurrency(detailInvoice.totalAmount)}</span></div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => downloadInvoiceFile(detailInvoice, "pdf")}><FileDown className="h-4 w-4 mr-2" />PDF</Button>
                <Button variant="outline" onClick={() => downloadInvoiceFile(detailInvoice, "excel")}><FileSpreadsheet className="h-4 w-4 mr-2" />Excel</Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Audit Logs Sheet */}
      <Sheet open={auditSheetOpen} onOpenChange={setAuditSheetOpen}>
        <SheetContent className="sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Audit History</SheetTitle>
            <SheetDescription>Timeline of changes for Invoice #{auditInvoice?.id}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            {loadingAudit ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : auditData?.data?.length === 0 ? (
              <div className="text-center text-muted-foreground p-8">No audit logs found</div>
            ) : (
              auditData?.data?.map((log) => {
                const changes = buildAuditChanges(log);
                return (
                <div key={log.id} className="border rounded-lg p-4 bg-muted/30 space-y-3">
                  <div>
                    <p className="font-medium text-sm">{log.description}</p>
                    <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                      <span>{log.userName || "System"}</span>
                      <span>-</span>
                      <span>{log.createdAt ? format(new Date(log.createdAt), 'dd MMM yyyy HH:mm') : "-"}</span>
                    </div>
                  </div>
                  {changes.length ? (
                    <div className="overflow-hidden rounded-lg border bg-background">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-36">Field</TableHead>
                            <TableHead>Old Value</TableHead>
                            <TableHead>New Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {changes.map((change) => (
                            <TableRow key={change.field}>
                              <TableCell className="font-medium align-top">{formatAuditField(change.field)}</TableCell>
                              <TableCell className="max-w-[220px] whitespace-pre-wrap break-words align-top text-red-700">{formatAuditValue(change.field, change.oldValue)}</TableCell>
                              <TableCell className="max-w-[220px] whitespace-pre-wrap break-words align-top text-emerald-700">{formatAuditValue(change.field, change.newValue)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No field-level values were captured for this log.</div>
                  )}
                </div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
