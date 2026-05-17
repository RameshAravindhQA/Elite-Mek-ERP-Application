import React, { useState, useRef } from "react";
import { useListRoles, useCreateRole, useUpdateRole, useDeleteRole, getListRolesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { downloadImportTemplate, importModuleFile } from "@/lib/import-utils";
import { useToast } from "@/hooks/use-toast";
import { validateRequiredFields } from "@/lib/inline-validation";
import { Plus, Download, Edit, Trash2, Loader2, ShieldCheck, Upload } from "lucide-react";

const MODULES = ["Employees", "Attendance", "Payroll", "Leaves", "Customers", "Vendors", "Projects", "Purchase Orders", "Inventory", "Expenses", "Revenue", "Invoices", "Documents", "Reports", "Settings", "Roles"];
const ACTIONS = ["view", "create", "edit", "delete"];

export default function Roles() {
  const { data, isLoading } = useListRoles();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  const [isOpen, setIsOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<Record<string, string[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setName("");
    setDescription("");
    setPermissions({});
    setEditingRole(null);
  };

  const openEdit = (role: any) => {
    setEditingRole(role);
    setName(role.name);
    setDescription(role.description || "");
    const permMap: Record<string, string[]> = {};
    if (role.permissions) {
      role.permissions.forEach((p: any) => {
        permMap[p.module] = p.actions;
      });
    }
    setPermissions(permMap);
    setIsOpen(true);
  };

  const handleCheckboxChange = (module: string, action: string, checked: boolean) => {
    setPermissions(prev => {
      const modulePerms = prev[module] || [];
      if (checked) {
        return { ...prev, [module]: [...modulePerms, action] };
      } else {
        return { ...prev, [module]: modulePerms.filter(a => a !== action) };
      }
    });
  };

  const onSubmit = async () => {
    if (!validateRequiredFields({ name }, { name: "Role name" })) {
      toast({ title: "Role name is required", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    
    // Formatting permissions to array
    const formattedPermissions = Object.entries(permissions)
      .filter(([_, actions]) => actions.length > 0)
      .map(([module, actions]) => ({ module: module.toLowerCase(), actions }));

    const payload = {
      name,
      description,
      permissions: formattedPermissions as any
    };

    try {
      if (editingRole) {
        await updateRole.mutateAsync({ id: editingRole.id, data: payload });
        toast({ title: "Role updated successfully" });
      } else {
        await createRole.mutateAsync({ data: payload });
        toast({ title: "Role created successfully" });
      }
      queryClient.invalidateQueries({ queryKey: getListRolesQueryKey() });
      setIsOpen(false);
      resetForm();
    } catch (error) {
      toast({ title: "Failed to save role", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteRole.mutateAsync({ id });
      toast({ title: "Role deleted successfully" });
      queryClient.invalidateQueries({ queryKey: getListRolesQueryKey() });
    } catch (error) {
      toast({ title: "Failed to delete role", variant: "destructive" });
    }
  };

  const handleTemplateDownload = async () => {
    try {
      await downloadImportTemplate("roles", "roles-template.xlsx");
      toast({ title: "Role template downloaded" });
    } catch (err: any) {
      toast({ title: "Template download failed", description: err.message || "Unable to download template", variant: "destructive" });
    }
  };

  const handleImportRoles = async (file: File) => {
    try {
      const response = await importModuleFile("roles", file);
      queryClient.invalidateQueries({ queryKey: getListRolesQueryKey() });
      toast({ title: `Imported ${response.imported || 0} roles` });
    } catch (err: any) {
      toast({ title: "Role import failed", description: err.message || "Unable to import file", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <PageHeader title="Roles & Permissions" description="Manage user roles and access control" />
        <div className="flex gap-2 flex-wrap items-center">
          <Button variant="outline" size="sm" onClick={handleTemplateDownload}><Download className="w-4 h-4 mr-2" /> Template</Button>
          <label>
            <Button variant="outline" size="sm" asChild>
              <span><Upload className="w-4 h-4 mr-2" /> Import</span>
            </Button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) handleImportRoles(file); if (e.target) e.target.value = ""; }} />
          </label>
          <Button variant="outline"><Download className="w-4 h-4 mr-2" /> Export</Button>
          <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if(!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> Add Role</Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>{editingRole ? "Edit Role" : "Create New Role"}</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto pr-2 space-y-6 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Role Name</label>
                    <Input name="name" value={name} onChange={(e) => setName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Description</label>
                    <Input value={description} onChange={(e) => setDescription(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-medium border-b pb-2">Permissions</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {MODULES.map((module) => {
                      const modKey = module.toLowerCase();
                      return (
                        <div key={module} className="border rounded-md p-3 bg-muted/20">
                          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-primary" /> {module}
                          </h4>
                          <div className="grid grid-cols-2 gap-2">
                            {ACTIONS.map((action) => (
                              <div key={`${module}-${action}`} className="flex items-center space-x-2">
                                <Checkbox 
                                  id={`${module}-${action}`} 
                                  checked={permissions[modKey]?.includes(action) || false}
                                  onCheckedChange={(checked) => handleCheckboxChange(modKey, action, checked as boolean)}
                                />
                                <label htmlFor={`${module}-${action}`} className="text-xs font-medium leading-none capitalize">
                                  {action}
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button onClick={onSubmit} disabled={!name || isSubmitting}>
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Role
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
              <TableHead>Role Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Permissions Summary</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : data?.data?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No roles found</TableCell></TableRow>
            ) : (
              data?.data?.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium text-foreground">{role.name || "-"}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate">{role.description || "-"}</TableCell>
                  <TableCell>{typeof role.userCount === "number" ? role.userCount : 0}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[400px]">
                      {role.permissions?.slice(0, 5).map((p: any, i: number) => (
                        <Badge key={i} variant="secondary" className="text-[10px] uppercase">
                          {p.module} ({p.actions.length})
                        </Badge>
                      ))}
                      {(role.permissions?.length || 0) > 5 && (
                        <Badge variant="outline" className="text-[10px]">+{(role.permissions?.length || 0) - 5} more</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" title="Edit role" onClick={() => openEdit(role)}><Edit className="w-4 h-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" title="Delete role" className="text-red-500 hover:text-red-700 hover:bg-red-50" disabled={role.name.toLowerCase() === 'admin'}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Role</AlertDialogTitle>
                            <AlertDialogDescription>Are you sure you want to delete this role? This cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(role.id)} className="bg-red-500 hover:bg-red-600">Delete</AlertDialogAction>
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
    </div>
  );
}
