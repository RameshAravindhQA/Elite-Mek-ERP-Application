import { useState, useRef } from "react";
import { useListPurchaseOrders, useListCustomers, useListProjects, useCreatePurchaseOrder, useUpdatePurchaseOrder, useDeletePurchaseOrder, useListAuditLogs, getListPurchaseOrdersQueryKey, getListAuditLogsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api-client";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Pagination } from "@/components/Pagination";
import { downloadImportTemplate, importModuleFile } from "@/lib/import-utils";
import { downloadRowsAsCsv } from "@/lib/export-utils";
import { CheckCircle, Clock, IndianRupee, Loader2, Plus, Search, FileDown, FileSpreadsheet, Edit, Trash2, History, Trash, Upload, ShoppingCart } from "lucide-react";

export default function PurchaseOrders() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lineItems, setLineItems] = useState<any[]>([{ itemName: '', quantity: 1, unitPrice: 0 }]);
  const [detailsSheetOpen, setDetailsSheetOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [auditSheetOpen, setAuditSheetOpen] = useState(false);
  const [auditPO, setAuditPO] = useState<any>(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [selectedEmailPO, setSelectedEmailPO] = useState<any>(null);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [isEmailSending, setIsEmailSending] = useState(false);

  const queryParams = {
    page,
    limit: pageSize,
    ...(search && { search }),
    ...(statusFilter !== "all" && { status: statusFilter }),
  };

  const isFiltered = search.trim().length > 0 || statusFilter !== "all";

  const { data: posData, isLoading: loadingPOs } = useListPurchaseOrders(queryParams);
  const { data: customersData } = useListCustomers({ page: 1, limit: 100 });
  const { data: projectsData } = useListProjects({ page: 1, limit: 100 });
  const projects = projectsData?.data || [];
  const poRows = posData?.data || [];
  const poTotalAmount = poRows.reduce((sum: number, po: any) => sum + Number(po.totalAmount || 0), 0);
  const openPoCount = poRows.filter((po: any) => ["draft", "pending", "sent", "approved"].includes(String(po.status).toLowerCase())).length;
  const deliveredPoCount = poRows.filter((po: any) => ["delivered", "completed"].includes(String(po.status).toLowerCase())).length;
  const createPO = useCreatePurchaseOrder();
  const updatePO = useUpdatePurchaseOrder();
  const deletePO = useDeletePurchaseOrder();

  const auditParams = {
    module: "purchase_orders" as any,
    recordId: auditPO?.id,
    limit: 50
  };
  const { data: auditData, isLoading: loadingAudit } = useListAuditLogs(auditParams, { query: { enabled: !!auditPO, queryKey: getListAuditLogsQueryKey(auditParams) } });

  const loadDocumentSettings = () => {
    return {
      companyName: localStorage.getItem("company-name") || "Elite Mek Excellence in Engineering",
      companyLogo: localStorage.getItem("company-logo") || "",
      pdfHeaderContent: localStorage.getItem("pdf-header-content") || "",
      pdfFooterContent: localStorage.getItem("pdf-footer-content") || "",
      pdfFormatting: localStorage.getItem("pdf-formatting") || "",
    };
  };

  const handleTemplateDownload = async () => {
    try {
      await downloadImportTemplate("purchase-orders", "purchase-orders-template.xlsx");
      toast({ title: "PO template downloaded" });
    } catch (err: any) {
      toast({ title: "Template download failed", description: err.message || "Unable to download template", variant: "destructive" });
    }
  };

  const downloadPurchaseOrderPdf = async (po: any) => {
    if (!po) {
      toast({ title: "Select a PO first", description: "Pick a purchase order to download." });
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      toast({ title: "Download failed", description: "You must be logged in to download PDFs", variant: "destructive" });
      return;
    }

    try {
      const response = await fetch(`/api/purchase-orders/${po.id}/pdf`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/pdf",
        },
      });

      if (!response.ok) {
        let message = `Unable to download PDF (HTTP ${response.status})`;
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await response.json().catch(() => null);
          message = data?.error || data?.message || message;
        } else {
          const text = await response.text().catch(() => "");
          if (text) message = text;
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${po.poNumber || `purchase-order-${po.id}`}.pdf`;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      toast({ title: "Success", description: `Purchase Order ${po.poNumber || po.id} is downloading.` });
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message || "Unable to download PO PDF", variant: "destructive" });
    }
  };

  const openEmailDialog = (po: any) => {
    setSelectedEmailPO(po);
    setEmailRecipient("");
    setEmailSubject(`Purchase Order ${po.poNumber || `PO-${po.id}`}`);
    setEmailMessage(`Please find attached Purchase Order ${po.poNumber || `PO-${po.id}`}.`);
    setEmailDialogOpen(true);
  };

  const handleSendEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedEmailPO) return;
    setIsEmailSending(true);

    try {
      await apiClient.post(`/purchase-orders/${selectedEmailPO.id}/email`, {
        to: emailRecipient,
        subject: emailSubject,
        message: emailMessage,
      });
      toast({ title: "Email sent", description: `Purchase Order ${selectedEmailPO.poNumber} was emailed to ${emailRecipient}` });
      setEmailDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Email failed", description: err.message || "Unable to send purchase order", variant: "destructive" });
    } finally {
      setIsEmailSending(false);
    }
  };

  const printPurchaseOrder = (po: any) => {
    if (!po) return;
    const settings = loadDocumentSettings();
    const items = Array.isArray(po.items) ? po.items : [];
    const total = items.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice), 0);
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${po.poNumber || `PO-${String(po.id).padStart(4,'0')}`}</title>
  <style>
    body { font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; color: #111; margin: 24px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 24px; }
    .brand { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .subtitle { margin-top: 4px; color: #475569; font-size: 12px; line-height: 1.5; }
    .logo { max-height: 64px; max-width: 160px; object-fit: contain; }
    .meta { text-align:right; font-size: 13px; color: #475569; }
    .section-title { margin: 24px 0 12px; font-size: 14px; font-weight: 700; letter-spacing: 0.01em; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th, td { border: 1px solid #D1D5DB; padding: 12px 10px; text-align:left; }
    th { background: #EFF6FF; color: #0F172A; font-weight: 700; }
    td { color: #1F2937; }
    .total-row td { font-weight: 700; border-top: 2px solid #0F172A; }
    .footer { margin-top: 24px; font-size: 12px; color: #475569; line-height: 1.6; }
    .notes { background: #F8FAFC; border: 1px solid #E2E8F0; padding: 16px; border-radius: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">${settings.companyName}</div>
      <div class="subtitle">${settings.pdfHeaderContent.replace(/\n/g, '<br/>')}</div>
    </div>
    <div class="meta">
      <div><strong>PO No:</strong> ${po.poNumber || `PO-${String(po.id).padStart(4,'0')}`}</div>
      <div><strong>Status:</strong> ${po.status || 'Draft'}</div>
      <div><strong>Order Date:</strong> ${po.orderDate || '-'}</div>
      <div><strong>Delivery Date:</strong> ${po.deliveryDate || '-'}</div>
    </div>
  </div>
  <div class="section-title">Customer & Order Details</div>
  <table>
    <tbody>
      <tr><th>Customer</th><td>${po.customerName || `#${po.customerId}`}</td></tr>
      <tr><th>Project</th><td>${po.projectName || (po.projectId ? `#${po.projectId}` : '-')}</td></tr>
      <tr><th>Project Scope</th><td>${((po as any).scopeDefinition || '-').replace(/\n/g, '<br/>')}</td></tr>
      <tr><th>Notes</th><td>${po.notes || '-'}</td></tr>
    </tbody>
  </table>
  <div class="section-title">Items</div>
  <table>
    <thead>
      <tr><th>Description</th><th class="text-right">Qty</th><th class="text-right">Unit Price</th><th class="text-right">Amount</th></tr>
    </thead>
    <tbody>
      ${items.map((item: any) => `<tr><td>${item.itemName || '-'}</td><td class="text-right">${item.quantity || 0}</td><td class="text-right">${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(item.unitPrice||0)}</td><td class="text-right">${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format((item.quantity||0)*(item.unitPrice||0))}</td></tr>`).join('')}
      <tr class="total-row"><td colspan="3">Grand Total</td><td class="text-right">${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(total)}</td></tr>
    </tbody>
  </table>
  <div class="notes">${settings.pdfFooterContent.replace(/\n/g, '<br/>')}</div>
</body>
</html>`;
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    setTimeout(() => popup.print(), 500);
  };

  const handleImportPurchaseOrders = async (file: File) => {
    try {
      const response = await importModuleFile("purchase-orders", file);
      queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
      toast({ title: `Imported ${response.imported || 0} purchase orders` });
    } catch (err: any) {
      toast({ title: "PO import failed", description: err.message || "Unable to import file", variant: "destructive" });
    }
  };

  const handleExportPDF = () => {
    if (!selectedPO) {
      toast({ title: "Select a PO first", description: "Choose a purchase order before exporting." });
      return;
    }
    downloadPurchaseOrderPdf(selectedPO);
  };
  const handleExportExcel = () => {
    const rows = posData?.data || [];
    const columns = [
      { header: "PO Number", value: (po: any) => po.poNumber || `PO-${String(po.id).padStart(4, "0")}` },
      { header: "Customer", value: (po: any) => po.customerName || po.customerId || "-" },
      { header: "Project", value: (po: any) => po.projectName || po.projectId || "-" },
      { header: "Status", value: (po: any) => po.status || "-" },
      { header: "Order Date", value: (po: any) => po.orderDate || "-" },
      { header: "Delivery Date", value: (po: any) => po.deliveryDate || "-" },
      { header: "Total Amount", value: (po: any) => Number(po.totalAmount || 0) },
    ];
    if (!downloadRowsAsCsv("purchase-orders.csv", rows, columns)) {
      toast({ title: "Export failed", description: "No purchase order data available to export.", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Purchase Order Excel file downloaded." });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0);
  };

  const getStatusClassName = (status: string) => {
    const s = status?.toLowerCase() || '';
    if (['approved', 'delivered', 'paid', 'completed'].includes(s)) return "bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 text-xs font-medium";
    if (['pending', 'draft', 'on_hold'].includes(s)) return "bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 text-xs font-medium";
    if (['rejected', 'cancelled'].includes(s)) return "bg-red-100 text-red-700 border border-red-200 rounded-full px-2 py-0.5 text-xs font-medium";
    if (['sent', 'partial'].includes(s)) return "bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 text-xs font-medium";
    return "bg-gray-100 text-gray-700 border border-gray-200 rounded-full px-2 py-0.5 text-xs font-medium";
  };

  const formatAuditValue = (field: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return "-";
    const normalizedField = field.toLowerCase();
    const id = Number(value);
    if (normalizedField === "customerid" && Number.isFinite(id)) {
      const customer = customersData?.data?.find((item: any) => Number(item.id) === id);
      return customer?.name || customer?.company || `Customer #${value}`;
    }
    if (normalizedField === "projectid" && Number.isFinite(id)) {
      const project = projects.find((item: any) => Number(item.id) === id);
      return project?.name || `Project #${value}`;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value, null, 2);
  };

  const formatAuditField = (field: string) => field.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());

  const buildAuditChanges = (log: any) => {
    const oldValues = log.oldValues && typeof log.oldValues === "object" ? log.oldValues : {};
    const newValues = log.newValues && typeof log.newValues === "object" ? log.newValues : {};
    const keys = Array.from(new Set([...Object.keys(oldValues), ...Object.keys(newValues)]));
    return keys
      .filter((key) => JSON.stringify((oldValues as any)[key] ?? null) !== JSON.stringify((newValues as any)[key] ?? null))
      .map((key) => ({ field: key, oldValue: (oldValues as any)[key], newValue: (newValues as any)[key] }));
  };

  const openEditDialog = (po: any) => {
    setEditingPO(po);
    setLineItems(po.items && Array.isArray(po.items) && po.items.length > 0 ? po.items : [{ itemName: '', quantity: 1, unitPrice: 0 }]);
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const payload = {
      customerId: Number(formData.get("customerId")),
      projectId: formData.get("projectId") ? String(formData.get("projectId")) : undefined,
      orderDate: formData.get("orderDate") as string,
      deliveryDate: formData.get("deliveryDate") as string,
      status: formData.get("status") as string,
      notes: formData.get("notes") as string,
      scopeDefinition: formData.get("scopeDefinition") as string,
      items: lineItems.map(item => ({
        ...item,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      })),
      totalAmount: lineItems.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unitPrice)), 0)
    };

    try {
      if (editingPO) {
        await updatePO.mutateAsync({ id: editingPO.id, data: payload as any });
        toast({ title: "Success", description: "Purchase Order updated successfully" });
      } else {
        await createPO.mutateAsync({ data: payload as any });
        toast({ title: "Success", description: "Purchase Order created successfully" });
      }
      queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
      setDialogOpen(false);
      setEditingPO(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save PO", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deletePO.mutateAsync({ id });
      toast({ title: "Success", description: "Purchase Order deleted successfully" });
      queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete PO", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Purchase Orders" description="Manage POs and track customer orders" />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard label="Total POs" value={posData?.pagination?.total || poRows.length} icon={ShoppingCart} bg="bg-cyan-600" />
        <MetricCard label="Open POs" value={openPoCount} icon={Clock} bg="bg-amber-500" />
        <MetricCard label="Delivered" value={deliveredPoCount} icon={CheckCircle} bg="bg-emerald-600" />
        <MetricCard label="Page Value" value={formatCurrency(poTotalAmount)} icon={IndianRupee} bg="bg-violet-600" />
      </div>

      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search POs or customers..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-8" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(pageSize)} onValueChange={(val) => { setPageSize(Number(val)); setPage(1); }}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Rows" /></SelectTrigger>
            <SelectContent>
              {[5, 10, 25, 50, 100].map((size) => (
                <SelectItem key={size} value={String(size)}>{size} rows</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleTemplateDownload}><FileDown className="h-4 w-4 mr-2" /> Template</Button>
          <label>
            <Button variant="outline" size="sm" asChild>
              <span><Upload className="h-4 w-4 mr-2" /> Import</span>
            </Button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) handleImportPurchaseOrders(file); if (e.target) e.target.value = ""; }} />
          </label>
          <Button variant="outline" size="sm" onClick={handleExportPDF}><FileDown className="h-4 w-4 mr-2" /> PDF</Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}><FileSpreadsheet className="h-4 w-4 mr-2" /> Excel</Button>
          <Button onClick={() => { setEditingPO(null); setLineItems([{ itemName: '', quantity: 1, unitPrice: 0 }]); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Create PO
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO Number</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Order Date</TableHead>
              <TableHead>Delivery Date</TableHead>
              <TableHead className="text-right">Total Amount</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingPOs ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : posData?.data?.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{isFiltered ? "No purchase orders match these filters." : "No purchase orders found."}</TableCell></TableRow>
            ) : (
              posData?.data?.map((po) => {
                const invoice = po as any;
                return (
                  <TableRow key={invoice.id} className="cursor-pointer hover:bg-muted/20" onClick={() => { setSelectedPO(invoice); setDetailsSheetOpen(true); }}>
                    <TableCell className="font-medium">{invoice.poNumber || `PO-${String(invoice.id).padStart(4, '0')}`}</TableCell>
                    <TableCell>{invoice.customerName || `#${invoice.customerId}`}</TableCell>
                    <TableCell>{invoice.projectName || (invoice.projectId ? `#${invoice.projectId}` : '-')}</TableCell>
                    <TableCell><span className={getStatusClassName(invoice.status)}>{invoice.status.replace('_', ' ')}</span></TableCell>
                    <TableCell>{invoice.orderDate && format(new Date(invoice.orderDate), 'dd MMM yyyy')}</TableCell>
                    <TableCell>{po.deliveryDate ? format(new Date(po.deliveryDate), 'dd MMM yyyy') : '-'}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(po.totalAmount || 0)}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" title="Audit history" onClick={() => { setAuditPO(po); setAuditSheetOpen(true); }}><History className="h-4 w-4 text-muted-foreground" /></Button>
                      <Button variant="ghost" size="icon" title="Edit purchase order" onClick={() => openEditDialog(po)}><Edit className="h-4 w-4" /></Button>
                      <Button variant="outline" size="sm" onClick={() => downloadPurchaseOrderPdf(po)}>PDF</Button>
                      <Button variant="outline" size="sm" onClick={() => openEmailDialog(po)}>Email</Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" title="Delete purchase order" className="text-red-500"><Trash2 className="h-4 w-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete PO?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(po.id)} className="bg-red-500 hover:bg-red-600">Delete</AlertDialogAction>
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
          totalPages={posData?.pagination?.totalPages || 1}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingPO ? 'Edit PO' : 'Create PO'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select name="customerId" defaultValue={editingPO?.customerId ? String(editingPO.customerId) : ""} required>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customersData?.data?.map((customer: any) => (
                      <SelectItem key={customer.id} value={String(customer.id)}>{customer.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Project</Label>
                <Select name="projectId" defaultValue={(editingPO as any)?.projectId ? String((editingPO as any).projectId) : ""}>
                  <SelectTrigger><SelectValue placeholder="Select project (optional)" /></SelectTrigger>
                  <SelectContent>
                    {projects.map((project: any) => (
                      <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select name="status" defaultValue={editingPO?.status || 'draft'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Order Date</Label>
                <Input name="orderDate" type="date" defaultValue={editingPO?.orderDate ? format(new Date(editingPO.orderDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')} required />
              </div>
              <div className="space-y-2">
                <Label>Delivery Date</Label>
                <Input name="deliveryDate" type="date" defaultValue={editingPO?.deliveryDate ? format(new Date(editingPO.deliveryDate), 'yyyy-MM-dd') : ''} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Notes</Label>
                <Textarea name="notes" defaultValue={editingPO?.notes} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Project Scope</Label>
                <Textarea name="scopeDefinition" defaultValue={(editingPO as any)?.scopeDefinition || ''} placeholder="Describe the scope for this PO" />
              </div>
            </div>

            <div className="border rounded-md p-4 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-medium">Line Items</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => setLineItems([...lineItems, { itemName: '', quantity: 1, unitPrice: 0 }])}>Add Item</Button>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-[minmax(180px,1fr)_96px_128px_128px_40px] gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Item Name</span>
                  <span>Qty</span>
                  <span>Unit Price</span>
                  <span className="text-right">Amount</span>
                  <span />
                </div>
                {lineItems.map((item, index) => (
                  <div key={index} className="grid grid-cols-[minmax(180px,1fr)_96px_128px_128px_40px] gap-2 items-center">
                    <Input placeholder="Item Name" value={item.itemName} onChange={(e) => {
                      const newItems = [...lineItems]; newItems[index].itemName = e.target.value; setLineItems(newItems);
                    }} required />
                    <Input type="number" placeholder="Qty" value={item.quantity} onChange={(e) => {
                      const newItems = [...lineItems]; newItems[index].quantity = e.target.value; setLineItems(newItems);
                    }} min="1" required />
                    <Input type="number" placeholder="Unit Price" value={item.unitPrice} onChange={(e) => {
                      const newItems = [...lineItems]; newItems[index].unitPrice = e.target.value; setLineItems(newItems);
                    }} min="0" step="0.01" required />
                    <div className="text-right text-sm font-medium">{formatCurrency(Number(item.quantity) * Number(item.unitPrice))}</div>
                    <Button type="button" variant="ghost" size="icon" title="Remove line item" onClick={() => {
                      const newItems = lineItems.filter((_, i) => i !== index);
                      setLineItems(newItems.length ? newItems : [{ itemName: '', quantity: 1, unitPrice: 0 }]);
                    }}><Trash className="h-4 w-4 text-red-500" /></Button>
                  </div>
                ))}
              </div>
              <div className="flex justify-end pt-4 border-t">
                <div className="text-xl font-bold">Total: {formatCurrency(lineItems.reduce((s, i) => s + (Number(i.quantity) * Number(i.unitPrice)), 0))}</div>
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

      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Send Purchase Order</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSendEmail} className="grid gap-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Recipient Email</Label>
                <Input value={emailRecipient} onChange={(e) => setEmailRecipient(e.target.value)} type="email" placeholder="customer@example.com" required />
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} className="min-h-[160px]" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEmailDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isEmailSending || !emailRecipient}>
                {isEmailSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Email
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Details Sheet */}
      <Sheet open={detailsSheetOpen} onOpenChange={setDetailsSheetOpen}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>PO Details: {selectedPO?.poNumber || `PO-${String(selectedPO?.id).padStart(4, '0')}`}</SheetTitle>
            <SheetDescription>Order placed on {selectedPO?.orderDate ? format(new Date(selectedPO.orderDate), 'dd MMM yyyy') : '-'}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground block">Customer</span>{selectedPO?.customerName || `#${selectedPO?.customerId}`}</div>
              <div><span className="text-muted-foreground block">Status</span><span className={getStatusClassName(selectedPO?.status)}>{selectedPO?.status}</span></div>
              <div><span className="text-muted-foreground block">Project</span>{(selectedPO as any)?.projectName || ((selectedPO as any)?.projectId ? `#${(selectedPO as any).projectId}` : '-')}</div>
              <div><span className="text-muted-foreground block">Total Amount</span>{formatCurrency(selectedPO?.totalAmount || 0)}</div>
              <div><span className="text-muted-foreground block">Delivery Date</span>{selectedPO?.deliveryDate ? format(new Date(selectedPO.deliveryDate), 'dd MMM yyyy') : '-'}</div>
            </div>
            {selectedPO?.notes && (
              <div><span className="text-muted-foreground block text-sm">Notes</span><p className="text-sm mt-1">{selectedPO.notes}</p></div>
            )}
            {((selectedPO as any)?.scopeDefinition) && (
              <div><span className="text-muted-foreground block text-sm">Project Scope</span><p className="text-sm mt-1">{(selectedPO as any).scopeDefinition}</p></div>
            )}
            <div>
              <h4 className="font-medium mb-2">Line Items</h4>
              <div className="border rounded-md divide-y">
                {selectedPO?.items && Array.isArray(selectedPO.items) ? selectedPO.items.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between p-3 text-sm">
                    <div>
                      <div className="font-medium">{item.itemName}</div>
                      <div className="text-muted-foreground">{item.quantity} x {formatCurrency(item.unitPrice)}</div>
                    </div>
                    <div className="font-medium text-right">{formatCurrency(item.quantity * item.unitPrice)}</div>
                  </div>
                )) : <div className="p-3 text-sm text-muted-foreground text-center">No line items available.</div>}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Audit Logs Sheet */}
      <Sheet open={auditSheetOpen} onOpenChange={setAuditSheetOpen}>
        <SheetContent className="sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Audit History</SheetTitle>
            <SheetDescription>Timeline of changes for PO #{auditPO?.id}</SheetDescription>
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
