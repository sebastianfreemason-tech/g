export interface Profile {
  id: string;
  username: string;
  zos_id: string;
  balance: number;
  is_banned: boolean;
  created_at: string;
}

export interface AdminPlayer {
  zos_id: string;
  username: string;
  balance: number;
  is_banned: boolean;
  created_at: string;
}

export type AdminActionType =
  | "add_balance"
  | "remove_balance"
  | "ban"
  | "unban"
  | "withdrawal_completed"
  | "withdrawal_rejected";

export interface AdminAccount {
  id: string;
  username: string;
  zos_id: string;
  balance: number;
  is_banned: boolean;
  is_admin: boolean;
  created_at: string;
}

export interface AdminAction {
  action: AdminActionType;
  amount: number | null;
  note: string | null;
  created_at: string;
  admin_username: string;
  target_username: string;
  target_zos_id: string;
}

export interface Transaction {
  id: string;
  sender_id: string | null;
  receiver_id: string;
  amount: number;
  type: "transfer" | "deposit" | "adjustment";
  note: string | null;
  created_at: string;
  sender_username: string | null;
  receiver_username: string | null;
  sender_zos_id: string | null;
  receiver_zos_id: string | null;
}

export interface Deposit {
  id: string;
  user_id: string;
  amount: number;
  status: "pending" | "confirmed" | "failed";
  qpay_transaction_id: string | null;
  created_at: string;
  confirmed_at: string | null;
}
