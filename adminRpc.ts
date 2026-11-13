import type { AdminAccount, AdminAction, AdminActionType, AdminPlayer } from "@/lib/types";

export const ADMIN_GENERIC_ERROR = "Something went wrong. Please try again.";

const ADMIN_ACTION_TYPES: AdminActionType[] = [
  "add_balance",
  "remove_balance",
  "ban",
  "unban",
  "withdrawal_completed",
  "withdrawal_rejected",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readRpcError(data: unknown): string | null {
  const record = asRecord(data);
  return record && typeof record.error === "string" ? record.error : null;
}

export function parsePlayer(data: unknown): AdminPlayer | null {
  const record = asRecord(data);
  if (
    !record ||
    typeof record.zos_id !== "string" ||
    typeof record.username !== "string" ||
    typeof record.is_banned !== "boolean"
  ) {
    return null;
  }
  return {
    zos_id: record.zos_id,
    username: record.username,
    balance: Number(record.balance),
    is_banned: record.is_banned,
    created_at: String(record.created_at),
  };
}

function isAdminActionType(value: unknown): value is AdminActionType {
  return typeof value === "string" && (ADMIN_ACTION_TYPES as string[]).includes(value);
}

export function parseAccounts(data: unknown): AdminAccount[] {
  if (!Array.isArray(data)) return [];
  const accounts: AdminAccount[] = [];
  for (const item of data) {
    const record = asRecord(item);
    if (
      !record ||
      typeof record.id !== "string" ||
      typeof record.username !== "string" ||
      typeof record.zos_id !== "string" ||
      typeof record.is_banned !== "boolean" ||
      typeof record.is_admin !== "boolean" ||
      typeof record.created_at !== "string"
    ) {
      continue;
    }
    accounts.push({
      id: record.id,
      username: record.username,
      zos_id: record.zos_id,
      balance: Number(record.balance),
      is_banned: record.is_banned,
      is_admin: record.is_admin,
      created_at: record.created_at,
    });
  }
  return accounts;
}

export function parseActions(data: unknown): AdminAction[] {
  if (!Array.isArray(data)) return [];
  const actions: AdminAction[] = [];
  for (const item of data) {
    const record = asRecord(item);
    if (
      !record ||
      !isAdminActionType(record.action) ||
      typeof record.created_at !== "string" ||
      typeof record.admin_username !== "string" ||
      typeof record.target_username !== "string" ||
      typeof record.target_zos_id !== "string"
    ) {
      continue;
    }
    actions.push({
      action: record.action,
      amount: record.amount == null ? null : Number(record.amount),
      note: typeof record.note === "string" ? record.note : null,
      created_at: record.created_at,
      admin_username: record.admin_username,
      target_username: record.target_username,
      target_zos_id: record.target_zos_id,
    });
  }
  return actions;
}
