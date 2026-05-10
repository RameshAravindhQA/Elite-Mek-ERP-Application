import React, { useState, useRef } from "react";
import { useListDocuments, useCreateDocument, useUpdateDocument, useDeleteDocument, useListProjects, getListDocumentsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Plus, Download, Edit, Trash2, Loader2, FileText, Upload, Search, File, FileImage, FileSpreadsheet } from "lucide-react";
import { Pagination } from "@/components/Pagination";

const getBadgeColor = (type: string) => {
  switch (type?.toUpperCase()) {
    case "PDF": return "bg-red-100 text-red-800";
    case "DOCX": case "DOC": return "bg-blue-100 text-blue-800";
    case "XLSX": return "bg-green-100 text-green-800";
    case "PNG": case "JPG": case "JPEG": return "bg-purple-100 text-purple-800";
    default: return "bg-gray-100 text-gray-800";
  }
};

const getFileIcon = (type: string) => {
  switch (type?.toUpperCase()) {
    case "PDF": return <FileText className="w-4 h-4 text-red-500" />;
    case "PNG": case "JPG": case "JPEG": return <FileImage className="w-4 h-4 text-purple-500" />;
    case "XLSX": return <FileSpreadsheet className="w-4 h-4 text-green-500" />;
    default: return <File className="w-4 h-4 text-muted-foreground" />;
  }
};

const getExtension = (filename: string) => filename.split(".").pop()?.toUpperCase() || "FILE";

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const defaultForm = () => ({ title: "", projectId: "none", fileType: "PDF", fileSize: "", tags: "", fileUrl: "", fileName: "" });

