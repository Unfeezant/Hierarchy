import crypto from "crypto";
import { Database } from "better-sqlite3";
import { MemberService } from "../member.service.js";
import { FieldService } from "../field.service.js";
import { AuditService } from "../audit.service.js";
import { AiProviderService } from "./ai-provider.service.js";
import { FileExtractorService } from "./file-extractor.service.js";
import {
  AiSession,
  AiMessage,
  AiSessionAttachment,
  AiFieldConflict
} from "../../types/ai.types.js";

export class AiSessionService {
  private static sessions = new Map<string, AiSession>();
  private memberService: MemberService;
  private fieldService: FieldService;
  private auditService: AuditService;

  constructor(private db: Database) {
    this.memberService = new MemberService(db);
    this.fieldService = new FieldService(db);
    this.auditService = new AuditService(db);
  }

  /**
   * Start a new conversational session.
   */
  public async createSession(params: {
    userId: string;
    hierarchyId: string;
    parentId: string | null;
    targetLevelId: string;
    mode: "create" | "edit" | "lookup";
    targetMemberId?: string;
  }): Promise<AiSession> {
    const sessionId = `ai_sess_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const now = new Date().toISOString();

    const level = this.db.prepare("SELECT * FROM levels WHERE id = ?").get(params.targetLevelId) as any;
    if (!level) {
      throw new Error(`Target level with ID ${params.targetLevelId} not found`);
    }

    const fields = this.fieldService.getFieldsByLevel(params.targetLevelId);
    let initialExtracted: Record<string, any> = {};

    if (params.mode === "edit" && params.targetMemberId) {
      const existing = this.memberService.getRecord(params.targetMemberId);
      if (existing) {
        initialExtracted = {
          name: existing.name,
          ...existing.custom_data
        };
      }
    }

    // Determine missing required fields
    const missingRequired: string[] = [];
    for (const f of fields) {
      if (f.is_required) {
        const val = initialExtracted[f.key];
        if (val === undefined || val === null || val === "") {
          missingRequired.push(f.name);
        }
      }
    }
    // Also check name if there is no explicit field with key 'name'
    if (params.mode === "create" && !fields.some(f => f.key === "name") && !initialExtracted.name) {
      missingRequired.push(`${level.name} Name`);
    }

    const parent = params.parentId ? this.memberService.getRecord(params.parentId) : null;
    const parentDesc = parent ? `under **${parent.name}** (${parent.level_name || "Parent"})` : "at root level";

    const welcomeMsg: AiMessage = {
      role: "assistant",
      content: params.mode === "lookup"
        ? `Hello! Ask me to find any point, team, department, or member across the hierarchy (e.g. *"Find Sarah Khan"*, *"Where is Web Development?"*), and I will locate it and provide all its details for you.`
        : params.mode === "create"
          ? `Hello! I'm here to help you add a new **${level.name}** record ${parentDesc}.\n\nYou can describe the record in natural language, upload documents (PDF, Excel, CSV, text), or both.\n\n${missingRequired.length > 0 ? `To get started, please provide details such as:\n${missingRequired.map(m => `• **${m}**`).join("\n")}` : `What details would you like to provide?`}`
          : `Hello! I'm ready to help you edit **${initialExtracted.name || "this record"}** (${level.name}). Tell me what fields you would like to update or attach an updated document.`,
      timestamp: now
    };

    const session: AiSession = {
      id: sessionId,
      userId: params.userId,
      hierarchyId: params.hierarchyId,
      targetLevelId: params.targetLevelId,
      parentId: params.parentId,
      mode: params.mode,
      targetMemberId: params.targetMemberId,
      messages: [welcomeMsg],
      attachments: [],
      currentExtracted: initialExtracted,
      missingRequired,
      conflicts: [],
      isReadyForConfirmation: missingRequired.length === 0,
      createdAt: now,
      updatedAt: now
    };

