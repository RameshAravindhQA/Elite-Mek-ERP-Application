import React, { useState, useEffect } from "react";
import { useListReminders, useCreateReminder, useUpdateReminder, useDeleteReminder, useGetDueReminders, getListRemindersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Plus, Download, Edit, Trash2, Loader2, Bell, CheckCircle2 } from "lucide-react";
import { Pagination } from "@/components/Pagination";
import { validateRequiredFields } from "@/lib/inline-validation";

export function ReminderModal() {
  const { data } = useGetDueReminders();
  const updateReminder = useUpdateReminder();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (data?.data && data.data.length > 0) {
      if (!sessionStorage.getItem("reminders-shown")) {
        setOpen(true);
      }
    }
  }, [data]);

  const handleDismissAll = async () => {
    if (data?.data) {
      for (const r of data.data) {
        await updateReminder.mutateAsync({ id: r.id, data: { isDismissed: true } });
      }
      sessionStorage.setItem("reminders-shown", "true");
      queryClient.invalidateQueries({ queryKey: getListRemindersQueryKey() });
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { setOpen(val); if(!val) sessionStorage.setItem("reminders-shown", "true"); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bell className="w-5 h-5 text-amber-500" /> Reminders Due</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-auto py-2">
          {data?.data?.map((r) => (
            <div key={r.id} className="p-3 border rounded-md bg-amber-50 dark:bg-amber-950/20">
              <h4 className="font-semibold text-sm">{r.title}</h4>
              <p className="text-xs text-muted-foreground mt-1">{r.message}</p>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          <Button onClick={handleDismissAll}>Dismiss All</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Reminders() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useListReminders({ page, limit: 10 });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createReminder = useCreateReminder();
  const updateReminder = useUpdateReminder();
  const deleteReminder = useDeleteReminder();

  const [isOpen, setIsOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setTitle("");
    setMessage("");
    setRemindAt("");
    setEditingReminder(null);
  };

  const openEdit = (r: any) => {
    setEditingReminder(r);
    setTitle(r.title);
    setMessage(r.message);
    setRemindAt(new Date(r.remindAt).toISOString().slice(0, 16));
    setIsOpen(true);
  };

  const onSubmit = async () => {
    if (!validateRequiredFields({ title, message, remindAt }, { title: "Title", message: "Message", remindAt: "Remind at" })) {
      toast({ title: "Please fill all reminder fields", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    const payload = {
      title,
      message,
      remindAt: new Date(remindAt).toISOString()
    };

    try {
      if (editingReminder) {
        await updateReminder.mutateAsync({ id: editingReminder.id, data: payload });
        toast({ title: "Reminder updated successfully" });
      } else {
        await createReminder.mutateAsync({ data: payload });
        toast({ title: "Reminder created successfully" });
      }
      queryClient.invalidateQueries({ queryKey: getListRemindersQueryKey() });
      setIsOpen(false);
      resetForm();
    } catch (error) {
      toast({ title: "Failed to save reminder", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDismiss = async (id: number) => {
    try {
      await updateReminder.mutateAsync({ id, data: { isDismissed: true } });
      toast({ title: "Reminder dismissed" });
      queryClient.invalidateQueries({ queryKey: getListRemindersQueryKey() });
    } catch (error) {
      toast({ title: "Error dismissing reminder", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteReminder.mutateAsync({ id });
      toast({ title: "Reminder deleted successfully" });
      queryClient.invalidateQueries({ queryKey: getListRemindersQueryKey() });
    } catch (error) {
      toast({ title: "Failed to delete reminder", variant: "destructive" });
    }
  };

  const getStatusBadge = (r: any) => {
    if (r.isDismissed) return <Badge variant="secondary" className="bg-gray-100 text-gray-800">Dismissed</Badge>;
    const due = new Date(r.remindAt) <= new Date();
    if (due) return <Badge variant="secondary" className="bg-amber-100 text-amber-800">Triggered</Badge>;
    return <Badge variant="secondary" className="bg-green-100 text-green-800">Active</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <PageHeader title="Reminders" description="Manage personal and system reminders" />
        <div className="flex gap-2">
          <Button variant="outline"><Download className="w-4 h-4 mr-2" /> Export</Button>
          <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if(!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> Add Reminder</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingReminder ? "Edit Reminder" : "Add Reminder"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Title</label>
                  <Input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Message</label>
                  <Textarea name="message" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Remind At</label>
                  <Input name="remindAt" type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} required />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={onSubmit} disabled={!title || !message || !remindAt || isSubmitting}>
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Remind At</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : data?.data?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No reminders found</TableCell></TableRow>
            ) : (
              data?.data?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.title}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={r.message}>{r.message}</TableCell>
                  <TableCell>{format(new Date(r.remindAt), 'dd MMM yyyy, HH:mm')}</TableCell>
                  <TableCell>{getStatusBadge(r)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {!r.isDismissed && (
                        <Button variant="ghost" size="icon" onClick={() => handleDismiss(r.id)} title="Dismiss">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" title="Edit reminder" onClick={() => openEdit(r)}><Edit className="w-4 h-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button variant="ghost" size="icon" title="Delete reminder" className="text-red-500 hover:text-red-700 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Reminder</AlertDialogTitle>
                            <AlertDialogDescription>Are you sure you want to delete this reminder?</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(r.id)} className="bg-red-500 hover:bg-red-600">Delete</AlertDialogAction>
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
