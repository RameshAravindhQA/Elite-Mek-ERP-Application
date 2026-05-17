import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import clientLogger from "@/lib/client-logger";
import { Download, Trash2, Eye, EyeOff } from "lucide-react";

export function DebugLogs() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!isOpen) return;
    refreshLogs();
    const interval = setInterval(refreshLogs, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [isOpen, filter]);

  const refreshLogs = async () => {
    const logLevel = filter === "all" ? undefined : (filter as any);
    const logsData = await clientLogger.getLogs(logLevel, 50);
    const statsData = await clientLogger.getLogStats();
    setLogs(logsData);
    setStats(statsData);
  };

  const handleDownloadLogs = async () => {
    try {
      const blob = await clientLogger.exportLogs();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `logs-${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: "Logs exported", description: "CSV file downloaded successfully" });
    } catch (error) {
      toast({ title: "Export failed", description: String(error), variant: "destructive" });
    }
  };

  const handleClearLogs = async () => {
    if (!confirm("Are you sure? This will delete all logs.")) return;
    try {
      await clientLogger.clearLogs();
      await refreshLogs();
      toast({ title: "Logs cleared", description: "All logs have been deleted" });
    } catch (error) {
      toast({ title: "Clear failed", description: String(error), variant: "destructive" });
    }
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-50 p-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
        title="Toggle debug logs"
      >
        {isOpen ? <EyeOff size={20} /> : <Eye size={20} />}
      </button>

      {/* Debug Panel */}
      {isOpen && (
        <Card className="fixed bottom-16 right-4 z-50 w-96 max-h-96 shadow-2xl">
          <CardHeader className="border-b flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Debug Logs</CardTitle>
            <button
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </CardHeader>
          <CardContent className="space-y-2 p-2 max-h-80 overflow-y-auto">
            {/* Stats */}
            {stats && (
              <div className="text-xs text-muted-foreground mb-2 p-2 bg-muted rounded">
                <div>Total Logs: {stats.totalLogs}</div>
                <div>Errors: {stats.byLevel.ERROR} | Warnings: {stats.byLevel.WARN} | Info: {stats.byLevel.INFO}</div>
              </div>
            )}

            {/* Filter */}
            <div className="flex gap-1 flex-wrap mb-2">
              {["all", "ERROR", "WARN", "INFO", "API"].map((level) => (
                <button
                  key={level}
                  onClick={() => setFilter(level)}
                  className={`text-xs px-2 py-1 rounded ${
                    filter === level
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>

            {/* Logs */}
            <div className="text-xs space-y-1 font-mono">
              {logs.length === 0 ? (
                <div className="text-muted-foreground">No logs</div>
              ) : (
                logs.map((log, idx) => (
                  <div
                    key={idx}
                    className={`p-1 rounded border-l-2 ${
                      log.level === "ERROR"
                        ? "border-destructive bg-destructive/10"
                        : log.level === "WARN"
                          ? "border-yellow-500 bg-yellow-500/10"
                          : log.level === "API"
                            ? "border-blue-500 bg-blue-500/10"
                            : "border-muted bg-muted/30"
                    }`}
                  >
                    <div className="font-semibold">{log.level}: {log.message}</div>
                    <div className="text-muted-foreground">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </div>
                    {log.stackTrace && (
                      <div className="text-destructive text-xs mt-1 whitespace-pre-wrap">
                        {log.stackTrace.split("\n").slice(0, 2).join("\n")}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t">
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadLogs}
                className="flex items-center gap-1"
              >
                <Download size={14} /> Export
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleClearLogs}
                className="flex items-center gap-1"
              >
                <Trash2 size={14} /> Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
