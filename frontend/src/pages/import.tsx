import { useEffect, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { downloadImportTemplate, getBaseApiPath, importModuleFile } from "@/lib/import-utils";

const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const formatModuleName = (moduleName: string) =>
  moduleName
    .replace(/_/g, "-")
    .split("-")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export default function Import() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [modules, setModules] = useState<string[]>([]);
  const [selectedModule, setSelectedModule] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${getBaseApiPath()}/import/modules`, {
      credentials: "include",
      headers: getAuthHeaders(),
    })
      .then(async response => {
        if (!response.ok) throw new Error("Unable to load import modules");
        return response.json();
      })
      .then(data => {
        if (cancelled) return;
        const availableModules = (data.modules || []) as string[];
        setModules(availableModules);
        setSelectedModule(availableModules[0] || "");
      })
      .catch(error => {
        if (!cancelled) toast({ title: "Import modules unavailable", description: error.message, variant: "destructive" });
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const handleDownload = async () => {
    if (!selectedModule) return;
    try {
      await downloadImportTemplate(selectedModule, `${selectedModule}-template.xlsx`);
      toast({ title: "Template downloaded", description: `${formatModuleName(selectedModule)} import template is ready.` });
    } catch (error) {
      toast({ title: "Template download failed", description: (error as Error).message, variant: "destructive" });
    }
  };

  const handleImport = async (file: File) => {
    if (!selectedModule) return;
    setLoading(true);
    try {
      const response = await importModuleFile(selectedModule, file);
      toast({ title: "Import completed", description: `Imported ${response.imported || 0} ${formatModuleName(selectedModule)} row(s).` });
    } catch (error) {
      toast({ title: "Import failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import</h1>
        <p className="mt-1 text-sm text-muted-foreground">Download the module template, keep the headers unchanged, then upload the completed sheet.</p>
      </div>

      <section className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-[minmax(220px,320px)_auto_auto] md:items-end">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="import-module">Module</label>
          <Select value={selectedModule} onValueChange={setSelectedModule}>
            <SelectTrigger id="import-module">
              <SelectValue placeholder="Select module" />
            </SelectTrigger>
            <SelectContent>
              {modules.map(moduleName => (
                <SelectItem key={moduleName} value={moduleName}>{formatModuleName(moduleName)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={handleDownload} disabled={!selectedModule}>
          <Download className="mr-2 h-4 w-4" />
          Template
        </Button>
        <Button onClick={() => fileRef.current?.click()} disabled={!selectedModule || loading}>
          <Upload className="mr-2 h-4 w-4" />
          {loading ? "Importing" : "Upload"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleImport(file);
            event.currentTarget.value = "";
          }}
        />
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">Available modules</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {modules.map(moduleName => (
            <span key={moduleName} className="rounded-md border bg-muted/30 px-2.5 py-1 text-sm">
              {formatModuleName(moduleName)}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
