import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ImportErrorPayload } from "@/lib/import-utils";

export function ImportErrorDialog() {
  const [error, setError] = useState<ImportErrorPayload | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      setError((event as CustomEvent<ImportErrorPayload>).detail);
    };
    window.addEventListener("import-validation-error", handler);
    return () => window.removeEventListener("import-validation-error", handler);
  }, []);

  return (
    <Dialog open={!!error} onOpenChange={(open) => !open && setError(null)}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {error?.title || "Import failed"}
          </DialogTitle>
          <DialogDescription>
            {error?.message || "The uploaded sheet could not be imported."}
          </DialogDescription>
        </DialogHeader>

        {error?.expectedHeaders?.length ? (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Expected headers</h3>
            <div className="rounded-md border bg-muted/30 p-3 text-sm leading-6">
              {error.expectedHeaders.join(", ")}
            </div>
          </section>
        ) : null}

        {error?.receivedHeaders?.length ? (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Uploaded headers</h3>
            <div className="rounded-md border bg-muted/30 p-3 text-sm leading-6">
              {error.receivedHeaders.join(", ")}
            </div>
          </section>
        ) : null}

        {error?.validationErrors?.length ? (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Data issues</h3>
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Row</th>
                    <th className="px-3 py-2 text-left font-semibold">Field</th>
                    <th className="px-3 py-2 text-left font-semibold">Issue</th>
                    <th className="px-3 py-2 text-left font-semibold">Expected</th>
                    <th className="px-3 py-2 text-left font-semibold">Uploaded value</th>
                  </tr>
                </thead>
                <tbody>
                  {error.validationErrors.map((issue, index) => (
                    <tr key={`${issue.row || "header"}-${issue.field || index}`} className="border-t">
                      <td className="px-3 py-2">{issue.row || "Header"}</td>
                      <td className="px-3 py-2">{issue.field || "-"}</td>
                      <td className="px-3 py-2">{issue.message}</td>
                      <td className="px-3 py-2">{issue.expected || "-"}</td>
                      <td className="px-3 py-2">{issue.value === undefined || issue.value === null ? "-" : String(issue.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <DialogFooter>
          <Button onClick={() => setError(null)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
