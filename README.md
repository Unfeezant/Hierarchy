# PyramidHQ: Dynamic Hierarchical Pyramid Data System

A production-quality, schema-driven, and hierarchy-agnostic web application for defining, navigating, editing, and managing arbitrarily deep hierarchical pyramid data with strict role-based and branch-scoped authorization.

---

## 1. Key Architectural Principles

- **Schema-Driven & Generic**: No hardcoded tables for entities like schools, teachers, or students. The entire system operates on generic relational models: `hierarchies`, `levels`, `field_definitions`, `members`, and dynamic typed `custom_data`.
- **Arbitrary Depth & Branching**: The system supports arbitrary level depths and branching (multiple child types permitted at any level).
- **Canonical Persistent Backend Dataset**: The SQLite WAL database is the single source of truth. The application remains fully functional headless without the UI.
- **Strict Backend-Enforced Scoped RBAC**: Token-based authentication and ancestor-path validation prevent IDOR, unauthorized branch traversal, and unauthorized writes.
- **Runtime Schema Extensibility**: Administrators can add, edit, or delete columns at any level at runtime. Changes immediately reflect in table views, forms, and validation without server redeployments or restarts.
- **Multi-View Explorer**:
  - **Tree Mode**: Interactive branch tree with lazy loading of children, search, and action controls (`+ Child`, `Edit`, `Move`, `Delete`).
  - **Pyramid Mode**: Visual step-tier representation displaying depth tiers and record densities.
  - **Level-Wide Table Mode**: Configurable table displaying all members of a chosen level across all branches with multi-sorting, filtering, pagination, inline `+ Add Column`, and CSV/JSON export.
  - **Member Detail View**: Detailed inspection drawer displaying all custom attributes, direct parent, children grouped by level, and audit history.
- **Append-Only Audit Trail**: Every creation, modification, reparenting/move, and schema change is recorded with actor credentials, timestamps, and before/after diffs.

---

## 2. Technology Stack

- **Backend**: Node.js, Express, TypeScript, SQLite (`better-sqlite3` with WAL mode & foreign keys), `zod`, `jsonwebtoken`, `bcryptjs`, `papaparse`.
- **Frontend**: Vite, React 18, TypeScript, Tailwind CSS, Lucide Icons.
- **Testing**: Vitest + Supertest with automated tests for hierarchy integrity, dynamic schemas, RBAC boundary enforcement, and performance benchmarks.

---

## 3. Quick Start & Setup

### Prerequisites
- Node.js 18+ (tested on Node 20 / 24)
- npm 9+

### Installation
From the project root:

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install

# Return to root and install root orchestrator
cd ..
npm install
```

### Seed Database
Seed the canonical database with the educational demonstration pyramid (Head -> Schools -> Principals -> Teachers -> Classes -> Students -> Subject Marks) and test user personas:

```bash
npm run seed
```

### Run Application
Run both backend (port 4000) and frontend (port 5173) concurrently:

```bash
npm run dev
```

Open your browser at:
`http://localhost:5173`

---

## 4. Pre-Configured Test Personas (Quick Role Switcher)

In the top right of the application header, use the **Quick Role Switcher** dropdown to test different authorization roles and branch scopes in real time:

| User | Role | Scope | Permitted Capabilities |
|---|---|---|---|
| `admin` | Super Admin | Global (All Hierarchies) | Complete administrative access to all records, schema, and users |
| `school_a_admin` | Manager | School A Branch | Can manage and add members under School A. Blocked from School B |
| `principal_a` | Manager | Principal Arthur Pendelton | Can manage teachers and classes under Principal A. Blocked from other branches |
| `teacher_a` | Editor | Teacher Alan Turing | Can edit records within Teacher A branch. Cannot modify schema |
| `school_b_admin` | Manager | School B Branch | Strictly isolated to School B. Direct API queries to School A return 403 Forbidden |
| `viewer` | Viewer | School A Branch | Read-only. Any attempt to create, edit, or delete records returns 403 Forbidden |

---

## 5. Canonical Backend Query API

All data operations are accessible via REST API:

### Hierarchies
- `GET /api/hierarchies` — List all hierarchies
- `GET /api/hierarchies/:id` — Get hierarchy details
- `POST /api/hierarchies` — Create hierarchy
- `GET /api/hierarchies/:id/pyramid` — Get pyramid tier summary

### Levels
- `GET /api/hierarchies/:hierarchyId/levels` — Get levels ordered by depth
- `POST /api/hierarchies/:hierarchyId/levels` — Create new level (supports `allowed_parent_level_ids`)
- `PUT /api/levels/:id` — Update level
- `DELETE /api/levels/:id` — Delete level (safeguarded against non-empty levels)
- `POST /api/hierarchies/:hierarchyId/levels/reorder` — Reorder level depth sequence

### Dynamic Fields / Schema
- `GET /api/levels/:levelId/fields` — List dynamic field definitions
- `POST /api/levels/:levelId/fields` — Add column dynamically (15+ types supported)
- `PUT /api/fields/:id` — Update column configuration
- `DELETE /api/fields/:id` — Delete dynamic column

### Members / Records (Data Access Layer)
- `GET /api/members/:id` — Get record by ID (enforces branch scope)
- `GET /api/members/:id/parent` — Get parent record
- `GET /api/members/:id/children` — Get direct children (lazy loading)
- `GET /api/members/:id/ancestors` — Get ancestor breadcrumb path
- `GET /api/members/:id/descendants` — Get subtree descendants
- `GET /api/levels/:levelId/records` — Level-wide view with sorting, filtering, and pagination
- `GET /api/search?q=...` — Global hierarchy search
- `POST /api/members` — Create record (validates dynamic fields, enforces scope)
- `PUT /api/members/:id` — Update record (validates fields, records audit diff)
- `POST /api/members/:id/move` — Move/re-parent record (atomic path rewrite, cycle prevention)
- `DELETE /api/members/:id` — Delete record and all descendants

### Audit & Import/Export
- `GET /api/audit-logs` — Query append-only audit trail
- `POST /api/levels/:levelId/import/preview` — Validate CSV before commit
- `POST /api/levels/:levelId/import/commit` — Commit validated records
- `GET /api/levels/:levelId/export?format=csv` — Export level records to CSV

---

## 6. Automated Testing

Run the Vitest test suite:

```bash
npm run test
```

The automated test suite covers:
1. `tests/hierarchy.test.ts`: Level creation, branching, arbitrary depth, cycle prevention on move, cascading delete.
2. `tests/schema.test.ts`: Dynamic field additions, required field enforcement, calculated formula evaluation.
3. `tests/rbac.test.ts`: Super admin access, scoped branch restrictions, IDOR prevention (403 Forbidden), viewer write lockout.
4. `tests/performance.test.ts`: Deep hierarchy insertion (depth 7), sub-15ms ancestor path queries, and bulk pagination.
