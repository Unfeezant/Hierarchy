import { Database } from "better-sqlite3";

export function initSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hierarchies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS levels (
      id TEXT PRIMARY KEY,
      hierarchy_id TEXT NOT NULL REFERENCES hierarchies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      color TEXT,
      depth_order INTEGER NOT NULL,
      allowed_parent_level_ids TEXT NOT NULL DEFAULT "[]",
      display_settings TEXT DEFAULT "{}",
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS field_definitions (
      id TEXT PRIMARY KEY,
      level_id TEXT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key TEXT NOT NULL,
      field_type TEXT NOT NULL,
      is_required INTEGER NOT NULL DEFAULT 0,
      default_value TEXT,
      is_visible_default INTEGER NOT NULL DEFAULT 1,
      options TEXT DEFAULT "[]",
      validation_rules TEXT DEFAULT "{}",
      calculation_formula TEXT,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      hierarchy_id TEXT NOT NULL REFERENCES hierarchies(id) ON DELETE CASCADE,
      level_id TEXT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES members(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      depth INTEGER NOT NULL DEFAULT 0,
      custom_data TEXT NOT NULL DEFAULT "{}",
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      is_system INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, permission_id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role_id TEXT NOT NULL REFERENCES roles(id),
      is_active INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      email_verified INTEGER NOT NULL DEFAULT 0,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      recent_verified_at TEXT,
      two_factor_enabled INTEGER NOT NULL DEFAULT 0,
      last_login_at TEXT,
      last_login_ip TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_scopes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      hierarchy_id TEXT NOT NULL REFERENCES hierarchies(id) ON DELETE CASCADE,
      member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
      access_level TEXT NOT NULL DEFAULT "manager"
    );

    CREATE TABLE IF NOT EXISTS otps (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      purpose TEXT NOT NULL,
      metadata TEXT DEFAULT "{}",
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      role_id TEXT NOT NULL REFERENCES roles(id),
      invited_by_user_id TEXT NOT NULL REFERENCES users(id),
      scopes TEXT DEFAULT "[]",
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS guest_links (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      hierarchy_id TEXT NOT NULL REFERENCES hierarchies(id) ON DELETE CASCADE,
      member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
      password_hash TEXT,
      access_level TEXT NOT NULL DEFAULT 'viewer',
      expires_at TEXT,
      is_revoked INTEGER NOT NULL DEFAULT 0,
      access_count INTEGER NOT NULL DEFAULT 0,
      last_accessed_at TEXT,
      created_by_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      hierarchy_id TEXT,
      level_id TEXT,
      member_id TEXT,
      previous_state TEXT,
      new_state TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL
    );

    -- Indexes for high performance
    CREATE INDEX IF NOT EXISTS idx_members_hierarchy_level ON members(hierarchy_id, level_id);
    CREATE INDEX IF NOT EXISTS idx_members_parent ON members(parent_id);
    CREATE INDEX IF NOT EXISTS idx_members_path ON members(path);
    CREATE INDEX IF NOT EXISTS idx_members_name ON members(name);
    CREATE INDEX IF NOT EXISTS idx_levels_hierarchy_depth ON levels(hierarchy_id, depth_order);
    CREATE INDEX IF NOT EXISTS idx_field_definitions_level ON field_definitions(level_id, order_index);
    CREATE INDEX IF NOT EXISTS idx_audit_hierarchy_date ON audit_logs(hierarchy_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_user_scopes_user ON user_scopes(user_id);
    CREATE INDEX IF NOT EXISTS idx_otps_email_purpose ON otps(email, purpose);
    CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
    CREATE INDEX IF NOT EXISTS idx_guest_links_token ON guest_links(token_hash);
  `);

  // Column migrations for existing databases
  const userColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  const colNames = new Set(userColumns.map(c => c.name));

  const safeAddCol = (col: string, def: string) => {
    if (!colNames.has(col)) {
      try {
        db.exec(`ALTER TABLE users ADD COLUMN ${col} ${def}`);
      } catch (err) {
        // Ignore duplicate column errors
      }
    }
  };

  safeAddCol("status", "TEXT NOT NULL DEFAULT 'active'");
  safeAddCol("email_verified", "INTEGER NOT NULL DEFAULT 0");
  safeAddCol("failed_login_attempts", "INTEGER NOT NULL DEFAULT 0");
  safeAddCol("locked_until", "TEXT");
  safeAddCol("recent_verified_at", "TEXT");
  safeAddCol("two_factor_enabled", "INTEGER NOT NULL DEFAULT 0");
  safeAddCol("last_login_at", "TEXT");
  safeAddCol("last_login_ip", "TEXT");
}
