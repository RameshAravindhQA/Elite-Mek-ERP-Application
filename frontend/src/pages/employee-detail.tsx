import React, { useState, useRef } from "react";
import { useGetEmployee, useUpdateEmployee, useListDocuments, useCreateDocument, useUpdateDocument, useDeleteDocument, getGetEmployeeQueryKey, getListEmployeesQueryKey, getListDocumentsQueryKey } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ArrowLeft, Camera, Edit, Loader2, Phone, Mail, MapPin, Building2, Calendar, CreditCard, Shield, TrendingUp } from "lucide-react";
import { useApiClient } from "@/lib/api-client";

export default function EmployeeDetail({ params }: { params: { id: string } }) {
  const { data: employee, isLoading } = useGetEmployee(Number(params.id));
  const updateEmployee = useUpdateEmployee();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [hikeForm, setHikeForm] = useState<any>({ effectiveDate: new Date().toISOString().slice(0, 10), reason: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHikeSubmitting, setIsHikeSubmitting] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [isDocUploading, setIsDocUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);

  const salaryHikesQueryKey = ["employee-salary-hikes", Number(params.id)];
  const { data: salaryHikesData, isLoading: salaryHikesLoading } = useQuery({
    queryKey: salaryHikesQueryKey,
    queryFn: async () => {
      const response = await apiClient.get<{ data: any[] }>(`/employees/${params.id}/salary-hikes`);
      return response.data;
    },
    enabled: Boolean(params.id),
  });

  const documentListParams = employee ? { page: 1, limit: 100, search: employee.employeeId } : undefined;
  const documentListQueryKey = getListDocumentsQueryKey(documentListParams);
  const { data: documentsData, isLoading: docsLoading } = useListDocuments(
    documentListParams,
    { query: { enabled: Boolean(employee), queryKey: documentListQueryKey } }
  );

  const createDocument = useCreateDocument();
  const updateDocument = useUpdateDocument();
  const deleteDocument = useDeleteDocument();

  const openEdit = () => {
    setFormData(employee || {});
    setIsEditing(true);
  };

  const optionalText = (value: unknown) => {
    const text = typeof value === "string" ? value.trim() : "";
    return text || undefined;
  };

  const buildEmployeeUpdatePayload = () => ({
    firstName: optionalText(formData.firstName),
    lastName: optionalText(formData.lastName),
    email: optionalText(formData.email),
    phone: optionalText(formData.phone),
    department: optionalText(formData.department),
    designation: optionalText(formData.designation),
    status: optionalText(formData.status) || "active",
    salary: Number(formData.salary || 0),
    joiningDate: optionalText(formData.joiningDate),
    imageUrl: optionalText(formData.imageUrl),
    panNumber: optionalText(formData.panNumber),
    aadharNumber: optionalText(formData.aadharNumber),
    bankAccount: optionalText(formData.bankAccount),
    bankName: optionalText(formData.bankName),
    ifscCode: optionalText(formData.ifscCode),
    address: optionalText(formData.address),
    emergencyContact: optionalText(formData.emergencyContact),
  });

  const onSubmit = async () => {
    setIsSubmitting(true);
    try {
      await updateEmployee.mutateAsync({
        id: Number(params.id),
        data: buildEmployeeUpdatePayload() as any,
      });
      toast({ title: "Employee details updated" });
      queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(Number(params.id)) });
      queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
      setIsEditing(false);
    } catch (error: any) {
      const validationDetails = error?.response?.data?.details;
      const description = Array.isArray(validationDetails)
        ? validationDetails.map((item: any) => `${item.path}: ${item.message}`).join(", ")
        : error?.response?.data?.error || error?.message;
      toast({ title: "Failed to update employee", description, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDocTypeFromTitle = (title: string) => {
    if (!title) return "";
    const parts = title.split("•");
    if (parts.length > 1) return parts[1].trim();
    const dashed = title.split("-");
    return dashed.length > 1 ? dashed[1].trim() : title;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("Failed to read file"));
    };
    reader.onerror = () => reject(new Error("File read error"));
    reader.readAsDataURL(file);
  });

  const handleProfilePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid profile photo", description: "Please choose a JPG, PNG, or other image file.", variant: "destructive" });
      event.target.value = "";
      return;
    }

    try {
      const imageUrl = await readFileAsDataUrl(file);
      setFormData((current: any) => ({ ...current, imageUrl }));
    } catch {
      toast({ title: "Unable to import profile photo", variant: "destructive" });
    } finally {
      event.target.value = "";
    }
  };

  const uploadEmployeeDocument = async (type: string, file: File) => {
    if (!employee) return;
    setIsDocUploading(true);
    const employeeDocs = (documentsData?.data || []).filter((doc: any) => doc.title?.includes(employee.employeeId));
    const existing = employeeDocs.find((doc: any) => getDocTypeFromTitle(doc.title) === type);
    try {
      const fileUrl = await readFileAsDataUrl(file);
      const payload = {
        title: `${employee.employeeId} • ${type}`,
        fileUrl,
        fileType: file.name.split(".").pop()?.toUpperCase() || "FILE",
        fileSize: formatFileSize(file.size),
        tags: [employee.employeeId, type.toLowerCase().replace(/\s+/g, "-"), "employee"],
      } as any;

      if (existing) {
        await updateDocument.mutateAsync({ id: existing.id, data: payload });
        toast({ title: `${type} document updated.` });
      } else {
        await createDocument.mutateAsync({ data: payload });
        toast({ title: `${type} document uploaded.` });
      }
      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey({ page: 1, limit: 100, search: employee.employeeId }) });
    } catch (error) {
      toast({ title: `Failed to upload ${type}`, variant: "destructive" });
    } finally {
      setIsDocUploading(false);
      setUploadingType(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDocumentChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !uploadingType) {
      setUploadingType(null);
      return;
    }
    await uploadEmployeeDocument(uploadingType, file);
  };

  const deleteEmployeeDocument = async (docId: number) => {
    try {
      await deleteDocument.mutateAsync({ id: docId });
      toast({ title: `Document removed.` });
      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey({ page: 1, limit: 100, search: employee?.employeeId }) });
    } catch {
      toast({ title: "Failed to delete document", variant: "destructive" });
    }
  };

  const employeeDocuments = (documentsData?.data || []).filter((doc: any) => employee && doc.title?.includes(employee.employeeId));

  const documentByType = (type: string) => employeeDocuments.find((doc: any) => getDocTypeFromTitle(doc.title) === type);

  const recordSalaryHike = async () => {
    setIsHikeSubmitting(true);
    try {
      await apiClient.post(`/employees/${params.id}/salary-hikes`, {
        newSalary: Number(hikeForm.newSalary),
        effectiveDate: hikeForm.effectiveDate,
        reason: hikeForm.reason,
      });
      toast({ title: "Salary hike recorded" });
      setHikeForm({ effectiveDate: new Date().toISOString().slice(0, 10), reason: "" });
      queryClient.invalidateQueries({ queryKey: salaryHikesQueryKey });
      queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(Number(params.id)) });
    } catch (error: any) {
      toast({ title: "Failed to record salary hike", description: error?.response?.data?.error, variant: "destructive" });
    } finally {
      setIsHikeSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!employee) return <div>Employee not found</div>;

  const initials = `${employee.firstName?.charAt(0) || ""}${employee.lastName?.charAt(0) || ""}` || "EM";
  const profileImageUrl = isEditing ? formData.imageUrl : (employee as any).imageUrl;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-2">
        <Link href="/employees" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Employees
        </Link>
      </div>

      {/* Top Profile Card */}
      <Card className="border-none shadow-md bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 overflow-hidden relative">
        <CardContent className="p-8 flex flex-col md:flex-row items-center gap-8">
          <div className="relative">
            <button
              type="button"
              className="group relative h-24 w-24 overflow-hidden rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-default"
              onClick={() => isEditing && profilePhotoInputRef.current?.click()}
              disabled={!isEditing || isSubmitting}
              aria-label={isEditing ? "Import employee profile photo" : "Employee profile photo"}
            >
              {profileImageUrl ? (
                <img src={profileImageUrl} alt={`${employee.firstName} ${employee.lastName}`} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-3xl font-bold">{initials.toUpperCase()}</span>
              )}
              {isEditing && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Camera className="h-6 w-6" />
                </span>
              )}
            </button>
            {isEditing && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="absolute -bottom-2 left-1/2 h-7 -translate-x-1/2 px-2 text-xs shadow"
                onClick={() => profilePhotoInputRef.current?.click()}
                disabled={isSubmitting}
              >
                <Camera className="mr-1 h-3.5 w-3.5" /> Photo
              </Button>
            )}
            <input
              ref={profilePhotoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleProfilePhotoChange}
            />
          </div>
          <div className="flex-1 text-center md:text-left space-y-2">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <h1 className="text-3xl font-bold text-foreground">{employee.firstName} {employee.lastName}</h1>
              <div className="flex items-center gap-2 justify-center md:justify-start">
                <Badge variant="outline" className="bg-background/50 border-primary/20 font-mono tracking-wider">{employee.employeeId}</Badge>
                <Badge className={employee.status?.toLowerCase() === 'active' ? 'bg-green-500' : 'bg-red-500'}>{employee.status}</Badge>
              </div>
            </div>
            <div className="flex items-center justify-center md:justify-start gap-4 text-muted-foreground">
              <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4" /> {employee.department}</span>
              <span>•</span>
              <span className="flex items-center gap-1.5"><Shield className="w-4 h-4" /> {employee.designation}</span>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {isEditing ? (
              <>
                <Button variant="secondary" className="shadow-sm" onClick={onSubmit} disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save changes
                </Button>
                <Button variant="outline" className="shadow-sm" onClick={() => { setFormData(employee); setIsEditing(false); }} disabled={isSubmitting}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="secondary" className="shadow-sm" onClick={openEdit}>
                <Edit className="w-4 h-4 mr-2" /> Edit Profile
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid grid-cols-5 w-full h-12 bg-muted/50 p-1 rounded-xl">
          <TabsTrigger value="basic" className="rounded-md data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm">Basic Info</TabsTrigger>
          <TabsTrigger value="identity" className="rounded-md data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm">Identity & Docs</TabsTrigger>
          <TabsTrigger value="banking" className="rounded-md data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm">Banking Details</TabsTrigger>
          <TabsTrigger value="emergency" className="rounded-md data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm">Emergency Contact</TabsTrigger>
          <TabsTrigger value="salary" className="rounded-md data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm">Salary Hikes</TabsTrigger>
        </TabsList>
        
        <div className="mt-6 border rounded-xl bg-card shadow-sm p-6">
          <TabsContent value="basic" className="m-0 focus-visible:outline-none">
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2"><MapPin className="w-5 h-5 text-primary" /> Personal Information</h3>
            {isEditing ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" value={formData.firstName || ""} onChange={e => setFormData({ ...formData, firstName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" value={formData.lastName || ""} onChange={e => setFormData({ ...formData, lastName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input id="email" type="email" value={formData.email || ""} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input id="phone" value={formData.phone || ""} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="department">Department</Label>
                    <Input id="department" value={formData.department || ""} onChange={e => setFormData({ ...formData, department: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="designation">Designation</Label>
                    <Input id="designation" value={formData.designation || ""} onChange={e => setFormData({ ...formData, designation: e.target.value })} />
                  </div>
                </div>

                <div className="space-y-4 md:col-span-2">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="salary">Salary</Label>
                      <Input id="salary" type="number" value={formData.salary || ""} onChange={e => setFormData({ ...formData, salary: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="panNumber">PAN Number</Label>
                      <Input id="panNumber" value={formData.panNumber || ""} onChange={e => setFormData({ ...formData, panNumber: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="aadharNumber">Aadhar Number</Label>
                      <Input id="aadharNumber" value={formData.aadharNumber || ""} onChange={e => setFormData({ ...formData, aadharNumber: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
                <div><p className="text-sm text-muted-foreground mb-1">Email Address</p><p className="font-medium flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /> {employee.email}</p></div>
                <div><p className="text-sm text-muted-foreground mb-1">Phone Number</p><p className="font-medium flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /> {employee.phone || "-"}</p></div>
                <div><p className="text-sm text-muted-foreground mb-1">Joining Date</p><p className="font-medium flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" /> {employee.joiningDate ? format(new Date(employee.joiningDate), 'dd MMM yyyy') : "-"}</p></div>
                <div><p className="text-sm text-muted-foreground mb-1">Salary</p><p className="font-medium text-green-600 dark:text-green-500 font-mono">₹ {(employee.salary || 0).toLocaleString('en-IN')}</p></div>
              </div>
            )}
          </TabsContent>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={handleDocumentChange}
          />
          <TabsContent value="identity" className="m-0 focus-visible:outline-none">
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2"><Shield className="w-5 h-5 text-primary" /> Identity Documents</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border p-5 bg-background shadow-sm">
                <p className="text-sm text-muted-foreground mb-1">PAN Number</p>
                <p className="font-medium uppercase tracking-wider font-mono mb-4">{employee.panNumber || "Not Provided"}</p>
                <div className="flex items-center gap-2 mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setUploadingType("PAN");
                      fileInputRef.current?.click();
                    }}
                    disabled={isDocUploading}
                  >
                    {documentByType("PAN") ? "Replace PAN" : "Upload PAN"}
                  </Button>
                  {documentByType("PAN") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        const document = documentByType("PAN");
                        if (document?.id) deleteEmployeeDocument(document.id);
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                {documentByType("PAN") ? (
                  <div className="rounded-lg border bg-surface p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{documentByType("PAN")?.title}</p>
                        <p className="text-xs text-muted-foreground">{documentByType("PAN")?.fileSize}</p>
                      </div>
                      <a
                        href={documentByType("PAN")?.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline text-sm"
                      >
                        View
                      </a>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border p-5 bg-background shadow-sm">
                <p className="text-sm text-muted-foreground mb-1">Aadhar Number</p>
                <p className="font-medium tracking-widest font-mono mb-4">{employee.aadharNumber || "Not Provided"}</p>
                <div className="flex items-center gap-2 mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setUploadingType("Aadhar");
                      fileInputRef.current?.click();
                    }}
                    disabled={isDocUploading}
                  >
                    {documentByType("Aadhar") ? "Replace Aadhar" : "Upload Aadhar"}
                  </Button>
                  {documentByType("Aadhar") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        const document = documentByType("Aadhar");
                        if (document?.id) deleteEmployeeDocument(document.id);
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                {documentByType("Aadhar") ? (
                  <div className="rounded-lg border bg-surface p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{documentByType("Aadhar")?.title}</p>
                        <p className="text-xs text-muted-foreground">{documentByType("Aadhar")?.fileSize}</p>
                      </div>
                      <a
                        href={documentByType("Aadhar")?.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline text-sm"
                      >
                        View
                      </a>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="md:col-span-2 rounded-xl border p-5 bg-background shadow-sm">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Bank Passbook</p>
                    <p className="font-medium">{documentByType("Bank Passbook") ? "Uploaded" : "Not Uploaded"}</p>
                  </div>
                  <div className="space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setUploadingType("Bank Passbook");
                        fileInputRef.current?.click();
                      }}
                      disabled={isDocUploading}
                    >
                      {documentByType("Bank Passbook") ? "Replace" : "Upload"}
                    </Button>
                    {documentByType("Bank Passbook") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => {
                          const document = documentByType("Bank Passbook");
                          if (document?.id) deleteEmployeeDocument(document.id);
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
                {documentByType("Bank Passbook") ? (
                  <div className="rounded-lg border bg-surface p-4">
                    <p className="text-sm text-muted-foreground mb-1">Document</p>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{documentByType("Bank Passbook")?.title}</p>
                        <p className="text-xs text-muted-foreground">{documentByType("Bank Passbook")?.fileSize}</p>
                      </div>
                      <a
                        href={documentByType("Bank Passbook")?.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline text-sm"
                      >
                        View
                      </a>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Upload a bank passbook copy to keep employee banking records current.</p>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="banking" className="m-0 focus-visible:outline-none">
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2"><CreditCard className="w-5 h-5 text-primary" /> Banking Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
              <div><p className="text-sm text-muted-foreground mb-1">Bank Name</p><p className="font-medium">{employee.bankName || "Not Provided"}</p></div>
              <div><p className="text-sm text-muted-foreground mb-1">Account Number</p><p className="font-medium font-mono tracking-wider">{employee.bankAccount || "Not Provided"}</p></div>
              <div><p className="text-sm text-muted-foreground mb-1">IFSC Code</p><p className="font-medium uppercase font-mono tracking-wider">{employee.ifscCode || "Not Provided"}</p></div>
            </div>
          </TabsContent>

          <TabsContent value="emergency" className="m-0 focus-visible:outline-none">
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2"><Phone className="w-5 h-5 text-primary" /> Emergency Contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
              <div><p className="text-sm text-muted-foreground mb-1">Contact Details</p><p className="font-medium">{employee.emergencyContact || "Not Provided"}</p></div>
            </div>
          </TabsContent>

          <TabsContent value="salary" className="m-0 focus-visible:outline-none">
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-primary" /> Salary Hike Records</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2"><label className="text-xs font-medium">New Salary</label><Input type="number" value={hikeForm.newSalary || ""} onChange={e => setHikeForm({ ...hikeForm, newSalary: e.target.value })} /></div>
              <div className="space-y-2"><label className="text-xs font-medium">Effective Date</label><Input type="date" value={hikeForm.effectiveDate || ""} onChange={e => setHikeForm({ ...hikeForm, effectiveDate: e.target.value })} /></div>
              <div className="space-y-2"><label className="text-xs font-medium">Reason</label><Input value={hikeForm.reason || ""} onChange={e => setHikeForm({ ...hikeForm, reason: e.target.value })} placeholder="Annual appraisal, promotion..." /></div>
            </div>
            <Button className="mt-4" onClick={recordSalaryHike} disabled={isHikeSubmitting || !hikeForm.newSalary}>
              {isHikeSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Record Hike
            </Button>

            <div className="mt-6 overflow-hidden rounded-md border">
              <div className="grid grid-cols-6 bg-table-header px-4 py-2 text-xs font-semibold uppercase text-table-header-foreground">
                <span>Date</span><span>Previous</span><span>New</span><span>Amount</span><span>Percent</span><span>Reason</span>
              </div>
              {salaryHikesLoading ? (
                <div className="p-4 text-sm text-muted-foreground">Loading salary hike records...</div>
              ) : salaryHikesData?.data?.length ? salaryHikesData.data.map((hike: any) => (
                <div key={hike.id} className="grid grid-cols-6 border-t px-4 py-3 text-sm">
                  <span>{format(new Date(hike.effectiveDate), "dd MMM yyyy")}</span>
                  <span>₹ {hike.previousSalary.toLocaleString("en-IN")}</span>
                  <span>₹ {hike.newSalary.toLocaleString("en-IN")}</span>
                  <span className={hike.hikeAmount >= 0 ? "text-emerald-600" : "text-red-600"}>₹ {hike.hikeAmount.toLocaleString("en-IN")}</span>
                  <span>{hike.hikePercent.toFixed(2)}%</span>
                  <span className="truncate">{hike.reason || "-"}</span>
                </div>
              )) : (
                <div className="p-4 text-sm text-muted-foreground">No salary hike records yet.</div>
              )}
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
