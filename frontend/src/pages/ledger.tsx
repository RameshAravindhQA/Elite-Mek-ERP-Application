import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Pagination } from "@/components/Pagination";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { BookOpen, CreditCard, Download, Eye, IndianRupee, Loader2, Search, ShoppingCart, Wallet } from "lucide-react";
import { useApiClient } from "@/lib/api-client";
import { useListCustomers, useListProjects } from "@workspace/api-client-react";
import { format } from "date-fns";

type InvoiceRow = {
  id: number;
  invoiceNumber: string;
  poNumber?: string | null;
  status: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  scopeDefinition?: string;
  notes?: string;
};

type PurchaseOrderRow = {
  id: number;
  poNumber: string;
  status: string;
  orderDate: string;
  deliveryDate?: string | null;
  totalAmount: number;
  items?: unknown[];
  scopeDefinition?: string;
  notes?: string;
};

type LedgerProjectResponse = {
  project: {
    id: number;
    name: string;
    status: string;
    customerId: number | null;
    budget: number;
    spent: number;
    startDate?: string | null;
    endDate?: string | null;
    progress: number;
    scope?: string;
  };
  customer: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
  };
  invoices: InvoiceRow[];
  purchaseOrders: PurchaseOrderRow[];
  summary: {
    committedAmount: number;
    paidAmount: number;
    remainingAmount: number;
    invoiceCount: number;
    purchaseOrderAmount: number;
    purchaseOrderCount: number;
  };
};

