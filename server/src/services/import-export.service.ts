import { Database } from "better-sqlite3";
import Papa from "papaparse";
import { MemberService } from "./member.service.js";
import { FieldService } from "./field.service.js";
import { AuditService } from "./audit.service.js";

export interface ImportPreviewResult {
  total: number;
  validCount: number;
  errorCount: number;
  errors: Array<{ row: number; field: string; message: string; recordName: string }>;
  validPreview: Array<{ name: string; parent_name?: string; custom_data: Record<string, any> }>;
}

export class ImportExportService {
  private memberService: MemberService;
  private fieldService: FieldService;
  private auditService: AuditService;

  constructor(private db: Database) {
    this.memberService = new MemberService(db);
    this.fieldService = new FieldService(db);
    this.auditService = new AuditService(db);
  }

  previewImport(
    hierarchyId: string,
    levelId: string,
    rows: Array<Record<string, any>>
  ): ImportPreviewResult {
    const fields = this.fieldService.getFieldsByLevel(levelId);
    const errors: Array<{ row: number; field: string; message: string; recordName: string }> = [];
    const validPreview: Array<{ name: string; parent_name?: string; custom_data: Record<string, any> }> = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 1;
      const name = (row.name || row.Name || row["Member Name"] || "").trim();

      if (!name) {
        errors.push({
          row: rowNum,
          field: "name",
          message: "Record name is required",
          recordName: "Unnamed"
        });
        return;
      }

      // Extract custom fields
      const customData: Record<string, any> = {};
      for (const f of fields) {
        // Look for match by key or by field name
        const rawVal = row[f.key] !== undefined ? row[f.key] : row[f.name];
        if (rawVal !== undefined) {
          customData[f.key] = rawVal;
        }
      }

      const validation = this.fieldService.validateAndTransformCustomData(levelId, customData, false);
      if (!validation.valid) {
        for (const err of validation.errors) {
          errors.push({
            row: rowNum,
            field: "custom_data",
            message: err,
            recordName: name
          });
        }
      } else {
        validPreview.push({
          name,
          parent_name: row.parent_name || row.Parent || undefined,
          custom_data: validation.data
        });
      }
    });

    return {
      total: rows.length,
      validCount: validPreview.length,
      errorCount: errors.length,
      errors,
      validPreview: validPreview.slice(0, 20) // Top 20 for preview
    };
  }

  commitImport(
    hierarchyId: string,
    levelId: string,
    rows: Array<{ name: string; parent_id?: string | null; custom_data?: Record<string, any> }>,
    defaultParentId: string | null,
    actor: { id: string; name: string }
  ): { importedCount: number } {
    const tx = this.db.transaction(() => {
      let count = 0;
      for (const item of rows) {
        const parentId = item.parent_id !== undefined ? item.parent_id : defaultParentId;
        this.memberService.createRecord(
          {
            hierarchy_id: hierarchyId,
            level_id: levelId,
            parent_id: parentId,
            name: item.name,
            custom_data: item.custom_data
          },
          actor
        );
        count++;
      }
      return count;
    });

    const importedCount = tx();

    this.auditService.log({
      userId: actor.id,
      userName: actor.name,
      action: "IMPORT",
      entityType: "member",
      entityId: levelId,
      hierarchyId,
      levelId,
      newState: { importedCount }
    });

    return { importedCount };
  }

  exportLevel(
    levelId: string,
    format: "csv" | "json",
    options: { hierarchyId?: string; scopeMemberId?: string | null } = {}
  ): { contentType: string; data: string; filename: string } {
    const level = this.db.prepare("SELECT * FROM levels WHERE id = ?").get(levelId) as any;
    if (!level) throw new Error("Level not found");

    const fields = this.fieldService.getFieldsByLevel(levelId);
    const { items } = this.memberService.getRecords(levelId, {
      hierarchyId: options.hierarchyId,
      scopeMemberId: options.scopeMemberId,
      limit: 100000 // All records for export
    });

    // Flatten members for export
    const flatData = items.map(m => {
      const row: Record<string, any> = {
        "ID": m.id,
        "Name": m.name,
        "Parent": m.parent_name || "",
        "Level": m.level_name || level.name,
        "Created At": m.created_at,
        "Updated At": m.updated_at
      };

      // Add dynamic fields
      for (const f of fields) {
        const v = m.custom_data[f.key];
        row[f.name] = v !== undefined && v !== null ? (Array.isArray(v) ? v.join(", ") : v) : "";
      }

      return row;
    });

    const filename = `${level.name.toLowerCase().replace(/[^a-z0-9_]/g, "_")}_export_${Date.now()}`;

    if (format === "json") {
      return {
        contentType: "application/json",
        data: JSON.stringify(flatData, null, 2),
        filename: `${filename}.json`
      };
    } else {
      const csv = Papa.unparse(flatData);
      return {
        contentType: "text/csv",
        data: csv,
        filename: `${filename}.csv`
      };
    }
  }
}
