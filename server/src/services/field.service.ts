import { Database } from "better-sqlite3";
import crypto from "crypto";
import { FieldDefinition, FieldType } from "../types/index.js";
import { AuditService } from "./audit.service.js";

export class FieldService {
  private auditService: AuditService;

  constructor(private db: Database) {
    this.auditService = new AuditService(db);
  }

  getFieldsByLevel(levelId: string): FieldDefinition[] {
    const rows = this.db.prepare(`
      SELECT * FROM field_definitions
      WHERE level_id = ?
      ORDER BY order_index ASC, created_at ASC
    `).all(levelId) as any[];

    return rows.map(this.mapRowToField);
  }

  getField(fieldId: string): FieldDefinition | null {
    const row = this.db.prepare("SELECT * FROM field_definitions WHERE id = ?").get(fieldId) as any;
    return row ? this.mapRowToField(row) : null;
  }

  createField(
    levelId: string,
    data: {
      name: string;
      key?: string;
      field_type: FieldType;
      is_required?: boolean;
      default_value?: string;
      is_visible_default?: boolean;
      options?: string[];
      validation_rules?: Record<string, any>;
      calculation_formula?: string;
      order_index?: number;
    },
    actor: { id: string; name: string }
  ): FieldDefinition {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const key = data.key || data.name.toLowerCase().replace(/[^a-z0-9_]/g, "_");

    // Check duplicate key on the same level
    const existing = this.db.prepare("SELECT id FROM field_definitions WHERE level_id = ? AND key = ?").get(levelId, key);
    if (existing) {
      throw new Error(`A field with key "${key}" already exists for this level.`);
    }

    // Determine order index
    let orderIndex = data.order_index;
    if (orderIndex === undefined) {
      const maxOrder = this.db.prepare("SELECT MAX(order_index) as max_idx FROM field_definitions WHERE level_id = ?").get(levelId) as any;
      orderIndex = (maxOrder?.max_idx ?? -1) + 1;
    }

    const stmt = this.db.prepare(`
      INSERT INTO field_definitions (
        id, level_id, name, key, field_type, is_required,
        default_value, is_visible_default, options, validation_rules,
        calculation_formula, order_index, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      levelId,
      data.name,
      key,
      data.field_type,
      data.is_required ? 1 : 0,
      data.default_value ?? null,
      data.is_visible_default !== false ? 1 : 0,
      JSON.stringify(data.options || []),
      JSON.stringify(data.validation_rules || {}),
      data.calculation_formula ?? null,
      orderIndex,
      now,
      now
    );

    const created = this.getField(id)!;

    this.auditService.log({
      userId: actor.id,
      userName: actor.name,
      action: "SCHEMA_ADD",
      entityType: "field",
      entityId: id,
      levelId,
      newState: created as any
    });

    return created;
  }

  updateField(
    fieldId: string,
    data: Partial<FieldDefinition>,
    actor: { id: string; name: string }
  ): FieldDefinition {
    const prev = this.getField(fieldId);
    if (!prev) {
      throw new Error("Field definition not found");
    }

    const now = new Date().toISOString();
    const name = data.name ?? prev.name;
    const isRequired = data.is_required !== undefined ? (data.is_required ? 1 : 0) : (prev.is_required ? 1 : 0);
    const defaultValue = data.default_value !== undefined ? data.default_value : prev.default_value;
    const isVisible = data.is_visible_default !== undefined ? (data.is_visible_default ? 1 : 0) : (prev.is_visible_default ? 1 : 0);
    const options = data.options ? JSON.stringify(data.options) : JSON.stringify(prev.options || []);
    const rules = data.validation_rules ? JSON.stringify(data.validation_rules) : JSON.stringify(prev.validation_rules || {});
    const formula = data.calculation_formula !== undefined ? data.calculation_formula : prev.calculation_formula;
    const orderIndex = data.order_index ?? prev.order_index;

    this.db.prepare(`
      UPDATE field_definitions
      SET name = ?, is_required = ?, default_value = ?, is_visible_default = ?,
          options = ?, validation_rules = ?, calculation_formula = ?,
          order_index = ?, updated_at = ?
      WHERE id = ?
    `).run(name, isRequired, defaultValue, isVisible, options, rules, formula, orderIndex, now, fieldId);

    const updated = this.getField(fieldId)!;

    this.auditService.log({
      userId: actor.id,
      userName: actor.name,
      action: "SCHEMA_UPDATE",
      entityType: "field",
      entityId: fieldId,
      levelId: prev.level_id,
      previousState: prev as any,
      newState: updated as any
    });

    return updated;
  }

  deleteField(fieldId: string, actor: { id: string; name: string }): void {
    const prev = this.getField(fieldId);
    if (!prev) {
      throw new Error("Field definition not found");
    }

    this.db.prepare("DELETE FROM field_definitions WHERE id = ?").run(fieldId);

    this.auditService.log({
      userId: actor.id,
      userName: actor.name,
      action: "SCHEMA_DELETE",
      entityType: "field",
      entityId: fieldId,
      levelId: prev.level_id,
      previousState: prev as any
    });
  }

  validateAndTransformCustomData(
    levelId: string,
    inputData: Record<string, any> = {},
    isUpdate = false
  ): { valid: boolean; errors: string[]; data: Record<string, any> } {
    const fields = this.getFieldsByLevel(levelId);
    const errors: string[] = [];
    const transformed: Record<string, any> = { ...inputData };

    for (const field of fields) {
      let val = transformed[field.key];

      // Handle default value on insert
      if (!isUpdate && (val === undefined || val === null || val === "") && field.default_value !== undefined && field.default_value !== null && field.default_value !== "") {
        val = field.default_value;
        transformed[field.key] = val;
      }

      // Check required
      if (field.is_required) {
        if (val === undefined || val === null || val === "") {
          errors.push(`Field "${field.name}" is required.`);
          continue;
        }
      }

      // If empty and not required, skip type validation
      if (val === undefined || val === null || val === "") {
        continue;
      }

      // Type-specific validations and transformations
      switch (field.field_type) {
        case "number": {
          const num = Number(val);
          if (isNaN(num)) {
            errors.push(`Field "${field.name}" must be a valid number.`);
          } else {
            transformed[field.key] = Math.round(num);
          }
          break;
        }
        case "decimal": {
          const num = Number(val);
          if (isNaN(num)) {
            errors.push(`Field "${field.name}" must be a valid decimal number.`);
          } else {
            transformed[field.key] = num;
          }
          break;
        }
        case "boolean": {
          if (typeof val === "boolean") {
            transformed[field.key] = val;
          } else if (val === "true" || val === 1 || val === "1") {
            transformed[field.key] = true;
          } else if (val === "false" || val === 0 || val === "0") {
            transformed[field.key] = false;
          } else {
            errors.push(`Field "${field.name}" must be a boolean.`);
          }
          break;
        }
        case "email": {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (typeof val !== "string" || !emailRegex.test(val)) {
            errors.push(`Field "${field.name}" must be a valid email address.`);
          }
          break;
        }
        case "single_select": {
          if (field.options && field.options.length > 0) {
            if (!field.options.includes(String(val))) {
              errors.push(`Field "${field.name}" must be one of: ${field.options.join(", ")}`);
            }
          }
          break;
        }
        case "multi_select": {
          const arr = Array.isArray(val) ? val : [val];
          if (field.options && field.options.length > 0) {
            for (const item of arr) {
              if (!field.options.includes(String(item))) {
                errors.push(`Item "${item}" in field "${field.name}" is not a valid option.`);
              }
            }
          }
          transformed[field.key] = arr;
          break;
        }
        case "date": {
          const d = new Date(val);
          if (isNaN(d.getTime())) {
            errors.push(`Field "${field.name}" must be a valid date.`);
          }
          break;
        }
        case "datetime": {
          const d = new Date(val);
          if (isNaN(d.getTime())) {
            errors.push(`Field "${field.name}" must be a valid date-time.`);
          }
          break;
        }
        case "calculated": {
          // Will calculate below
          break;
        }
        default:
          break;
      }
    }

    // Process calculated fields
    for (const field of fields) {
      if (field.field_type === "calculated" && field.calculation_formula) {
        try {
          let formula = field.calculation_formula;
          // Substitute {field_key} with values from transformed
          for (const otherField of fields) {
            const token = `{${otherField.key}}`;
            if (formula.includes(token)) {
              const v = transformed[otherField.key] ?? 0;
              formula = formula.split(token).join(String(Number(v) || 0));
            }
          }
          // Simple arithmetic evaluation safely using Function constructor for numbers
          if (/^[0-9+\-*/().\s]+$/.test(formula)) {
            // eslint-disable-next-line no-new-func
            const calc = Function(`"use strict"; return (${formula})`)();
            transformed[field.key] = typeof calc === "number" ? Math.round(calc * 100) / 100 : calc;
          }
        } catch {
          // ignore calculation error
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      data: transformed
    };
  }

  private mapRowToField(row: any): FieldDefinition {
    return {
      ...row,
      is_required: Boolean(row.is_required),
      is_visible_default: Boolean(row.is_visible_default),
      options: row.options ? JSON.parse(row.options) : [],
      validation_rules: row.validation_rules ? JSON.parse(row.validation_rules) : {},
      calculation_formula: row.calculation_formula || undefined
    };
  }
}