    AiSessionService.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Update active session target level, parent, or mode dynamically.
   */
  public updateSessionTarget(
    sessionId: string,
    updates: {
      targetLevelId?: string;
      parentId?: string | null;
      mode?: "create" | "edit" | "lookup";
      targetMemberId?: string;
    }
  ): AiSession {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (updates.targetLevelId && updates.targetLevelId !== session.targetLevelId) {
      session.targetLevelId = updates.targetLevelId;
    }
    if (updates.parentId !== undefined) {
      session.parentId = updates.parentId;
    }
    if (updates.mode) {
      session.mode = updates.mode;
    }
    if (updates.targetMemberId !== undefined) {
      session.targetMemberId = updates.targetMemberId;
    }

    const level = this.db.prepare("SELECT * FROM levels WHERE id = ?").get(session.targetLevelId) as any;
    const fields = this.fieldService.getFieldsByLevel(session.targetLevelId);
    const parent = session.parentId ? this.memberService.getRecord(session.parentId) : null;

    // Recalculate missing required
    const missingKeys: string[] = [];
    for (const f of fields) {
      if (f.is_required) {
        const val = session.currentExtracted[f.key];
        if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
          missingKeys.push(f.name);
        }
      }
    }
    const hasNameField = fields.some(f => f.key === "name");
    if (!hasNameField && !session.currentExtracted.name) {
      missingKeys.unshift(`${level ? level.name : "Member"} Name`);
    }

    session.missingRequired = missingKeys;
    session.isReadyForConfirmation = missingKeys.length === 0;
    session.updatedAt = new Date().toISOString();

    AiSessionService.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Retrieve active session.
   */
  public getSession(sessionId: string): AiSession | null {
    return AiSessionService.sessions.get(sessionId) || null;
  }

  /**
   * Process a conversational turn with user prompt and optional file attachments.
   */
  public async handleUserTurn(
    sessionId: string,
    userMessage: string,
    uploadedFiles: Array<{
      name: string;
      originalName: string;
      size: number;
      mimeType: string;
      savedPath: string;
    }> = []
  ): Promise<AiSession> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const now = new Date().toISOString();
    let level = this.db.prepare("SELECT * FROM levels WHERE id = ?").get(session.targetLevelId) as any;
    let fields = this.fieldService.getFieldsByLevel(session.targetLevelId);
    let parent = session.parentId ? this.memberService.getRecord(session.parentId) : null;

    // Process and extract attachments
    const newAttachments: AiSessionAttachment[] = [];
    for (const f of uploadedFiles) {
      const extractedText = await FileExtractorService.extractText(f.savedPath, f.originalName, f.mimeType);
      const att: AiSessionAttachment = {
        id: crypto.randomUUID(),
        name: f.name,
        originalName: f.originalName,
        size: f.size,
        mimeType: f.mimeType,
        savedPath: f.savedPath,
        extractedText
      };
      newAttachments.push(att);
      session.attachments.push(att);
    }

    // Add user message to session
    session.messages.push({
      role: "user",
      content: userMessage,
      timestamp: now,
      attachments: newAttachments.map(a => a.originalName)
    });

    // Check if user is asking to summarize a table or level
    const isSummarizeIntent = /\b(summarise|summarize|summary|overview|breakdown|analyze|analysis)\b/i.test(userMessage.trim()) &&
      (/\b(table|level|records|dataset|data)\b/i.test(userMessage.trim()) || (this.db.prepare("SELECT name FROM levels WHERE hierarchy_id = ?").all(session.hierarchyId) as any[]).some((l: any) => userMessage.toLowerCase().includes(l.name.toLowerCase())));

