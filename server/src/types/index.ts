export type FieldType =
  | "text"
  | "long_text"
  | "number"
  | "decimal"
  | "boolean"
  | "date"
  | "datetime"
  | "email"
  | "phone"
  | "url"
  | "single_select"
  | "multi_select"
  | "file"
  | "image"
  | "reference"
  | "calculated";

export interface Hierarchy {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface Level {
  id: string;
  hierarchy_id: string;
  name: string;
  code: string;
  description?: string;
  icon?: string;
  color?: string;
  depth_order: number;
  allowed_parent_level_ids: string[]; // JSON parsed
  display_settings?: Record<string, any>;
  member_count?: number;
  created_at: string;
  updated_at: string;
}

export interface FieldDefinition {
  id: string;
  level_id: string;
  name: string;
  key: string;
  field_type: FieldType;
  is_required: boolean;
  default_value?: string;
  is_visible_default: boolean;
  options?: string[]; // JSON parsed array of strings for selects
  validation_rules?: Record<string, any>;
  calculation_formula?: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  hierarchy_id: string;
  level_id: string;
  parent_id: string | null;
  name: string;
  path: string; // e.g. /root_id/child_id/grandchild_id/
  depth: number;
  custom_data: Record<string, any>; // JSON parsed dynamic fields
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
  level_name?: string;
  level_code?: string;
  level_color?: string;
  parent_name?: string;
  children_count?: number;
}

export type UserStatus = "active" | "invited" | "disabled" | "locked";

export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role_id: string;
  role_name?: string;
  is_active: boolean;
  status: UserStatus;
  email_verified: boolean;
  failed_login_attempts: number;
  locked_until?: string | null;
  recent_verified_at?: string | null;
  two_factor_enabled: boolean;
  last_login_at?: string | null;
  last_login_ip?: string | null;
  created_at: string;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  is_system: boolean;
  permissions?: string[];
}

export interface Permission {
  id: string;
  code: string;
  name: string;
  description?: string;
}

export interface UserScope {
  id: string;
  user_id: string;
  hierarchy_id: string;
  member_id: string | null; // null means global access to hierarchy
  member_name?: string;
  access_level: "admin" | "manager" | "editor" | "viewer";
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  user_name: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "MOVE" | "SCHEMA_ADD" | "SCHEMA_UPDATE" | "SCHEMA_DELETE" | "IMPORT" | "SECURITY" | "AUTH";
  entity_type: "member" | "level" | "field" | "user" | "role" | "hierarchy" | "auth" | "invitation" | "guest_link";
  entity_id: string;
  hierarchy_id?: string;
  level_id?: string;
  member_id?: string;
  previous_state?: Record<string, any> | null;
  new_state?: Record<string, any> | null;
  ip_address?: string;
  created_at: string;
}

export interface AuthContextUser {
  id: string;
  username: string;
  email: string;
  full_name: string;
  status: UserStatus;
  email_verified: boolean;
  recent_verified_at?: string | null;
  role: {
    id: string;
    name: string;
    permissions: string[];
  };
  scopes: UserScope[];
}

export interface OTPRecord {
  id: string;
  email: string;
  code_hash: string;
  purpose: "bootstrap" | "login" | "reset_password" | "step_up" | "verify_email";
  metadata?: Record<string, any>;
  attempts: number;
  max_attempts: number;
  expires_at: string;
  used_at?: string | null;
  created_at: string;
}

export interface InvitationRecord {
  id: string;
  email: string;
  token_hash: string;
  role_id: string;
  role_name?: string;
  invited_by_user_id: string;
  invited_by_name?: string;
  scopes: UserScope[];
  status: "pending" | "accepted" | "expired" | "revoked";
  expires_at: string;
  accepted_at?: string | null;
  created_at: string;
}

export interface GuestLink {
  id: string;
  token_hash: string;
  name: string;
  hierarchy_id: string;
  hierarchy_name?: string;
  member_id: string | null;
  member_name?: string;
  password_hash?: string | null;
  access_level: "viewer" | "editor";
  expires_at?: string | null;
  is_revoked: boolean;
  access_count: number;
  last_accessed_at?: string | null;
  created_by_user_id: string;
  created_at: string;
}
