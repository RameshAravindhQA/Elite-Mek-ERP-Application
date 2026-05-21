/**
 * Lightweight client-side logger for production debugging
 * Logs to IndexedDB with automatic size management
 */

import { getBaseApiPath } from "./api-url";

const DB_NAME = "erp_logs_db";
const STORE_NAME = "logs";
const DB_VERSION = 1;
const MAX_LOG_SIZE_MB = 5; // Max 5MB of logs
const MAX_LOG_ENTRIES = 1000; // Max 1000 log entries
const LOG_LEVELS = {
  ERROR: "ERROR",
  WARN: "WARN",
  INFO: "INFO",
  DEBUG: "DEBUG",
  API: "API",
} as const;

export type LogLevel = keyof typeof LOG_LEVELS;

interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  data?: Record<string, any>;
  url?: string;
  userAgent?: string;
  stackTrace?: string;
}

class ClientLogger {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private isInitializing = false;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    if (this.isInitializing) {
      // Prevent multiple initialization attempts
      return;
    }

    this.isInitializing = true;
    this.initPromise = this._init();
    await this.initPromise;
  }

  private async _init(): Promise<void> {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      return new Promise((resolve, reject) => {
        request.onerror = () => {
          console.error("Failed to initialize logger DB");
          reject(request.error);
        };

        request.onsuccess = () => {
          this.db = request.result;
          resolve();
        };

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
          }
        };
      });
    } catch (error) {
      console.error("Logger initialization failed:", error);
      throw error;
    }
  }

  private async writeLog(entry: LogEntry): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    try {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      // Add new log entry
      const addRequest = store.add(entry);

      // Cleanup old logs if needed
      await new Promise<void>((resolve) => {
        addRequest.onsuccess = async () => {
          try {
            await this.cleanupOldLogs();
            resolve();
          } catch (error) {
            console.error("Cleanup failed:", error);
            resolve(); // Don't block on cleanup failure
          }
        };

        addRequest.onerror = () => {
          console.error("Failed to write log:", addRequest.error);
          resolve();
        };
      });
    } catch (error) {
      console.error("Failed to write log entry:", error);
    }
  }

  private async cleanupOldLogs(): Promise<void> {
    if (!this.db) return;

    try {
      const transaction = this.db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      return new Promise((resolve) => {
        const countRequest = store.count();

        countRequest.onsuccess = () => {
          const count = countRequest.result;

          // If too many entries, delete oldest
          if (count > MAX_LOG_ENTRIES) {
            const deleteRequest = store.openCursor();
            let deleted = 0;
            const toDelete = count - MAX_LOG_ENTRIES + 50; // Delete 50 extra for buffer

            deleteRequest.onsuccess = (event) => {
              const cursor = (event.target as IDBRequest).result;
              if (cursor && deleted < toDelete) {
                cursor.delete();
                deleted++;
                cursor.continue();
              } else {
                resolve();
              }
            };

            deleteRequest.onerror = () => {
              console.error("Cleanup deletion failed");
              resolve();
            };
          } else {
            resolve();
          }
        };

        countRequest.onerror = () => {
          console.error("Failed to count logs");
          resolve();
        };
      });
    } catch (error) {
      console.error("Cleanup error:", error);
    }
  }

  private formatStackTrace(error: Error | string): string {
    if (typeof error === "string") return error;
    if (error instanceof Error) {
      return error.stack || error.message;
    }
    return String(error);
  }

  log(level: LogLevel, message: string, data?: Record<string, any>, error?: Error): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      data,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      stackTrace: error ? this.formatStackTrace(error) : undefined,
    };

    this.writeLog(entry).catch(console.error);

    // Also log to console in development
    if (process.env.NODE_ENV !== "production") {
      const consoleMethod = level === "ERROR" ? "error" : level === "WARN" ? "warn" : "log";
      console[consoleMethod](`[${entry.timestamp}] ${level}: ${message}`, data);
    }
  }

  error(message: string, error?: Error | any, data?: Record<string, any>): void {
    this.log("ERROR", message, data, error instanceof Error ? error : new Error(String(error)));
  }

  warn(message: string, data?: Record<string, any>): void {
    this.log("WARN", message, data);
  }

  info(message: string, data?: Record<string, any>): void {
    this.log("INFO", message, data);
  }

  debug(message: string, data?: Record<string, any>): void {
    this.log("DEBUG", message, data);
  }

  api(method: string, url: string, status: number, data?: Record<string, any>): void {
    const message = `${method} ${url} - ${status}`;
    this.log("API", message, data);
  }

  // Activity logging for CRUD operations and user actions
  logActivity(action: "login" | "logout" | "create" | "update" | "delete" | "validation" | "error", module: string, details?: Record<string, any>): void {
    const message = `[${action.toUpperCase()}] ${module}`;
    this.log("INFO", message, { action, module, ...details });
    
    // Send to backend activity log
    this.sendActivityToBackend(action, module, details);
  }

  private sendActivityToBackend(action: string, module: string, details?: Record<string, any>): void {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;

    fetch(`${getBaseApiPath()}/activity-logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, module, details }),
    }).catch((err) => {
      // Silently fail - don't block main app functionality
      console.error("Failed to send activity log:", err);
    });
  }

  logFormValidation(formName: string, errors?: string[]): void {
    const message = `Form validation: ${formName}`;
    this.log("DEBUG", message, { formName, errors, timestamp: new Date().toISOString() });
  }

  logUserAuth(action: "login" | "logout", userId?: string, details?: Record<string, any>): void {
    const message = `User ${action}: ${userId || "unknown"}`;
    this.log("INFO", message, { action, userId, ...details });
  }

  async getLogs(level?: LogLevel, limit: number = 100): Promise<LogEntry[]> {
    if (!this.db) await this.init();

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        let logs = request.result as LogEntry[];

        // Filter by level if specified
        if (level) {
          logs = logs.filter((log) => log.level === level);
        }

        // Return newest first, limited
        resolve(logs.reverse().slice(0, limit));
      };

      request.onerror = () => {
        console.error("Failed to retrieve logs");
        resolve([]);
      };
    });
  }

  async exportLogs(): Promise<Blob> {
    if (!this.db) await this.init();

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const logs = request.result as LogEntry[];
        const csvContent = this.logsToCSV(logs);
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        resolve(blob);
      };

      request.onerror = () => {
        console.error("Failed to export logs");
        resolve(new Blob([], { type: "text/csv" }));
      };
    });
  }

  private logsToCSV(logs: LogEntry[]): string {
    const headers = ["Timestamp", "Level", "Message", "URL", "Data", "Stack Trace"];
    const rows = logs.map((log) => [
      new Date(log.timestamp).toISOString(),
      log.level,
      log.message,
      log.url || "",
      JSON.stringify(log.data || {}),
      log.stackTrace || "",
    ]);

    const csvRows = [
      headers.map((h) => `"${h}"`).join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ];

    return csvRows.join("\n");
  }

  async clearLogs(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log("Logs cleared successfully");
        resolve();
      };

      request.onerror = () => {
        console.error("Failed to clear logs");
        resolve();
      };
    });
  }

  async getLogStats(): Promise<{
    totalLogs: number;
    byLevel: Record<LogLevel, number>;
    oldestLog?: number;
    newestLog?: number;
  }> {
    if (!this.db) await this.init();

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const logs = request.result as LogEntry[];
        const stats = {
          totalLogs: logs.length,
          byLevel: {
            ERROR: 0,
            WARN: 0,
            INFO: 0,
            DEBUG: 0,
            API: 0,
          } as Record<LogLevel, number>,
          oldestLog: logs.length > 0 ? logs[0].timestamp : undefined,
          newestLog: logs.length > 0 ? logs[logs.length - 1].timestamp : undefined,
        };

        logs.forEach((log) => {
          stats.byLevel[log.level]++;
        });

        resolve(stats);
      };

      request.onerror = () => {
        console.error("Failed to get log stats");
        resolve({
          totalLogs: 0,
          byLevel: { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, API: 0 },
        });
      };
    });
  }
}

// Singleton instance
const clientLogger = new ClientLogger();

// Initialize logger when app loads
if (typeof window !== "undefined") {
  clientLogger.init().catch(console.error);
}

export default clientLogger;
