import React, { useState, useEffect } from "react";
import Papa from "papaparse";
import { Level, FieldDefinition } from "../types/index.js";
import { api } from "../services/api.js";
import {
  X,
  Upload,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileText,
  Download,
  Copy,
  Sparkles,
  Columns
} from "lucide-react";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  hierarchyId: string;
  level: Level;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  hierarchyId,
  level
}) => {
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [csvText, setCsvText] = useState("");
  const [previewData, setPreviewData] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Load level dynamic fields whenever modal opens or level changes
  useEffect(() => {
    if (!isOpen) return;

    async function loadLevelFields() {
      try {
        const fetched = await api.getFields(level.id);
        setFields(fetched);
      } catch (err: any) {
        console.error("Failed to load fields for import template", err);
      }
    }

    loadLevelFields();
    setCsvText("");
    setPreviewData(null);
    setError(null);
  }, [isOpen, level]);

  if (!isOpen) return null;

  // Generate dynamic sample CSV reflecting all current column names
  const generateSampleCsv = () => {
    const importableFields = fields.filter(f => f.field_type !== "calculated");

    const sampleRow1: Record<string, any> = {
      "Name": `Sample ${level.name.replace(/s$/, "")} 1`
    };
    const sampleRow2: Record<string, any> = {
      "Name": `Sample ${level.name.replace(/s$/, "")} 2`
    };

    for (const f of importableFields) {
      if (f.field_type === "single_select") {
        sampleRow1[f.name] = f.options?.[0] || "Option A";
        sampleRow2[f.name] = f.options?.[1] || f.options?.[0] || "Option B";
      } else if (f.field_type === "multi_select") {
        sampleRow1[f.name] = f.options?.[0] || "Option A";
        sampleRow2[f.name] = f.options?.slice(0, 2).join(", ") || "Option A, Option B";
      } else if (f.field_type === "number" || f.field_type === "decimal") {
        sampleRow1[f.name] = 100;
        sampleRow2[f.name] = 200;
      } else if (f.field_type === "boolean") {
        sampleRow1[f.name] = "true";
        sampleRow2[f.name] = "false";
      } else if (f.field_type === "date") {
        sampleRow1[f.name] = "2026-09-01";
        sampleRow2[f.name] = "2026-09-15";
      } else if (f.field_type === "datetime") {
        sampleRow1[f.name] = "2026-09-01T09:00:00";
        sampleRow2[f.name] = "2026-09-15T14:30:00";
      } else if (f.field_type === "email") {
        sampleRow1[f.name] = "member1@domain.com";
        sampleRow2[f.name] = "member2@domain.com";
      } else if (f.field_type === "phone") {
        sampleRow1[f.name] = "+1-555-0101";
        sampleRow2[f.name] = "+1-555-0102";
      } else if (f.field_type === "url") {
        sampleRow1[f.name] = "https://example.com/item1";
        sampleRow2[f.name] = "https://example.com/item2";
      } else {
        sampleRow1[f.name] = `Value 1 (${f.name})`;
        sampleRow2[f.name] = `Value 2 (${f.name})`;
      }
    }

    return Papa.unparse([sampleRow1, sampleRow2]);
  };

  const dynamicSampleCsv = generateSampleCsv();

  const handleInsertTemplate = () => {
    setCsvText(dynamicSampleCsv);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
    handlePreview(dynamicSampleCsv);
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([dynamicSampleCsv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${level.name.toLowerCase()}_import_template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvText(text);
      handlePreview(text);
    };
    reader.readAsText(file);
  };

  const handlePreview = async (textToParse = csvText) => {
    if (!textToParse.trim()) {
      setError("Please paste or upload CSV data first");
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);

      const parsed = Papa.parse(textToParse.trim(), { header: true, skipEmptyLines: true });
      if (parsed.errors.length > 0 && parsed.data.length === 0) {
        throw new Error(parsed.errors[0].message);
      }

      const preview = await api.previewImport(hierarchyId, level.id, parsed.data);
      setPreviewData({
        ...preview,
        rawRows: parsed.data
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommit = async () => {
    if (!previewData || previewData.validCount === 0) return;

    try {
      setIsProcessing(true);
      setError(null);
      await api.commitImport(hierarchyId, level.id, previewData.validPreview, null);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-800 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Upload className="w-5 h-5 text-zinc-200" />
            <div>
              <h3 className="text-base font-bold text-zinc-100">Import {level.name} Records</h3>
              <p className="text-xs text-zinc-500">
                Dynamic CSV validation reflecting all {fields.length + 1} active level columns
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-500 hover:text-zinc-400 hover:bg-zinc-850">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Active Level Schema Columns Badge Strip */}
          <div className="p-3 rounded-xl bg-zinc-800/50 border border-indigo-100 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 font-bold text-indigo-950 text-[11px] uppercase tracking-wider">
                <Columns className="w-3.5 h-3.5 text-zinc-200" />
                <span>Configured Columns in CSV Header ({fields.length + 1})</span>
              </div>
              <span className="text-[10px] text-zinc-500">Includes newly created columns</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-indigo-900 font-bold text-[11px]">
                Name <span className="text-rose-500">*</span>
              </span>
              {fields.filter(f => f.field_type !== "calculated").map(f => (
                <span
                  key={f.id}
                  className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 font-semibold text-[11px] flex items-center space-x-1"
                >
                  <span>{f.name}</span>
                  {f.is_required && <span className="text-rose-500">*</span>}
                  <span className="text-[9px] text-zinc-500 font-mono">({f.field_type})</span>
                </span>
              ))}
            </div>
          </div>

          {/* Action Row: Insert Template & Download Template */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleInsertTemplate}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center space-x-1.5 transition border border-zinc-700"
              >
                <Sparkles className="w-3.5 h-3.5 text-zinc-200" />
                <span>{copiedNotification ? "Template Inserted!" : "Insert Sample CSV Template"}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="px-3 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-850 text-zinc-300 font-semibold text-xs flex items-center space-x-1.5 transition border border-zinc-800"
                title="Download ready-to-fill CSV template with current columns"
              >
                <Download className="w-3.5 h-3.5 text-zinc-500" />
                <span>Download Template.csv</span>
              </button>
            </div>

            <label className="px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-950 hover:bg-zinc-850 text-zinc-300 font-semibold cursor-pointer flex items-center space-x-1.5 transition">
              <FileText className="w-3.5 h-3.5 text-zinc-500" />
              <span>Choose CSV File</span>
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          {/* Textarea with Dynamic Placeholder */}
          <div>
            <label className="block font-bold text-zinc-300 uppercase tracking-wider mb-1.5">
              CSV Content (Paste below or edit):
            </label>
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder={dynamicSampleCsv}
              rows={6}
              className="w-full px-3 py-2 rounded-xl border border-zinc-800 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-zinc-950/40"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => handlePreview()}
              disabled={isProcessing || !csvText.trim()}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold transition disabled:opacity-50 flex items-center space-x-1.5"
            >
              <span>{isProcessing ? "Validating..." : "Validate & Preview CSV"}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Validation Preview Card */}
          {previewData && (
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-3">
              <div className="flex items-center justify-between font-bold text-zinc-200">
                <span>Validation Summary</span>
                <span className="text-[11px] text-zinc-500">Detected: {previewData.total} records</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center space-x-2 text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <div className="font-extrabold text-sm">{previewData.validCount}</div>
                    <div className="text-[10px] uppercase font-semibold">Valid Records</div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 flex items-center space-x-2 text-rose-800">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <div>
                    <div className="font-extrabold text-sm">{previewData.errorCount}</div>
                    <div className="text-[10px] uppercase font-semibold">Validation Errors</div>
                  </div>
                </div>
              </div>

              {previewData.errorCount > 0 && (
                <div>
                  <button
                    onClick={() => setShowErrorDetails(!showErrorDetails)}
                    className="text-xs font-semibold text-rose-600 hover:underline flex items-center space-x-1"
                  >
                    <span>{showErrorDetails ? "Hide Errors" : "View Error Details"}</span>
                    <ChevronRight className={`w-3.5 h-3.5 transform transition ${showErrorDetails ? "rotate-90" : ""}`} />
                  </button>

                  {showErrorDetails && (
                    <div className="mt-2 max-h-36 overflow-y-auto border border-rose-200 rounded-lg p-2 bg-zinc-900 text-[11px] space-y-1">
                      {previewData.errors.map((err: any, i: number) => (
                        <div key={i} className="text-rose-700">
                          Row {err.row} ("{err.recordName}"): {err.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {previewData.validPreview && previewData.validPreview.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                    Valid Records Preview (Sample {previewData.validPreview.length}):
                  </div>
                  <div className="max-h-32 overflow-y-auto border border-zinc-800 rounded-lg bg-zinc-900 divide-y divide-slate-100 text-[11px]">
                    {previewData.validPreview.map((r: any, i: number) => (
                      <div key={i} className="p-2 flex justify-between items-center">
                        <span className="font-bold text-zinc-200">{r.name}</span>
                        <div className="text-zinc-500 text-[10px] space-x-2 truncate max-w-md">
                          {Object.entries(r.custom_data || {}).map(([k, v]) => (
                            <span key={k}>
                              <strong className="text-zinc-300">{k}:</strong> {String(v)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-end space-x-2 bg-zinc-950/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-zinc-800 font-semibold text-zinc-400 hover:bg-zinc-850 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCommit}
            disabled={!previewData || previewData.validCount === 0 || isProcessing}
            className="px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-bold border border-zinc-200 font-bold shadow-sm transition disabled:opacity-50"
          >
            {isProcessing ? "Importing..." : `Import ${previewData?.validCount || 0} Valid Records`}
          </button>
        </div>
      </div>
    </div>
  );
};
