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
  allowed_parent_level_ids: string[];
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
  options?: string[];
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
  path: string;
  depth: number;
  custom_data: Record<string, any>;
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

export interface UserScope {
  id: string;
  user_id: string;
  hierarchy_id: string;
  member_id: string | null;
  member_name?: string;
  access_level: "admin" | "manager" | "editor" | "viewer";
}

export type UserStatus = "active" | "invited" | "disabled" | "locked";

export interface AuthUser {
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

export interface ManagedUser {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role_id: string;
  role_name: string;
  is_active: boolean;
  status: UserStatus;
  email_verified: boolean;
  failed_login_attempts: number;
  locked_until?: string | null;
  last_login_at?: string | null;
  created_at: string;
  scopes: UserScope[];
}

export interface GuestLink {
  id: string;
  name: string;
  hierarchy_id: string;
  hierarchy_name?: string;
  member_id: string | null;
  member_name?: string;
  access_level: "viewer" | "editor";
  expires_at?: string | null;
  is_revoked: number | boolean;
  access_count: number;
  last_accessed_at?: string | null;
  creator_name?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  hierarchy_id?: string;
  level_id?: string;
  member_id?: string;
  previous_state?: Record<string, any> | null;
  new_state?: Record<string, any> | null;
  ip_address?: string;
  created_at: string;
}

export interface PyramidTierSummary {
  level: Level;
  member_count: number;
  percentage: number;
}