export default function Ledger() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  const [projectSearch, setProjectSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detail, setDetail] = useState<{ type: "invoice"; row: InvoiceRow } | { type: "po"; row: PurchaseOrderRow } | null>(null);

  const { data: projectsData, isLoading: loadingProjects } = useListProjects({ page: 1, limit: 100, ...(projectSearch ? { search: projectSearch } : {}) });
  const { data: customersData } = useListCustomers({ page: 1, limit: 200 });
  const projects = projectsData?.data || [];

  const ledgerQuery = useQuery<LedgerProjectResponse | null>({
    queryKey: ["projectLedger", selectedProjectId],
    queryFn: async () => {
      if (!selectedProjectId) return null;
      const response = await apiClient.get<LedgerProjectResponse>(`/ledger/projects/${selectedProjectId}`);
      return response.data;
    },
    enabled: !!selectedProjectId,
  });

  const ledgerData = ledgerQuery.data;
  const isLoadingLedger = ledgerQuery.isLoading;
  const formatCurrency = (amount: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(amount || 0));

  const handleDownloadPdf = async () => {
    if (!selectedProjectId) {
      toast({ title: "Select a project first", variant: "destructive" });
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/ledger/projects/${selectedProjectId}/pdf`, {
        method: "GET",
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
          Accept: "application/pdf",
        },
      });
      if (!response.ok) throw new Error(`Unable to download PDF (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `project-ledger-${selectedProjectId}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Ledger PDF downloaded" });
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message || "Could not download ledger PDF", variant: "destructive" });
    }
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((project: any) => !selectedCustomerId || String(project.customerId || "") === selectedCustomerId);
  }, [projects, selectedCustomerId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoice Ledger"
        description="Track committed price, paid amount, and remaining balance per customer project."
        actions={
          <Button onClick={handleDownloadPdf} disabled={!selectedProjectId || isLoadingLedger}>
            <Download className="w-4 h-4 mr-2" />Download PDF
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Selected Project" value={ledgerData?.project?.name || "None"} icon={BookOpen} bg="bg-sky-600" />
        <MetricCard label="Invoice Total" value={formatCurrency(ledgerData?.summary.committedAmount || 0)} icon={IndianRupee} bg="bg-emerald-600" />
        <MetricCard label="Paid Balance" value={formatCurrency(ledgerData?.summary.paidAmount || 0)} icon={CreditCard} bg="bg-amber-500" />
        <MetricCard label="Remaining" value={formatCurrency(ledgerData?.summary.remainingAmount || 0)} icon={Wallet} bg="bg-rose-600" />
      </div>

      <Card className="bg-violet-50 border-violet-200">
        <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Customer</Label>
                <Select
                  value={selectedCustomerId}
                  onValueChange={(value) => {
                    setSelectedCustomerId(value);
                    setSelectedProjectId(null);
                    setPage(1);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {(customersData?.data || []).map((customer: any) => (
                      <SelectItem key={customer.id} value={String(customer.id)}>{customer.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Search projects</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-10"
                    placeholder="Search project name"
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Project</Label>
                <Select value={selectedProjectId ? String(selectedProjectId) : ""} onValueChange={(value) => { setSelectedProjectId(value ? Number(value) : null); setPage(1); }} disabled={!selectedCustomerId || loadingProjects}>
                  <SelectTrigger><SelectValue placeholder={selectedCustomerId ? "Select project" : "Select customer first"} /></SelectTrigger>
                  <SelectContent>
                    {filteredProjects.map((project: any) => (
                      <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

      {ledgerData && (
        <Card>
          <CardContent className="p-5">
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Customer Information</h2>
                <div className="mt-3 space-y-1 text-sm">
                  <div className="font-medium text-base">{ledgerData.customer?.name || "Unknown Customer"}</div>
                  <div>{ledgerData.customer?.email || "-"}</div>
                  <div>{ledgerData.customer?.phone || "-"}</div>
                  <div className="text-muted-foreground">{ledgerData.customer?.address || "-"}</div>
                </div>
              </div>
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Project Information</h2>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><span className="block text-muted-foreground">Project</span>{ledgerData.project.name}</div>
                  <div><span className="block text-muted-foreground">Status</span>{ledgerData.project.status}</div>
                  <div><span className="block text-muted-foreground">Start</span>{ledgerData.project.startDate ? format(new Date(ledgerData.project.startDate), "dd MMM yyyy") : "-"}</div>
                  <div><span className="block text-muted-foreground">End</span>{ledgerData.project.endDate ? format(new Date(ledgerData.project.endDate), "dd MMM yyyy") : "-"}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Ledger Details</h2>
              <p className="text-sm text-muted-foreground">Invoice history and remaining balance for the selected project.</p>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Invoices</div>
              <div className="text-2xl font-bold">{ledgerData?.summary?.invoiceCount ?? "-"}</div>
            </div>
          </div>

          {isLoadingLedger ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : ledgerData?.invoices?.length ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>PO</TableHead>
                      <TableHead>Issue Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="text-right">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerData.invoices.slice((page - 1) * pageSize, page * pageSize).map((invoice: any) => (
                      <TableRow key={invoice.id} className="hover:bg-muted/20">
                        <TableCell>{invoice.invoiceNumber}</TableCell>
                        <TableCell>{invoice.poNumber || "-"}</TableCell>
                        <TableCell>{format(new Date(invoice.issueDate), "dd MMM yyyy")}</TableCell>
                        <TableCell>{format(new Date(invoice.dueDate), "dd MMM yyyy")}</TableCell>
                        <TableCell><span className={`px-2 py-1 rounded-full text-xs ${invoice.status === "paid" ? "bg-emerald-100 text-emerald-700" : invoice.status === "overdue" ? "bg-red-100 text-red-700" : "bg-sky-100 text-sky-700"}`}>{invoice.status}</span></TableCell>
                        <TableCell className="text-right">{formatCurrency(invoice.totalAmount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(invoice.paidAmount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(invoice.balance)}</TableCell>
                        <TableCell className="text-right"><Button variant="ghost" size="icon" title="View invoice details" onClick={() => setDetail({ type: "invoice", row: invoice })}><Eye className="h-4 w-4" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pagination
                page={page}
                totalPages={Math.max(1, Math.ceil((ledgerData?.invoices?.length || 0) / pageSize))}
                onPageChange={setPage}
                pageSize={pageSize}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
              />
            </>
          ) : selectedProjectId ? (
            <div className="text-center py-16 text-muted-foreground">No invoice ledger entries found for this project.</div>
          ) : (
            <div className="text-center py-16 text-muted-foreground">Select a project to see invoice ledger details.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Purchase Orders</h2>
              <p className="text-sm text-muted-foreground">POs linked to the selected project.</p>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-500">PO Total</div>
              <div className="text-2xl font-bold">{formatCurrency(ledgerData?.summary?.purchaseOrderAmount || 0)}</div>
            </div>
          </div>

          {isLoadingLedger ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : ledgerData?.purchaseOrders?.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Delivery Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerData.purchaseOrders.map((po) => (
                    <TableRow key={po.id} className="hover:bg-muted/20">
                      <TableCell className="font-medium">{po.poNumber}</TableCell>
                      <TableCell>{po.orderDate ? format(new Date(po.orderDate), "dd MMM yyyy") : "-"}</TableCell>
                      <TableCell>{po.deliveryDate ? format(new Date(po.deliveryDate), "dd MMM yyyy") : "-"}</TableCell>
                      <TableCell><Badge variant="outline">{po.status}</Badge></TableCell>
                      <TableCell className="text-right">{formatCurrency(po.totalAmount)}</TableCell>
                      <TableCell className="text-right"><Button variant="ghost" size="icon" title="View PO details" onClick={() => setDetail({ type: "po", row: po })}><Eye className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : selectedProjectId ? (
            <div className="text-center py-10 text-muted-foreground">No purchase orders found for this project.</div>
          ) : (
            <div className="text-center py-10 text-muted-foreground">Select a project to see purchase orders.</div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detail?.type === "invoice" ? `Invoice ${detail.row.invoiceNumber}` : `Purchase Order ${detail?.row.poNumber}`}</DialogTitle>
          </DialogHeader>
          {detail?.type === "invoice" ? (
            <div className="grid gap-4 md:grid-cols-2 text-sm">
              <div><span className="block text-muted-foreground">Invoice</span>{detail.row.invoiceNumber}</div>
              <div><span className="block text-muted-foreground">PO</span>{detail.row.poNumber || "-"}</div>
              <div><span className="block text-muted-foreground">Issue Date</span>{detail.row.issueDate ? format(new Date(detail.row.issueDate), "dd MMM yyyy") : "-"}</div>
              <div><span className="block text-muted-foreground">Due Date</span>{detail.row.dueDate ? format(new Date(detail.row.dueDate), "dd MMM yyyy") : "-"}</div>
              <div><span className="block text-muted-foreground">Status</span>{detail.row.status}</div>
              <div><span className="block text-muted-foreground">Total</span>{formatCurrency(detail.row.totalAmount)}</div>
              <div><span className="block text-muted-foreground">Paid</span>{formatCurrency(detail.row.paidAmount)}</div>
              <div><span className="block text-muted-foreground">Balance</span>{formatCurrency(detail.row.balance)}</div>
              <div className="md:col-span-2"><span className="block text-muted-foreground">Scope</span>{detail.row.scopeDefinition || "-"}</div>
              <div className="md:col-span-2"><span className="block text-muted-foreground">Notes</span>{detail.row.notes || "-"}</div>
            </div>
          ) : detail?.type === "po" ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  ["PO Number", detail.row.poNumber],
                  ["Status", detail.row.status],
                  ["Order Date", detail.row.orderDate ? format(new Date(detail.row.orderDate), "dd MMM yyyy") : "-"],
                  ["Delivery Date", detail.row.deliveryDate ? format(new Date(detail.row.deliveryDate), "dd MMM yyyy") : "-"],
                  ["Total", formatCurrency(detail.row.totalAmount)],
                  ["Items", detail.row.items?.length || 0],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border bg-muted/20 p-3">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
                    <span className="mt-1 block font-medium">{value}</span>
                  </div>
                ))}
                <div className="rounded-lg border bg-muted/20 p-3 md:col-span-3">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scope</span>
                  <p className="mt-1 whitespace-pre-wrap">{detail.row.scopeDefinition || "-"}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3 md:col-span-3">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</span>
                  <p className="mt-1 whitespace-pre-wrap">{detail.row.notes || "-"}</p>
                </div>
              </div>
              {Array.isArray(detail.row.items) && detail.row.items.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-muted">
                          <th className="border px-3 py-2 text-left font-medium">Item Name</th>
                          <th className="border px-3 py-2 text-right font-medium">Qty</th>
                          <th className="border px-3 py-2 text-right font-medium">Unit Price</th>
                          <th className="border px-3 py-2 text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detail.row.items as any[]).map((item, i) => {
                          const qty = item.quantity || 0;
                          const price = item.unitPrice || 0;
                          const amount = qty * price;
                          return (
                            <tr key={i} className="hover:bg-muted/50">
                              <td className="border px-3 py-2">{item.itemName || '-'}</td>
                              <td className="border px-3 py-2 text-right">{qty}</td>
                              <td className="border px-3 py-2 text-right">{formatCurrency(price)}</td>
                              <td className="border px-3 py-2 text-right font-medium">{formatCurrency(amount)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
