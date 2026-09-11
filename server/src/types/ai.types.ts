export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachments?: string[];
}

export interface AiSessionAttachment {
  id: string;
  name: string;
  originalName: string;
  size: number;
  mimeType: string;
  savedPath: string;
  extractedText: string;
}

export interface AiFieldConflict {
  fieldKey: string;
  fieldName: string;
  textValue?: any;
  fileValue?: any;
  description: string;
}

export interface AiExtractionResult {
  extractedFields: Record<string, any>;
  missingRequiredFields: string[];
  conflicts: AiFieldConflict[];
  assistantMessage: string;
  isComplete: boolean;
  thought?: string;
}

export interface AiSession {
  id: string;
  userId: string;
  hierarchyId: string;
  targetLevelId: string;
  parentId: string | null;
  mode: 'create' | 'edit' | 'lookup';
  targetMemberId?: string;
  messages: AiMessage[];
  attachments: AiSessionAttachment[];
  currentExtracted: Record<string, any>;
  missingRequired: string[];
  conflicts: AiFieldConflict[];
  isReadyForConfirmation: boolean;
  foundPoints?: any[];
  modelUsed?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiLevelConfig {
  level_id: string;
  is_record_creation_enabled: boolean;
  is_editing_enabled: boolean;
  is_file_extraction_enabled: boolean;
  require_confirmation: boolean;
  allowed_attachment_types: string[];
  max_attachment_size_mb: number;
  max_attachments: number;
}
