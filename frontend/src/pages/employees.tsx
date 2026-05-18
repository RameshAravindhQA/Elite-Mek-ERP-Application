import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListEmployees, useCreateEmployee, useUpdateEmployee, useDeleteEmployee,
  useGetEmployeeStats, getListEmployeesQueryKey, getGetEmployeeStatsQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage, getFieldErrorMap } from "@/lib/error-utils";
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
import { Users, UserCheck, UserMinus, Building, Search, Download, Upload, Grid, List, Edit, Trash, Plus, Camera, Mail, Phone, Briefcase, Eye } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/Pagination";
import { Link } from "wouter";
import { downloadImportTemplate, importModuleFile } from "@/lib/import-utils";

const DEPARTMENTS = ["Engineering", "HR", "Sales", "Finance", "Marketing", "Operations", "Production", "Quality", "Maintenance"];

const employeeInitials = (employee: any) =>
  `${employee.firstName?.trim()?.[0] || ""}${employee.lastName?.trim()?.[0] || ""}`.toUpperCase() || "EM";

function isValidDate(dateString: string): boolean {
  if (!dateString) return false;
  // For HTML date input, we get YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return true;
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

function formatPhoneForSubmission(phone: string): string {
  if (!phone) return "";
  // Remove all spaces, parentheses, and extra formatting
  // But keep + and - for country code and formatting
  return phone.replace(/[()]/g, "").trim();
}

function normalizePhone(phone: string): string {
  if (!phone) return "";
  // Clean up phone input - remove excessive spaces
  return phone.replace(/\s+/g, " ").trim();
}

function EmployeeAvatar({ employee, size = "md" }: { employee: any; size?: "sm" | "md" }) {
  const [failed, setFailed] = useState(false);
  const sizeClass = size === "sm" ? "w-9 h-9 text-sm" : "w-20 h-20 text-2xl";
  const imageClass = size === "sm" ? "w-9 h-9 rounded-full object-cover border" : "w-20 h-20 rounded-full object-cover border-4 border-white shadow-md";
  const fallbackClass = size === "sm"
    ? "w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm"
    : "w-20 h-20 rounded-full border-4 border-white shadow-md bg-slate-900 text-white flex items-center justify-center font-bold text-2xl";

  if (employee.imageUrl && !failed) {
    return <img src={employee.imageUrl} alt="" className={imageClass} onError={() => setFailed(true)} />;
  }

  return <div className={`${fallbackClass} ${sizeClass}`}>{employeeInitials(employee)}</div>;
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
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationFieldErrors, setValidationFieldErrors] = useState<Record<string, string>>({});
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
    if (validationErrors.length > 0) setValidationErrors([]);
    if (validationFieldErrors[name]) {
      setValidationFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
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

    // Validate file size (max 500KB)
    if (file.size > 500 * 1024) {
      toast({ title: "File too large", description: "Image must be smaller than 500KB", variant: "destructive" });
      return;
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      // Limit base64 string to 300KB when encoded
      if (base64.length > 300 * 1024) {
        toast({ title: "Image too large", description: "Please use a smaller image file", variant: "destructive" });
        return;
      }
      setPhotoPreview(base64);
      setFormData((f: any) => ({ ...f, imageUrl: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const openAdd = () => {
    setPhotoPreview("");
    setValidationErrors([]);
    setValidationFieldErrors({});
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
      email: formData.email?.trim().toLowerCase(),
      phone: formatPhoneForSubmission(formData.phone?.trim() || ""),
      department: formData.department,
      designation: formData.designation?.trim(),
      status: formData.status || "active",
      salary: formData.salary?.trim(),
      joiningDate: formData.joiningDate,
      employeeId: formData.employeeId?.trim(),
      panNumber: formData.panNumber?.trim()?.toUpperCase() || undefined,
      aadharNumber: formData.aadharNumber?.trim() || undefined,
      bankAccount: formData.bankAccount?.trim() || undefined,
      bankName: formData.bankName?.trim() || undefined,
      ifscCode: formData.ifscCode?.trim()?.toUpperCase() || undefined,
      address: formData.address?.trim() || undefined,
      emergencyContact: formData.emergencyContact?.trim() || undefined,
      imageUrl: (photoPreview || formData.imageUrl || undefined),
    };

    if (!data.firstName || !data.lastName || !data.email || !data.employeeId || !data.designation || !data.salary || !data.joiningDate) {
      toast({ title: "Error saving employee", description: "Please fill all required fields.", variant: "destructive" });
      setValidationFieldErrors({
        ...(!data.firstName ? { firstName: "First name is required" } : {}),
        ...(!data.lastName ? { lastName: "Last name is required" } : {}),
        ...(!data.email ? { email: "Email is required" } : {}),
        ...(!data.employeeId ? { employeeId: "Employee ID is required" } : {}),
        ...(!data.designation ? { designation: "Designation is required" } : {}),
        ...(!data.salary ? { salary: "Salary is required" } : {}),
        ...(!data.joiningDate ? { joiningDate: "Joining date is required" } : {}),
      });
      setIsSubmitting(false);
      return;
    }

    // Validate date format
    if (!isValidDate(data.joiningDate)) {
      toast({ title: "Invalid date", description: "Joining date must be in valid format (YYYY-MM-DD)", variant: "destructive" });
      setValidationFieldErrors({ joiningDate: "Joining date must be in valid format (YYYY-MM-DD)" });
      setIsSubmitting(false);
      return;
    }

    // Validate salary
    const salaryValue = Number(data.salary);
    if (isNaN(salaryValue) || salaryValue <= 0) {
      toast({ title: "Invalid salary", description: "Salary must be a positive number", variant: "destructive" });
      setValidationFieldErrors({ salary: "Salary must be a positive number" });
      setIsSubmitting(false);
      return;
    }

    try {
      await createMutation.mutateAsync({ data: { ...data, salary: salaryValue } });
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
      console.error("Employee save error:", err);
      const errorData = err?.response?.data;
      let fullMessage = "Failed to save employee";
      let backendErrors: string[] = [];
      
      if (errorData?.error) {
        fullMessage = errorData.error;
        if (errorData.details) {
          if (Array.isArray(errorData.details)) {
            backendErrors = errorData.details.map((d: any) => `${d.field || d.path || "field"}: ${d.message}`);
            const detailsText = backendErrors.join("; ");
            fullMessage += ` - ${detailsText}`;
          } else if (typeof errorData.details === "string") {
            fullMessage += ` - ${errorData.details}`;
            backendErrors = [errorData.details];
          }
        }
      } else if (err?.message) {
        fullMessage = err.message;
      }
      
      setValidationErrors(backendErrors);
      setValidationFieldErrors(getFieldErrorMap(err));
      toast({ title: "Error saving employee", description: getApiErrorMessage(err, fullMessage), variant: "destructive" });
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

  const handleDownloadTemplate = async () => {
    try {
      await downloadImportTemplate("employees", "employees-template.xlsx");
      toast({ title: "Employee template downloaded" });
    } catch (err) {
      toast({ title: "Template download failed", description: (err as Error).message, variant: "destructive" });
    }
  };

  const handleImportEmployees = async (file: File) => {
    try {
      const response = await importModuleFile("employees", file);
      queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetEmployeeStatsQueryKey() });
      setPage(1);
      toast({ title: `Imported ${response.imported || 0} employees` });
    } catch (err) {
      toast({ title: "Employee import failed", description: (err as Error).message, variant: "destructive" });
    }
  };

  const getStatusBadge = (s: string) => {
    const m: Record<string, string> = {
      active: "bg-emerald-100 text-emerald-700 border border-emerald-200",
      inactive: "bg-red-100 text-red-700 border border-red-200",
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m[s] || "bg-gray-100 text-gray-700"}`}>{s}</span>;
  };

  const fieldError = (field: string) => validationFieldErrors[field];
  const inputErrorClass = (field: string) => fieldError(field) ? "border-destructive focus-visible:ring-destructive" : "";
  const renderFieldError = (field: string) => fieldError(field) ? <p className="text-xs text-destructive">{fieldError(field)}</p> : null;

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

      {validationErrors.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {validationErrors.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label className="text-xs">First Name *</Label><Input name="firstName" required aria-invalid={!!fieldError("firstName")} className={inputErrorClass("firstName")} value={formData.firstName} onChange={(e) => handleFormChange("firstName", e.target.value)} />{renderFieldError("firstName")}</div>
        <div className="space-y-1"><Label className="text-xs">Last Name *</Label><Input name="lastName" required aria-invalid={!!fieldError("lastName")} className={inputErrorClass("lastName")} value={formData.lastName} onChange={(e) => handleFormChange("lastName", e.target.value)} />{renderFieldError("lastName")}</div>
        <div className="space-y-1"><Label className="text-xs">Email *</Label><Input name="email" type="email" required aria-invalid={!!fieldError("email")} className={inputErrorClass("email")} value={formData.email} onChange={(e) => handleFormChange("email", e.target.value)} />{renderFieldError("email")}</div>
        <div className="space-y-1"><Label className="text-xs">Phone</Label><Input name="phone" type="tel" placeholder="9876543210 or +919876543210" aria-invalid={!!fieldError("phone")} className={inputErrorClass("phone")} value={formData.phone} onChange={(e) => handleFormChange("phone", normalizePhone(e.target.value))} />{renderFieldError("phone")}</div>
        <div className="space-y-1"><Label className="text-xs">Employee ID *</Label><Input name="employeeId" required aria-invalid={!!fieldError("employeeId")} className={inputErrorClass("employeeId")} value={formData.employeeId} onChange={(e) => handleFormChange("employeeId", e.target.value)} />{renderFieldError("employeeId")}</div>
        <div className="space-y-1">
          <Label className="text-xs">Department</Label>
          <Select value={formData.department} onValueChange={(v) => handleFormChange("department", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent searchable>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label className="text-xs">Designation *</Label><Input name="designation" required aria-invalid={!!fieldError("designation")} className={inputErrorClass("designation")} value={formData.designation} onChange={(e) => handleFormChange("designation", e.target.value)} />{renderFieldError("designation")}</div>
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
        <div className="space-y-1"><Label className="text-xs">Salary (₹) *</Label><Input name="salary" type="number" required aria-invalid={!!fieldError("salary")} className={inputErrorClass("salary")} value={formData.salary} onChange={(e) => handleFormChange("salary", e.target.value)} />{renderFieldError("salary")}</div>
        <div className="space-y-1"><Label className="text-xs">Joining Date *</Label><Input name="joiningDate" type="date" required aria-invalid={!!fieldError("joiningDate")} className={inputErrorClass("joiningDate")} value={formData.joiningDate} onChange={(e) => handleFormChange("joiningDate", e.target.value)} />{renderFieldError("joiningDate")}</div>
        <div className="space-y-1"><Label className="text-xs">PAN Number</Label><Input name="panNumber" aria-invalid={!!fieldError("panNumber")} className={inputErrorClass("panNumber")} value={formData.panNumber} onChange={(e) => handleFormChange("panNumber", e.target.value)} />{renderFieldError("panNumber")}</div>
        <div className="space-y-1"><Label className="text-xs">Aadhar Number</Label><Input name="aadharNumber" aria-invalid={!!fieldError("aadharNumber")} className={inputErrorClass("aadharNumber")} value={formData.aadharNumber} onChange={(e) => handleFormChange("aadharNumber", e.target.value)} />{renderFieldError("aadharNumber")}</div>
        <div className="space-y-1"><Label className="text-xs">Bank Account</Label><Input name="bankAccount" aria-invalid={!!fieldError("bankAccount")} className={inputErrorClass("bankAccount")} value={formData.bankAccount} onChange={(e) => handleFormChange("bankAccount", e.target.value)} />{renderFieldError("bankAccount")}</div>
        <div className="space-y-1"><Label className="text-xs">Bank Name</Label><Input name="bankName" value={formData.bankName} onChange={(e) => handleFormChange("bankName", e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">IFSC Code</Label><Input name="ifscCode" aria-invalid={!!fieldError("ifscCode")} className={inputErrorClass("ifscCode")} value={formData.ifscCode} onChange={(e) => handleFormChange("ifscCode", e.target.value)} />{renderFieldError("ifscCode")}</div>
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
          <div className="flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate}><Download className="w-4 h-4 mr-2" />Template</Button>
            <label>
              <Button variant="outline" size="sm" asChild>
                <span><Upload className="w-4 h-4 mr-2" />Import</span>
              </Button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={e => { if (e.target.files?.[0]) handleImportEmployees(e.target.files[0]); e.target.value = ""; }} />
            </label>
            <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-2" />Add Employee</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total Employees", value: stats?.total || 0, icon: Users, bg: "bg-blue-600" },
          { label: "Active", value: stats?.active || 0, icon: UserCheck, bg: "bg-emerald-600" },
          { label: "Inactive", value: stats?.inactive || 0, icon: UserMinus, bg: "bg-red-600" },
          { label: "Departments", value: (stats?.byDepartment || []).length, icon: Building, bg: "bg-indigo-600" },
        ].map(({ label, value, icon, bg }) => (
          <MetricCard key={label} label={label} value={value} icon={icon} bg={bg} />
        ))}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search employees..." className="pl-8" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={department} onValueChange={v => { setDepartment(v); setPage(1); }}>
          <SelectTrigger className="w-full lg:w-[180px]"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent searchable>
            <SelectItem value="all">All Departments</SelectItem>
            {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-full lg:w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent searchable>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex w-full items-center rounded-md border p-1 sm:w-auto">
          <Button variant={view === "table" ? "secondary" : "ghost"} size="sm" onClick={() => setView("table")}><List className="w-4 h-4 mr-1" />Table</Button>
          <Button variant={view === "card" ? "secondary" : "ghost"} size="sm" onClick={() => setView("card")}><Grid className="w-4 h-4 mr-1" />Cards</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : view === "table" ? (
        <div className="rounded-md">
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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employeesData?.data?.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell>
                    <EmployeeAvatar employee={emp} size="sm" />
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
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/employees/${emp.id}`}><Button variant="ghost" size="icon" title="View employee"><Eye className="w-4 h-4" /></Button></Link>
                      <Link href={`/employees/${emp.id}`}><Button variant="ghost" size="icon" title="Edit employee"><Edit className="w-4 h-4" /></Button></Link>
                      <Button variant="ghost" size="icon" title="Delete employee" className="text-red-600" onClick={() => { setSelectedEmployee(emp); setIsDeleteOpen(true); }}><Trash className="w-4 h-4" /></Button>
                    </div>
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
                    <EmployeeAvatar employee={emp} />
                    <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white ${emp.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                  </div>
                  <div className="absolute top-2 right-2">
                    <div className="flex gap-1">
                      <Link href={`/employees/${emp.id}`}><Button variant="secondary" size="icon" title="View employee" className="h-7 w-7 bg-white/90"><Eye className="w-3.5 h-3.5" /></Button></Link>
                      <Link href={`/employees/${emp.id}`}><Button variant="secondary" size="icon" title="Edit employee" className="h-7 w-7 bg-white/90"><Edit className="w-3.5 h-3.5" /></Button></Link>
                      <Button variant="secondary" size="icon" title="Delete employee" className="h-7 w-7 bg-white/90 text-red-600" onClick={() => { setSelectedEmployee(emp); setIsDeleteOpen(true); }}><Trash className="w-3.5 h-3.5" /></Button>
                    </div>
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
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
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