    if (isSummarizeIntent) {
      const allLevels = this.db.prepare("SELECT * FROM levels WHERE hierarchy_id = ? ORDER BY depth_order ASC").all(session.hierarchyId) as any[];
      const targetLvl = allLevels.find(l => userMessage.toLowerCase().includes(l.name.toLowerCase())) ||
        allLevels.find(l => l.id === session.targetLevelId) ||
        allLevels[0];

      if (targetLvl) {
        const fields = this.db.prepare("SELECT * FROM field_definitions WHERE level_id = ? ORDER BY order_index ASC").all(targetLvl.id) as any[];
        const totalCount = (this.db.prepare("SELECT COUNT(*) as count FROM members WHERE level_id = ? AND hierarchy_id = ?").get(targetLvl.id, session.hierarchyId) as any)?.count || 0;
        const parentBreakdown = this.db.prepare(`
          SELECT p.name as parent_name, COUNT(m.id) as count
          FROM members m
          LEFT JOIN members p ON m.parent_id = p.id
          WHERE m.level_id = ?
          GROUP BY m.parent_id
          ORDER BY count DESC
          LIMIT 10
        `).all(targetLvl.id) as any[];

        const sampleRecords = this.db.prepare("SELECT m.name, p.name as parent_name, m.custom_data, m.created_at FROM members m LEFT JOIN members p ON m.parent_id = p.id WHERE m.level_id = ? AND m.hierarchy_id = ? LIMIT 40").all(targetLvl.id, session.hierarchyId) as any[];

        const parsedRecords = sampleRecords.map((r: any) => {
          let cd = {};
          try { cd = JSON.parse(r.custom_data || "{}"); } catch {}
          return { name: r.name, parent: r.parent_name || "(Root)", ...cd };
        });

        const systemPrompt = `You are an expert enterprise data operations analyst.
Your task is to analyze the dataset for level "${targetLvl.name}" in a hierarchical database and provide a concise, high-value executive summary.
Level Context:
- Level Name: ${targetLvl.name}
- Total Records: ${totalCount}
- Configured Attributes / Columns: ${fields.map(f => `${f.name} (${f.field_type})`).join(", ") || "None"}
- Parent Branches: ${parentBreakdown.map(p => `${p.parent_name || 'Root Tier'} (${p.count} records)`).join(", ") || "None"}
Sample Records:
${JSON.stringify(parsedRecords.slice(0, 30), null, 2)}
Format in structured Markdown with bold metrics, clear sections, bullet points, and key observations.`;

        let summaryText = "";
        try {
          const res = await AiProviderService.chat({
            systemPrompt,
            messages: [{ role: "user", content: `Please summarize the ${targetLvl.name} table.` }],
            temperature: 0.2
          });
          summaryText = res.content;
        } catch {
          summaryText = `### Executive Summary for **${targetLvl.name}** Table\n\n` +
            `The **${targetLvl.name}** table contains **${totalCount}** records across **${parentBreakdown.length}** branch group(s) with **${fields.length}** configured dynamic attributes.\n\n` +
            `#### Attributes\n` +
            fields.map(f => `- **${f.name}** (${f.field_type}): ${f.is_required ? "Required" : "Optional"}`).join("\n") + `\n\n` +
            `#### Parent Distribution\n` +
            parentBreakdown.map(p => `- **${p.parent_name || 'Root Tier'}**: ${p.count} record(s)`).join("\n");
        }

        session.messages.push({
          role: "assistant",
          content: summaryText,
          timestamp: new Date().toISOString()
        });
        session.missingRequired = [];
        session.isReadyForConfirmation = false;
        session.updatedAt = new Date().toISOString();
        AiSessionService.sessions.set(sessionId, session);
        return session;
      }
    }

    // Check if user is looking up or finding a particular point in the hierarchy
    const isCreateIntent = /^\s*(add|create|new|insert|make)\b/i.test(userMessage.trim());
    const isLookupIntent = session.mode === "lookup" || /^\s*(find|where|search|who|locate|get|show|details|point)\b/i.test(userMessage.trim());

    const foundPoints = this.searchPoints(session.hierarchyId, userMessage);
    session.foundPoints = foundPoints;

    if ((isLookupIntent || (foundPoints.length > 0 && session.mode !== "create")) && !isCreateIntent) {
      const p = foundPoints[0];
      if (p) {
        const detailsList = Object.entries(p.custom_data || {})
          .filter(([k, v]) => v !== undefined && v !== null && v !== "" && k !== "name")
          .map(([k, v]) => `• **${k}:** ${v}`)
          .join("\n");

        let text = `📍 Found **${p.name}** (${p.level_name}) in the hierarchy!\n\n` +
          `**Hierarchy Location / Path:**\n${p.pathString}\n\n`;

        if (detailsList) {
          text += `**Details:**\n${detailsList}\n\n`;
        }
        if (p.parent) {
          text += `• **Parent:** ${p.parent.name}\n`;
        }
        if (p.children_count > 0) {
          text += `• **Subordinates / Children (${p.children_count}):** ${p.children.map((c: any) => c.name).join(", ")}\n`;
        }

        if (foundPoints.length > 1) {
          text += `\n*Other matching points (${foundPoints.length - 1}):* ` +
            foundPoints.slice(1, 4).map((o: any) => `**${o.name}** (${o.level_name})`).join(", ");
        }

        session.messages.push({
          role: "assistant",
          content: text,
          timestamp: new Date().toISOString()
        });
        session.missingRequired = [];
        session.isReadyForConfirmation = false;
        session.updatedAt = new Date().toISOString();
        AiSessionService.sessions.set(sessionId, session);
        return session;
      } else if (isLookupIntent) {
        session.messages.push({
          role: "assistant",
          content: `I searched the hierarchy for "${userMessage.trim()}", but couldn't find a matching point. You can search by name, department, job title, or ID.`,
          timestamp: new Date().toISOString()
        });
        session.missingRequired = [];
        session.isReadyForConfirmation = false;
        session.updatedAt = new Date().toISOString();
        AiSessionService.sessions.set(sessionId, session);
        return session;
      }
    }