export default function Documents() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [viewingDoc, setViewingDoc] = useState<any>(null);
  const [form, setForm] = useState<any>(defaultForm());
  const [uploadProgress, setUploadProgress] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: documentsData, isLoading } = useListDocuments({ page, limit: pageSize });
  const { data: projectsData } = useListProjects({ page: 1, limit: 100 });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createDoc = useCreateDocument();
  const updateDoc = useUpdateDocument();
  const deleteDoc = useDeleteDocument();

  const filtered = (documentsData?.data || []).filter((d: any) => {
    const matchSearch = !search || d.title.toLowerCase().includes(search.toLowerCase());
    const matchProject = projectFilter === "all" || (projectFilter === "none" ? !d.projectId : String(d.projectId) === projectFilter);
    return matchSearch && matchProject;
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadProgress(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      const ext = getExtension(file.name);
      setForm((f: any) => ({
        ...f,
        fileUrl: base64,
        fileName: file.name,
        fileType: ext,
        fileSize: formatFileSize(file.size),
        title: f.title || file.name.replace(/\.[^/.]+$/, "")
      }));
      setUploadProgress(false);
    };
    reader.readAsDataURL(file);
  };

  const openCreate = () => { setEditingDoc(null); setForm(defaultForm()); setIsUploadOpen(true); };
  const openEdit = (doc: any) => {
    setEditingDoc(doc);
    setForm({
      title: doc.title || "",
      projectId: doc.projectId ? String(doc.projectId) : "none",
      fileType: doc.fileType || "PDF",
      fileSize: doc.fileSize || "",
      tags: doc.tags?.join(", ") || "",
      fileUrl: doc.fileUrl || "",
      fileName: doc.fileName || ""
    });
    setIsUploadOpen(true);
  };

  const onSubmit = async () => {
    if (!form.title) { toast({ title: "Title is required", variant: "destructive" }); return; }
    if (!editingDoc && !form.fileUrl) { toast({ title: "Please select a file", variant: "destructive" }); return; }
    setIsSubmitting(true);
    try {
      const payload = {
        title: form.title,
        projectId: form.projectId !== "none" && form.projectId ? Number(form.projectId) : undefined,
        fileUrl: form.fileUrl,
        fileType: form.fileType,
        fileSize: form.fileSize,
        tags: form.tags ? form.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : []
      };
      if (editingDoc) {
        await updateDoc.mutateAsync({ id: editingDoc.id, data: payload });
        toast({ title: "Document updated" });
      } else {
        await createDoc.mutateAsync({ data: payload });
        toast({ title: "Document uploaded" });
      }
      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
      setIsUploadOpen(false);
      setForm(defaultForm());
      setEditingDoc(null);
    } catch {
      toast({ title: "Failed to save document", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteDoc.mutateAsync({ id: deleteId });
      toast({ title: "Document deleted" });
      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
      setDeleteId(null);
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  };

  const handleDownload = (doc: any) => {
    if (!doc.fileUrl) return;
    if (doc.fileUrl.startsWith("data:")) {
      const a = document.createElement("a");
      a.href = doc.fileUrl;
      a.download = doc.title + "." + doc.fileType.toLowerCase();
      a.click();
    } else {
      window.open(doc.fileUrl, "_blank");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description="Manage company and project documents"
        actions={
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Add Document</Button>
        }
      />

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search documents..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Projects" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            <SelectItem value="none">No Project</SelectItem>
            {(projectsData?.data || []).map((p: any) => (
              <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Uploaded By</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No documents found</TableCell></TableRow>
            ) : filtered.map((doc: any) => (
              <TableRow key={doc.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {getFileIcon(doc.fileType)}
                    {doc.title}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{doc.projectName || (doc.projectId ? `#${doc.projectId}` : "—")}</TableCell>
                <TableCell><Badge className={getBadgeColor(doc.fileType)} variant="outline">{doc.fileType}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{doc.fileSize || "—"}</TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {(doc.tags || []).map((tag: string, i: number) => <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>)}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{doc.uploadedBy || "System"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{format(new Date(doc.createdAt), 'dd MMM yyyy')}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewingDoc(doc)} title="View"><FileText className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(doc)} title="Download"><Download className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(doc)}><Edit className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteId(doc.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {documentsData?.pagination && (
        <Pagination page={page} totalPages={documentsData.pagination.totalPages} onPageChange={setPage} pageSize={pageSize} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      )}

      <Dialog open={isUploadOpen} onOpenChange={(open) => { if (!open) { setEditingDoc(null); setForm(defaultForm()); } setIsUploadOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingDoc ? "Edit Document" : "Upload Document"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm((f: any) => ({ ...f, title: e.target.value }))} placeholder="Document title..." />
            </div>

            {!editingDoc && (
              <div className="space-y-2">
                <Label>File *</Label>
                <div
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadProgress ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">Processing file...</span>
                    </div>
                  ) : form.fileName ? (
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="w-8 h-8 text-primary" />
                      <span className="text-sm font-medium">{form.fileName}</span>
                      <span className="text-xs text-muted-foreground">{form.fileSize} • {form.fileType}</span>
                      <span className="text-xs text-primary">Click to change file</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-8 h-8 text-muted-foreground" />
                      <span className="text-sm font-medium">Click to upload or drag & drop</span>
                      <span className="text-xs text-muted-foreground">PDF, DOCX, XLSX, PNG, JPG, ZIP (max 10MB)</span>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt,.zip"
                    onChange={handleFileSelect}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Project (optional)</Label>
              <Select value={form.projectId || "none"} onValueChange={v => setForm((f: any) => ({ ...f, projectId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select project..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No Project —</SelectItem>
                  {(projectsData?.data || []).map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>File Type</Label>
                <Select value={form.fileType || "PDF"} onValueChange={v => setForm((f: any) => ({ ...f, fileType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["PDF", "DOCX", "XLSX", "PNG", "JPG", "TXT", "ZIP", "Other"].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>File Size</Label>
                <Input value={form.fileSize} onChange={e => setForm((f: any) => ({ ...f, fileSize: e.target.value }))} placeholder="e.g. 2.4 MB" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tags (comma separated)</Label>
              <Input value={form.tags} onChange={e => setForm((f: any) => ({ ...f, tags: e.target.value }))} placeholder="contract, invoice, report" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadOpen(false)}>Cancel</Button>
            <Button onClick={onSubmit} disabled={isSubmitting || uploadProgress}>
              {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editingDoc ? "Update" : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingDoc} onOpenChange={() => setViewingDoc(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{viewingDoc?.title || "Attachment Preview"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {viewingDoc?.fileUrl ? (
              viewingDoc.fileType?.toUpperCase() === "PDF" ? (
                <iframe src={viewingDoc.fileUrl} title={viewingDoc.title} className="w-full h-[60vh] border rounded-lg" />
              ) : ["PNG", "JPG", "JPEG"].includes(viewingDoc.fileType?.toUpperCase()) ? (
                <img src={viewingDoc.fileUrl} alt={viewingDoc.title} className="w-full max-h-[60vh] object-contain rounded-lg border" />
              ) : (
                <div className="rounded-lg border border-dashed border-muted p-6 text-center text-sm text-muted-foreground">
                  Built-in preview is not available for this file type. Use download to open the attachment.
                </div>
              )
            ) : (
              <div className="rounded-lg border border-dashed border-muted p-6 text-center text-sm text-muted-foreground">
                No attachment available for preview.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => viewingDoc && handleDownload(viewingDoc)}>Download</Button>
            <Button onClick={() => setViewingDoc(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
