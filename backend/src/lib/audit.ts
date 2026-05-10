import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";

export async function createAuditLog(params: {
  module: string;
  action: string;
  recordId?: number;
  userId: number;
  userName: string;
  description: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
}) {
  try {
    await db.insert(auditLogsTable).values({
      module: params.module,
      action: params.action,
      recordId: params.recordId,
      userId: params.userId,
      userName: params.userName,
      description: params.description,
      oldValues: params.oldValues || null,
      newValues: params.newValues || null,
      ipAddress: params.ipAddress || null,
    });
  } catch {
    // Audit log failures should not break main operations
  }
}

export function paginate(page: number, limit: number) {
  return {
    offset: (page - 1) * limit,
    limit,
  };
}
