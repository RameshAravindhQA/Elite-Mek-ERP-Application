import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListEmployees, useCreateEmployee, useUpdateEmployee, useDeleteEmployee,
  useGetEmployeeStats, getListEmployeesQueryKey, getGetEmployeeStatsQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { Users, UserCheck, UserMinus, Building, Search, Download, Upload, Grid, List, MoreVertical, Edit, Trash, Plus, Camera, Mail, Phone, Briefcase } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/Pagination";
import { Link } from "wouter";

const DEPARTMENTS = ["Engineering", "HR", "Sales", "Finance", "Marketing", "Operations", "Production", "Quality", "Maintenance"];

function downloadCSVTemplate() {
  const headers = ["firstName","lastName","email","phone","employeeId","department","designation","status","salary","joiningDate","panNumber","aadharNumber","bankAccount","bankName","ifscCode","address","emergencyContact"];
  const example = ["Ravi","Kumar","ravi@company.com","9876543210","EMP001","Engineering","Engineer","active","35000","2024-01-15","ABCDE1234F","123456789012","1234567890","SBI","SBIN0001234","123 Main St Chennai","9876543211"];
  const csv = [headers.join(","), example.join(",")].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "employees_template.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function Employees() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<"table" | "card">("card");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [formData, setFormData] = useState<any>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    employeeId: "",
    department: "Engineering",
    designation: "",
    status: "active",
    salary: "",
    joiningDate: "",
    panNumber: "",
    aadharNumber: "",
    bankAccount: "",
    bankName: "",
    ifscCode: "",
    address: "",
    emergencyContact: "",
    imageUrl: "",
  });

  const handleFormChange = (name: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [name]: value }));
  };

  const { data: stats } = useGetEmployeeStats();
  const { data: employeesData, isLoading } = useListEmployees({
    page, limit: pageSize,
    search: search || undefined,
    department: department !== "all" ? department : undefined,
    status: status !== "all" ? status : undefined,
  });

  const createMutation = useCreateEmployee();
  const updateMutation = useUpdateEmployee();
  const deleteMutation = useDeleteEmployee();

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      setPhotoPreview(base64);
      setFormData((f: any) => ({ ...f, imageUrl: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const openAdd = () => {
    setPhotoPreview("");
    setFormData({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      employeeId: "",
      department: "Engineering",
      designation: "",
      status: "active",
      salary: "",
      joiningDate: "",
      panNumber: "",
      aadharNumber: "",
      bankAccount: "",
      bankName: "",
      ifscCode: "",
      address: "",
      emergencyContact: "",
      imageUrl: "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>, mode?: "add" | "edit") => {
    e.preventDefault();
    setIsSubmitting(true);

    const data: any = {
      firstName: formData.firstName?.trim(),
      lastName: formData.lastName?.trim(),
      email: formData.email?.trim(),
      phone: formData.phone?.trim() || undefined,
      department: formData.department,
      designation: formData.designation?.trim(),
      status: formData.status || "active",
      salary: Number(formData.salary),
      joiningDate: formData.joiningDate,
      employeeId: formData.employeeId?.trim(),
      panNumber: formData.panNumber?.trim() || undefined,
      aadharNumber: formData.aadharNumber?.trim() || undefined,
      bankAccount: formData.bankAccount?.trim() || undefined,
      bankName: formData.bankName?.trim() || undefined,
      ifscCode: formData.ifscCode?.trim() || undefined,
      address: formData.address?.trim() || undefined,
      emergencyContact: formData.emergencyContact?.trim() || undefined,
      imageUrl: photoPreview || formData.imageUrl || undefined,
    };

    if (!data.firstName || !data.lastName || !data.email || !data.employeeId || !data.designation || !data.salary || !data.joiningDate) {
      toast({ title: "Error saving employee", description: "Please fill all required fields.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }

    try {
      await createMutation.mutateAsync({ data });
      queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetEmployeeStatsQueryKey() });
      setPage(1);
      toast({ title: "Employee created successfully" });
      setDialogOpen(false);
      setPhotoPreview("");
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        employeeId: "",
        department: "Engineering",
        designation: "",
        status: "active",
        salary: "",
        joiningDate: "",
        panNumber: "",
        aadharNumber: "",
        bankAccount: "",
        bankName: "",
        ifscCode: "",
        address: "",
        emergencyContact: "",
        imageUrl: "",
      });
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error || err?.message || "Failed to save employee";
      toast({ title: "Error saving employee", description: errorMessage, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    deleteMutation.mutate({ id: selectedEmployee.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetEmployeeStatsQueryKey() });
        setPage(1);
        toast({ title: "Employee deleted" });
        setIsDeleteOpen(false);
      },
      onError: () => toast({ title: "Error deleting employee", variant: "destructive" }),
    });
  };

  const handleImportCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const lines = text.split("\n").filter(l => l.trim());
      const headers = lines[0].split(",").map(h => h.trim());
      let imported = 0;
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(",").map(v => v.trim());
        const row: any = {};
        headers.forEach((h, idx) => { row[h] = vals[idx] || ""; });
        if (row.firstName && row.email && row.employeeId) {
          try {
            await createMutation.mutateAsync({ data: { ...row, salary: Number(row.salary) || 0 } });
            imported++;
          } catch {}
        }
      }
      queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
      toast({ title: `Imported ${imported} employees` });
    };
    reader.readAsText(file);
  };

  const getStatusBadge = (s: string) => {
    const m: Record<string, string> = {
      active: "bg-emerald-100 text-emerald-700 border border-emerald-200",
      inactive: "bg-red-100 text-red-700 border border-red-200",
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m[s] || "bg-gray-100 text-gray-700"}`}>{s}</span>;
  };

  const renderEmployeeForm = (mode: "add" | "edit") => (
    <form onSubmit={(e) => handleSubmit(e, mode)} className="space-y-4 mt-2">
      <div className="flex justify-center mb-4">
        <div className="relative">
          <div
            className="w-24 h-24 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/20 overflow-hidden cursor-pointer hover:border-primary transition-colors"
            onClick={() => photoInputRef.current?.click()}
          >
            {photoPreview ? (
              <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <Camera size={24} />
                <span className="text-xs">Photo</span>
              </div>
            )}
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label className="text-xs">First Name *</Label><Input name="firstName" required value={formData.firstName} onChange={(e) => handleFormChange("firstName", e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Last Name *</Label><Input name="lastName" required value={formData.lastName} onChange={(e) => handleFormChange("lastName", e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Email *</Label><Input name="email" type="email" required value={formData.email} onChange={(e) => handleFormChange("email", e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Phone</Label><Input name="phone" value={formData.phone} onChange={(e) => handleFormChange("phone", e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Employee ID *</Label><Input name="employeeId" required value={formData.employeeId} onChange={(e) => handleFormChange("employeeId", e.target.value)} /></div>
        <div className="space-y-1">
          <Label className="text-xs">Department</Label>
          <Select value={formData.department} onValueChange={(v) => handleFormChange("department", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent searchable>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label className="text-xs">Designation *</Label><Input name="designation" required value={formData.designation} onChange={(e) => handleFormChange("designation", e.target.value)} /></div>
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={formData.status} onValueChange={(v) => handleFormChange("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent searchable>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label className="text-xs">Salary (₹) *</Label><Input name="salary" type="number" required value={formData.salary} onChange={(e) => handleFormChange("salary", e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Joining Date *</Label><Input name="joiningDate" type="date" required value={formData.joiningDate} onChange={(e) => handleFormChange("joiningDate", e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">PAN Number</Label><Input name="panNumber" value={formData.panNumber} onChange={(e) => handleFormChange("panNumber", e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Aadhar Number</Label><Input name="aadharNumber" value={formData.aadharNumber} onChange={(e) => handleFormChange("aadharNumber", e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Bank Account</Label><Input name="bankAccount" value={formData.bankAccount} onChange={(e) => handleFormChange("bankAccount", e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Bank Name</Label><Input name="bankName" value={formData.bankName} onChange={(e) => handleFormChange("bankName", e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">IFSC Code</Label><Input name="ifscCode" value={formData.ifscCode} onChange={(e) => handleFormChange("ifscCode", e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Emergency Contact</Label><Input name="emergencyContact" value={formData.emergencyContact} onChange={(e) => handleFormChange("emergencyContact", e.target.value)} /></div>
      </div>
      <div className="space-y-1"><Label className="text-xs">Address</Label><Textarea name="address" rows={2} value={formData.address} onChange={(e) => handleFormChange("address", e.target.value)} /></div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" size="sm" onClick={() => {
          setDialogOpen(false);
          setSelectedEmployee(null);
          setPhotoPreview("");
          setFormData({
            firstName: "",
            lastName: "",
            email: "",
            phone: "",
            employeeId: "",
            department: "Engineering",
            designation: "",
            status: "active",
            salary: "",
            joiningDate: "",
            panNumber: "",
            aadharNumber: "",
            bankAccount: "",
            bankName: "",
            ifscCode: "",
            address: "",
            emergencyContact: "",
            imageUrl: "",
          });
        }}>Cancel</Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save"}</Button>
      </div>
    </form>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="Manage your workforce"
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={downloadCSVTemplate}><Download className="w-4 h-4 mr-2" />CSV Template</Button>
            <label>
              <Button variant="outline" size="sm" asChild>
                <span><Upload className="w-4 h-4 mr-2" />Import</span>
              </Button>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={e => { if (e.target.files?.[0]) handleImportCSV(e.target.files[0]); e.target.value = ""; }} />
            </label>
            <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-2" />Add Employee</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Employees", value: stats?.total || 0, icon: Users, bg: "bg-blue-600" },
          { label: "Active", value: stats?.active || 0, icon: UserCheck, bg: "bg-emerald-600" },
          { label: "Inactive", value: stats?.inactive || 0, icon: UserMinus, bg: "bg-red-600" },
          { label: "Departments", value: (stats?.byDepartment || []).length, icon: Building, bg: "bg-indigo-600" },
        ].map(({ label, value, icon, bg }) => (
          <MetricCard key={label} label={label} value={value} icon={icon} bg={bg} />
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search employees..." className="pl-8" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={department} onValueChange={v => { setDepartment(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent searchable>
            <SelectItem value="all">All Departments</SelectItem>
            {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent searchable>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center rounded-md border p-1">
          <Button variant={view === "table" ? "secondary" : "ghost"} size="sm" onClick={() => setView("table")}><List className="w-4 h-4 mr-1" />Table</Button>
          <Button variant={view === "card" ? "secondary" : "ghost"} size="sm" onClick={() => setView("card")}><Grid className="w-4 h-4 mr-1" />Cards</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : view === "table" ? (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Photo</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Salary (₹)</TableHead>
                <TableHead>Joining</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employeesData?.data?.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell>
                    {(emp as any).imageUrl ? (
                      <img src={(emp as any).imageUrl} alt="" className="w-9 h-9 rounded-full object-cover border" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">{emp.firstName?.[0]}{emp.lastName?.[0]}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link href={`/employees/${emp.id}`}>
                      <div className="font-medium hover:text-primary cursor-pointer">{emp.firstName} {emp.lastName}</div>
                    </Link>
                    <div className="text-xs text-muted-foreground">{emp.employeeId}</div>
                  </TableCell>
                  <TableCell>{emp.department}</TableCell>
                  <TableCell>{emp.designation}</TableCell>
                  <TableCell>{getStatusBadge(emp.status)}</TableCell>
                  <TableCell>₹{emp.salary?.toLocaleString('en-IN')}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{emp.joiningDate ? format(new Date(emp.joiningDate), 'dd MMM yyyy') : '—'}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/employees/${emp.id}`}>
                            <button className="w-full text-left"><Edit className="w-4 h-4 mr-2" />Edit</button>
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600" onClick={() => { setSelectedEmployee(emp); setIsDeleteOpen(true); }}><Trash className="w-4 h-4 mr-2" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={employeesData?.pagination?.totalPages || 1} onPageChange={setPage} pageSize={pageSize} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {employeesData?.data?.map((emp) => (
              <Card key={emp.id} className="overflow-hidden hover:shadow-lg transition-all duration-200 group border">
                <div className="relative bg-gradient-to-br from-primary/10 to-primary/5 pt-6 pb-10 flex flex-col items-center">
                  <div className="relative">
                    {(emp as any).imageUrl ? (
                      <img src={(emp as any).imageUrl} alt="" className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-md" />
                    ) : (
                      <div className="w-20 h-20 rounded-full border-4 border-white shadow-md bg-primary/20 text-primary flex items-center justify-center font-bold text-2xl">
                        {emp.firstName?.[0]}{emp.lastName?.[0]}
                      </div>
                    )}
                    <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white ${emp.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                  </div>
                  <div className="absolute top-2 right-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 bg-white/70 hover:bg-white"><MoreVertical className="w-3.5 h-3.5" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/employees/${emp.id}`}>
                            <button className="w-full text-left"><Edit className="w-4 h-4 mr-2" />Edit</button>
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600" onClick={() => { setSelectedEmployee(emp); setIsDeleteOpen(true); }}><Trash className="w-4 h-4 mr-2" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <CardContent className="pt-3 pb-4 px-4 -mt-6">
                  <div className="bg-card rounded-t-2xl pt-3 px-1">
                    <div className="text-center mb-3">
                      <Link href={`/employees/${emp.id}`}>
                        <h4 className="font-bold text-sm hover:text-primary cursor-pointer">{emp.firstName} {emp.lastName}</h4>
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">{emp.designation}</p>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Building size={11} className="shrink-0" />
                        <span className="truncate">{emp.department}</span>
                        <span className="ml-auto">{getStatusBadge(emp.status)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail size={11} className="shrink-0" />
                        <span className="truncate">{emp.email}</span>
                      </div>
                      {emp.phone && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone size={11} className="shrink-0" />
                          <span>{emp.phone}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-muted-foreground pt-1 border-t mt-1">
                        <Briefcase size={11} className="shrink-0" />
                        <span>₹{emp.salary?.toLocaleString('en-IN')}/mo</span>
                        <span className="ml-auto text-[10px] text-muted-foreground/70">{emp.employeeId}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Pagination page={page} totalPages={employeesData?.pagination?.totalPages || 1} onPageChange={setPage} pageSize={pageSize} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        if (!open) {
          setDialogOpen(false);
          setSelectedEmployee(null);
          setPhotoPreview("");
          setFormData({
            firstName: "",
            lastName: "",
            email: "",
            phone: "",
            employeeId: "",
            department: "Engineering",
            designation: "",
            status: "active",
            salary: "",
            joiningDate: "",
            panNumber: "",
            aadharNumber: "",
            bankAccount: "",
            bankName: "",
            ifscCode: "",
            address: "",
            emergencyContact: "",
            imageUrl: "",
          });
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Employee</DialogTitle>
          </DialogHeader>
          {renderEmployeeForm("add")}
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
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