    // Build system prompt for Qwen
    const systemPrompt = this.buildSystemPrompt({
      hierarchyId: session.hierarchyId,
      level,
      fields,
      parent,
      mode: session.mode,
      currentExtracted: session.currentExtracted
    });

    // Build user content with conversation history and file content
    const contextContentParts: string[] = [];

    if (newAttachments.length > 0) {
      contextContentParts.push("=== NEW ATTACHED FILES CONTENT ===");
      for (const att of newAttachments) {
        contextContentParts.push(`--- File: "${att.originalName}" (${att.mimeType}, ${att.size} bytes) ---\n${att.extractedText.slice(0, 8000)}`);
      }
    }

    contextContentParts.push(`=== USER MESSAGE ===\n${userMessage}`);

    const promptUserTurn = contextContentParts.join("\n\n");

    // Prepare message history for LLM (last 6 turns for context efficiency)
    const historyForLlm = session.messages.slice(-6, -1).map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content
    }));
    historyForLlm.push({ role: "user", content: promptUserTurn });

    // Call LLM with JSON format
    let aiResponse: any;
    let modelUsed: string = "unknown";

    try {
      const result = await AiProviderService.chatJson({
        systemPrompt,
        messages: historyForLlm,
        temperature: 0.1
      });
      aiResponse = result.data;
      modelUsed = result.model;
      session.modelUsed = modelUsed;

      // Auto-detect target level if specified in natural language
      if (aiResponse.detected_level_code) {
        const allLevels = this.db.prepare("SELECT * FROM levels WHERE hierarchy_id = ? ORDER BY depth_order ASC").all(session.hierarchyId) as any[];
        const matchLvl = allLevels.find(
          l => l.code.toLowerCase() === String(aiResponse.detected_level_code).toLowerCase() ||
               l.name.toLowerCase() === String(aiResponse.detected_level_code).toLowerCase()
        );
        if (matchLvl && matchLvl.id !== session.targetLevelId) {
          session.targetLevelId = matchLvl.id;
          level = matchLvl;
          fields = this.fieldService.getFieldsByLevel(session.targetLevelId);
        }
      }

      // Auto-detect parent member if specified in natural language
      if (aiResponse.detected_parent_name) {
        const parentRow = this.db.prepare("SELECT id, name, level_id FROM members WHERE hierarchy_id = ? AND name LIKE ? LIMIT 1").get(session.hierarchyId, `%${aiResponse.detected_parent_name}%`) as any;
        if (parentRow && parentRow.id !== session.parentId) {
          session.parentId = parentRow.id;
          parent = parentRow;
        }
      }
    } catch (err: any) {
      console.error("LLM Extraction Error, using intelligent fallback parser:", err);
      aiResponse = this.fallbackLocalExtractor(userMessage, newAttachments, fields, session.currentExtracted);
    }

    // Normalize and merge extracted fields
    const newlyExtracted = aiResponse.extracted_fields || aiResponse.extractedFields || {};
    const mergedExtracted = { ...session.currentExtracted };

    for (const [k, v] of Object.entries(newlyExtracted)) {
      if (v !== undefined && v !== null && v !== "" && v !== "null" && v !== "undefined") {
        mergedExtracted[k] = v;
      }
    }

    // Normalization (emails to lowercase, trim strings)
    for (const f of fields) {
      if (mergedExtracted[f.key] !== undefined) {
        if (f.field_type === "email" && typeof mergedExtracted[f.key] === "string") {
          mergedExtracted[f.key] = mergedExtracted[f.key].toLowerCase().trim();
        } else if (f.field_type === "number" || f.field_type === "decimal") {
          const num = Number(mergedExtracted[f.key]);
          if (!isNaN(num)) mergedExtracted[f.key] = f.field_type === "number" ? Math.round(num) : num;
        } else if (typeof mergedExtracted[f.key] === "string") {
          mergedExtracted[f.key] = mergedExtracted[f.key].trim();
        }
      }
    }
    if (typeof mergedExtracted.name === "string") {
      mergedExtracted.name = mergedExtracted.name.trim();
    }

    session.currentExtracted = mergedExtracted;

    // Strict backend recalculation of missing required fields (NEVER TRUST LLM BOOLEAN)
    const missingKeys: string[] = [];
    for (const f of fields) {
      if (f.is_required) {
        const val = mergedExtracted[f.key];
        if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
          missingKeys.push(f.name);
        }
      }
    }

    // Ensure member name is present
    const hasNameField = fields.some(f => f.key === "name");
    if (!hasNameField) {
      const nameCandidate = mergedExtracted.name || mergedExtracted.full_name || mergedExtracted.title;
      if (!nameCandidate || !String(nameCandidate).trim()) {
        missingKeys.unshift(`${level.name} Name`);
      } else {
        session.currentExtracted.name = String(nameCandidate).trim();
      }
    }

    session.missingRequired = missingKeys;
    session.isReadyForConfirmation = (missingKeys.length === 0);

    // Record conflicts if reported
    const conflicts: AiFieldConflict[] = (aiResponse.conflicts || []).map((c: any) => ({
      fieldKey: c.fieldKey || c.field_key || "",
      fieldName: c.fieldName || c.field_name || c.fieldKey || "Unknown Field",
      textValue: c.textValue ?? c.text_value,
      fileValue: c.fileValue ?? c.file_value,
      description: c.description || "Discrepancy detected between text and attached document."
    }));
    session.conflicts = conflicts;

    // Generate assistant response text
    let assistantText = aiResponse.assistant_message || aiResponse.assistantMessage || "";
    if (!assistantText.trim()) {
      if (session.isReadyForConfirmation) {
        assistantText = `All required fields for **${level.name}** have been provided. Please review the extracted record below and click **Create Record** to confirm.`;
      } else {
        assistantText = `I have updated the information. I still need the following required fields:\n${missingKeys.map(k => `• **${k}**`).join("\n")}`;
      }
    }

    session.messages.push({
      role: "assistant",
      content: assistantText,
      timestamp: new Date().toISOString()
    });

    session.updatedAt = new Date().toISOString();
    AiSessionService.sessions.set(sessionId, session);

    return session;
  }

  /**
   * Commit confirmed record creation to database via MemberService.
   */
  public async confirmCreate(
    sessionId: string,
    actor: { id: string; name: string },
    overrideData?: Record<string, any>
  ): Promise<any> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const dataToSave = { ...session.currentExtracted, ...(overrideData || {}) };
    const level = this.db.prepare("SELECT * FROM levels WHERE id = ?").get(session.targetLevelId) as any;
    const fields = this.fieldService.getFieldsByLevel(session.targetLevelId);

    // Determine member name
    let memberName = dataToSave.name;
    if (!memberName) {
      const nameField = fields.find(f => f.key === "name" || f.key === "full_name" || f.key === "title" || f.name.toLowerCase().includes("name"));
      if (nameField && dataToSave[nameField.key]) {
        memberName = dataToSave[nameField.key];
      }
    }
    if (!memberName) {
      memberName = `${level.name} ${Date.now().toString().slice(-4)}`;
    }

    // Separate top-level name and custom_data
    const customData: Record<string, any> = {};
    for (const f of fields) {
      if (dataToSave[f.key] !== undefined) {
        customData[f.key] = dataToSave[f.key];
      }
    }
    // Also store name in custom_data if there is a name field
    if (fields.some(f => f.key === "name")) {
      customData.name = memberName;
    }

    // Create persistent record
    const createdMember = this.memberService.createRecord(
      {
        hierarchy_id: session.hierarchyId,
        level_id: session.targetLevelId,
        parent_id: session.parentId,
        name: String(memberName).trim(),
        custom_data: customData
      },
      actor
    );

    // Write dedicated AI_CREATE audit log entry
    this.auditService.log({
      userId: actor.id,
      userName: actor.name,
      action: "AI_CREATE" as any,
      entityType: "member",
      entityId: createdMember.id,
      hierarchyId: session.hierarchyId,
      levelId: session.targetLevelId,
      memberId: createdMember.id,
      newState: {
        id: createdMember.id,
        name: createdMember.name,
        parent_id: session.parentId,
        custom_data: createdMember.custom_data,
        ai_metadata: {
          session_id: session.id,
          model_used: session.modelUsed,
          attachment_count: session.attachments.length,
          conversation_turns: session.messages.length
        }
      }
    });

    // Mark session completed
    AiSessionService.sessions.delete(sessionId);

    return createdMember;
  }

  /**
   * Commit confirmed record update to database via MemberService.
   */
  public async confirmUpdate(
    sessionId: string,
    actor: { id: string; name: string },
    overrideData?: Record<string, any>
  ): Promise<any> {
    const session = this.getSession(sessionId);
    if (!session || !session.targetMemberId) {
      throw new Error(`Session ${sessionId} not found or missing target member`);
    }

    const dataToSave = { ...session.currentExtracted, ...(overrideData || {}) };
    const fields = this.fieldService.getFieldsByLevel(session.targetLevelId);

    const updatePayload: { name?: string; custom_data?: Record<string, any> } = {};
    if (dataToSave.name) {
      updatePayload.name = String(dataToSave.name).trim();
    }

    const customData: Record<string, any> = {};
    for (const f of fields) {
      if (dataToSave[f.key] !== undefined) {
        customData[f.key] = dataToSave[f.key];
      }
    }
    updatePayload.custom_data = customData;

    const updatedMember = this.memberService.updateRecord(session.targetMemberId, updatePayload, actor);

    // Log AI_UPDATE
    this.auditService.log({
      userId: actor.id,
      userName: actor.name,
      action: "AI_UPDATE" as any,
      entityType: "member",
      entityId: updatedMember.id,
      hierarchyId: session.hierarchyId,
      levelId: session.targetLevelId,
      memberId: updatedMember.id,
      newState: {
        id: updatedMember.id,
        name: updatedMember.name,
        custom_data: updatedMember.custom_data,
        ai_metadata: {
          session_id: session.id,
          model_used: session.modelUsed
        }
      }
    });

    AiSessionService.sessions.delete(sessionId);
    return updatedMember;
  }

  /**
   * Constructs the dynamic schema prompt with zero hardcoded entity assumptions and full hierarchy awareness.
   */
  private buildSystemPrompt(context: {
    hierarchyId: string;
    level: any;
    fields: any[];
    parent: any;
    mode: "create" | "edit" | "lookup";
    currentExtracted: Record<string, any>;
  }): string {
    const allLevels = this.db.prepare("SELECT * FROM levels WHERE hierarchy_id = ? ORDER BY depth_order ASC").all(context.hierarchyId) as any[];
    const allMembers = this.db.prepare("SELECT id, name, level_id FROM members WHERE hierarchy_id = ? LIMIT 30").all(context.hierarchyId) as any[];

    const fieldLines = context.fields.map(f => {
      const opts = f.options && f.options.length > 0 ? ` [Allowed options: ${f.options.join(", ")}]` : "";
      const req = f.is_required ? "REQUIRED" : "OPTIONAL";
      return `- Key: "${f.key}" | Name: "${f.name}" | Type: ${f.field_type} | Requirement: ${req}${opts}`;
    }).join("\n");

    const parentInfo = context.parent
      ? `Parent Member: "${context.parent.name}" (ID: ${context.parent.id}, Level: ${context.parent.level_name})`
      : "Parent Member: None (Root Level Record)";

    const hierarchyTree = allLevels.map((lvl, idx) => `Level ${idx + 1}: "${lvl.name}" (Code: "${lvl.code}")`).join(" -> ");
    const memberExamples = allMembers.map(m => `"${m.name}"`).slice(0, 15).join(", ");

    return `You are an intelligent, precise enterprise AI editor for an entire hierarchical data system.
You can create, edit, and manage records at ANY level across the entire hierarchy.

WHOLE HIERARCHY SYSTEM STRUCTURE:
${hierarchyTree}
Known members in this hierarchy: ${memberExamples || "None"}

ACTIVE TARGET CONTEXT:
- Target Level: "${context.level.name}" (Code: "${context.level.code}")
- Context: ${parentInfo}
- Mode: ${context.mode === "create" ? "Creating a new record" : "Editing an existing record"}

DYNAMIC FIELD SCHEMA FOR TARGET LEVEL ("${context.level.name}"):
- Key: "name" | Name: "${context.level.name} Name" | Type: text | Requirement: REQUIRED
${fieldLines}

CURRENTLY ACCUMULATED VALUES:
${JSON.stringify(context.currentExtracted, null, 2)}

STRICT OPERATIONAL RULES:
1. ZERO HALLUCINATION: You must NEVER fabricate, guess, or invent values for required fields. If a field's value was not explicitly provided in the user's message or attached documents, DO NOT put it in extracted_fields.
2. DO NOT make up email addresses, employee IDs, phone numbers, salaries, or dates.
3. FOLLOW-UP QUESTIONS: If required fields are missing, your "assistant_message" must ask ONLY for the specific required fields that are missing. Be concise, polite, and direct.
4. FIELD MAPPING INTELLIGENCE: Thoroughly inspect the user's natural language for mentions matching any schema field. Prepositional phrases like "in Engineering" or "under Marketing" indicate the Department field; phrases like "Senior Developer" or "Teacher" indicate Job Title/Role; IDs like "EMP-501" indicate Employee ID; emails indicate Email. Map these accurately.
5. HIERARCHY-WIDE AWARENESS: If the user indicates creating or editing a different level (e.g. "Add a new Team" or "Create a Department"), set "detected_level_code" to that level's code. If the user mentions a parent node (e.g. "under Web Development" or "in Technology Division"), set "detected_parent_name" to that member's name.
6. CONFLICT DETECTION: If information in the user's message directly contradicts an attached document (e.g. user specified one salary/title and the document says another), add an entry to the "conflicts" array describing the conflict.
7. READY CONFIRMATION: When all required fields have values, let the user know the record is ready for review and confirmation.
8. JSON OUTPUT FORMAT: You must return ONLY a JSON object conforming to the following structure:

{
  "thought": "Brief 1-2 sentence explanation of your reasoning",
  "detected_level_code": "optional level code if user specified another level",
  "detected_parent_name": "optional parent member name if user specified where to place it",
  "extracted_fields": {
    "<field_key>": "<extracted_value>"
  },
  "conflicts": [
    {
      "fieldKey": "<key>",
      "fieldName": "<name>",
      "textValue": "<value from text>",
      "fileValue": "<value from file>",
      "description": "<explanation of discrepancy>"
    }
  ],
  "assistant_message": "Friendly response acknowledging what was found and asking only for what is missing, or announcing readiness"
}`;
  }

  /**
   * Deterministic local fallback extractor in case LLM is busy or unavailable.
   */
  private fallbackLocalExtractor(
    userText: string,
    attachments: AiSessionAttachment[],
    fields: any[],
    existing: Record<string, any>
  ): any {
    const extracted: Record<string, any> = {};
    const fullText = [userText, ...attachments.map(a => a.extractedText)].join("\n");

    // 1. Email extraction
    const emailMatch = fullText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const emailField = fields.find(f => f.field_type === "email" || f.key.includes("email"));
    if (emailMatch && emailField) {
      extracted[emailField.key] = emailMatch[0].toLowerCase();
    }

    // 2. ID extraction (e.g. EMP-123 or ID: 123)
    const idMatch = fullText.match(/\b([A-Z]{2,4}-\d{2,6}|\d{4,8})\b/i);
    const idField = fields.find(f => f.key.includes("id") || f.name.toLowerCase().includes("id"));
    if (idMatch && idField) {
      extracted[idField.key] = idMatch[0].toUpperCase();
    }

    // 3. Name pattern: "Add <Name>." or "Name: <Name>"
    const nameMatch = userText.match(/(?:add|create|name\s*(?:is|:)?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
    if (nameMatch) {
      extracted.name = nameMatch[1].trim();
      const nameField = fields.find(f => f.key === "name" || f.name.toLowerCase().includes("name"));
      if (nameField) extracted[nameField.key] = nameMatch[1].trim();
    }

    // 4. Match any select fields by option
    for (const f of fields) {
      if (f.options && f.options.length > 0) {
        for (const opt of f.options) {
          if (new RegExp(`\\b${opt}\\b`, "i").test(fullText)) {
            extracted[f.key] = opt;
            break;
          }
        }
      }
    }

    return {
      thought: "Local regex fallback extraction",
      extracted_fields: extracted,
      conflicts: [],
      assistant_message: "I have extracted information from your message. Please verify the fields below."
    };
  }

  /**
   * Search for a particular point in the hierarchy and retrieve its full details.
   */
  public searchPoints(hierarchyId: string, query: string): any[] {
    if (!query || !query.trim()) return [];

    const stopWords = new Set([
      "find", "where", "is", "the", "point", "details", "about", "show",
      "me", "who", "what", "are", "tell", "get", "for", "in", "at", "a", "an", "of", "to"
    ]);

    const cleanTokens = query
      .replace(/[?!.,;:"']/g, " ")
      .trim()
      .split(/\s+/)
      .map(t => t.trim())
      .filter(t => t.length > 1 && !stopWords.has(t.toLowerCase()));

    const searchTerm = cleanTokens.length > 0 ? cleanTokens.join(" ") : query.trim();

    // 1. Direct match on full query or search term
    let rows = this.db.prepare(`
      SELECT m.*,
        l.name as level_name,
        l.code as level_code,
        l.color as level_color,
        p.name as parent_name
      FROM members m
      JOIN levels l ON m.level_id = l.id
      LEFT JOIN members p ON m.parent_id = p.id
      WHERE m.hierarchy_id = ?
        AND (m.name LIKE ? OR m.custom_data LIKE ? OR l.name LIKE ?)
      ORDER BY m.depth ASC, m.name ASC
      LIMIT 8
    `).all(hierarchyId, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`) as any[];

    // 2. Token-by-token fallback if no direct matches
    if (rows.length === 0 && cleanTokens.length > 0) {
      for (const token of cleanTokens) {
        const tokenTerm = `%${token}%`;
        const tokenRows = this.db.prepare(`
          SELECT m.*,
            l.name as level_name,
            l.code as level_code,
            l.color as level_color,
            p.name as parent_name
          FROM members m
          JOIN levels l ON m.level_id = l.id
          LEFT JOIN members p ON m.parent_id = p.id
          WHERE m.hierarchy_id = ?
            AND (m.name LIKE ? OR m.custom_data LIKE ? OR l.name LIKE ?)
          ORDER BY m.depth ASC, m.name ASC
          LIMIT 8
        `).all(hierarchyId, tokenTerm, tokenTerm, tokenTerm) as any[];
        if (tokenRows.length > 0) {
          rows = tokenRows;
          break;
        }
      }
    }

    return rows.map(row => {
      let customData: Record<string, any> = {};
      try {
        customData = typeof row.custom_data === "string" ? JSON.parse(row.custom_data) : (row.custom_data || {});
      } catch {}

      const ancestors = this.memberService.getAncestors(row.id).map(a => ({
        id: a.id,
        name: a.name,
        level_name: a.level_name || ""
      }));

      const children = this.memberService.getChildren(row.id, hierarchyId).map(c => ({
        id: c.id,
        name: c.name,
        level_name: c.level_name || ""
      }));

      const pathArray = ancestors.map(a => a.name);
      pathArray.push(row.name);

      return {
        id: row.id,
        name: row.name,
        level_id: row.level_id,
        level_name: row.level_name,
        level_code: row.level_code,
        level_color: row.level_color,
        depth: row.depth,
        path: pathArray,
        pathString: pathArray.join("  →  "),
        parent: row.parent_id ? { id: row.parent_id, name: row.parent_name || "" } : null,
        children_count: children.length,
        children: children.slice(0, 10),
        custom_data: customData
      };
    });
  }
}
