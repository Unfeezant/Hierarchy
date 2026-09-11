import React, { useState, useEffect } from "react";
import { Member, Level, FieldDefinition } from "../types/index.js";
import { api } from "../services/api.js";
import { X, AlertCircle, Plus, Check, Tag } from "lucide-react";

interface DynamicMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (m: Member) => void;
  hierarchyId: string;
  level: Level;
  parentMember?: Member | null;
  editMember?: Member | null;
}

export const DynamicMemberModal: React.FC<DynamicMemberModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  hierarchyId,
  level,
  parentMember,
  editMember
}) => {
  const [name, setName] = useState("");
  const [customData, setCustomData] = useState<Record<string, any>>({});
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State to add a new option to a select field on the fly
  const [addingOptionFieldKey, setAddingOptionFieldKey] = useState<string | null>(null);
  const [newOptionValue, setNewOptionValue] = useState<string>("");
  const [isSavingOption, setIsSavingOption] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    async function loadFields() {
      try {
        const fetched = await api.getFields(level.id);
        setFields(fetched);

        if (editMember) {
          setName(editMember.name);
          setCustomData({ ...editMember.custom_data });
        } else {
          setName("");
          // Populate default values
          const defaults: Record<string, any> = {};
          for (const f of fetched) {
            if (f.default_value !== undefined && f.default_value !== null && f.default_value !== "") {
              defaults[f.key] = f.field_type === "boolean" ? f.default_value === "true" : f.default_value;
            }
          }
          setCustomData(defaults);
        }
      } catch (err: any) {
        setError(err.message);
      }
    }

    loadFields();
    setAddingOptionFieldKey(null);
    setNewOptionValue("");
  }, [isOpen, level, editMember]);

  if (!isOpen) return null;

  const handleCustomFieldChange = (key: string, value: any) => {
    setCustomData(prev => ({ ...prev, [key]: value }));
  };

  // Add a new acceptable filler item / option to the column domain on the fly
  const handleAddNewOptionToField = async (field: FieldDefinition) => {
    const trimmed = newOptionValue.trim();
    if (!trimmed) return;

    const currentOptions = field.options || [];
    if (currentOptions.includes(trimmed)) {
      handleCustomFieldChange(field.key, trimmed);
      setAddingOptionFieldKey(null);
      setNewOptionValue("");
      return;
    }

    try {
      setIsSavingOption(true);
      const updatedOptions = [...currentOptions, trimmed];
      // Persist to SQL database immediately
      await api.updateField(field.id, { options: updatedOptions });

      // Update local fields state so dropdown updates
      setFields(prev =>
        prev.map(f => (f.id === field.id ? { ...f, options: updatedOptions } : f))
      );

      // Select the newly added item
      if (field.field_type === "multi_select") {
        const existing = Array.isArray(customData[field.key]) ? customData[field.key] : [];
        handleCustomFieldChange(field.key, [...existing, trimmed]);
      } else {
        handleCustomFieldChange(field.key, trimmed);
      }

      setAddingOptionFieldKey(null);
      setNewOptionValue("");
    } catch (err: any) {
      setError("Failed to add new option: " + err.message);
    } finally {
      setIsSavingOption(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Member name is required");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      if (editMember) {
        const updated = await api.updateMember(editMember.id, {
          name: name.trim(),
          custom_data: customData
        });
        onSuccess(updated);
      } else {
        const created = await api.createMember({
          hierarchy_id: hierarchyId,
          level_id: level.id,
          parent_id: parentMember ? parentMember.id : null,
          name: name.trim(),
          custom_data: customData
        });
        onSuccess(created);
      }
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-800 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-zinc-100">
              {editMember ? `Edit ${level.name}` : `+ Add New ${level.name}`}
            </h3>
            {parentMember && !editMember && (
              <p className="text-xs text-zinc-500">Under parent: <strong className="text-zinc-300">{parentMember.name}</strong></p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-500 hover:text-zinc-400 hover:bg-zinc-850"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Primary Name Field */}
          <div>
            <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
              {level.name} Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={`Enter ${level.name.toLowerCase()} name...`}
              className="w-full px-3 py-2 border border-zinc-700 bg-zinc-950 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-400 font-medium"
            />
          </div>

          {/* Dynamic Schema-Generated Fields */}
          {fields.map(field => {
            if (field.field_type === "calculated") {
              return (
                <div key={field.id} className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs">
                  <span className="font-semibold text-zinc-400">{field.name}</span>
                  <span className="text-zinc-500 text-[11px] ml-2 font-mono">
                    (Calculated automatically: {field.calculation_formula})
                  </span>
                </div>
              );
            }

            const val = customData[field.key] ?? "";
            const isAddingThisOption = addingOptionFieldKey === field.key;

            return (
              <div key={field.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-zinc-300">
                    {field.name} {field.is_required && <span className="text-rose-500">*</span>}
                  </label>

                  {/* Quick button to expand option domain for select fields */}
                  {(field.field_type === "single_select" || field.field_type === "multi_select") && (
                    <button
                      type="button"
                      onClick={() => {
                        setAddingOptionFieldKey(isAddingThisOption ? null : field.key);
                        setNewOptionValue("");
                      }}
                      className="text-[11px] font-semibold text-zinc-200 hover:text-indigo-800 flex items-center space-x-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>{isAddingThisOption ? "Cancel" : "+ Add new acceptable item"}</span>
                    </button>
                  )}
                </div>

                {field.field_type === "single_select" ? (
                  <div className="space-y-2">
                    <select
                      required={field.is_required}
                      value={val}
                      onChange={e => handleCustomFieldChange(field.key, e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-700 bg-zinc-950 text-zinc-100 text-sm focus:outline-none focus:border-zinc-400"
                    >
                      <option value="">Select option...</option>
                      {(field.options || []).map(opt => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>

                    {/* Inline expand domain box */}
                    {isAddingThisOption && (
                      <div className="p-2.5 border border-zinc-700 bg-zinc-900 flex items-center space-x-2">
                        <Tag className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <input
                          type="text"
                          value={newOptionValue}
                          onChange={e => setNewOptionValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddNewOptionToField(field);
                            }
                          }}
                          placeholder={`Add new ${field.name.toLowerCase()} option...`}
                          className="flex-1 px-2.5 py-1 border border-zinc-700 bg-zinc-950 text-zinc-100 placeholder-zinc-500 text-xs focus:outline-none focus:border-zinc-400"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddNewOptionToField(field)}
                          disabled={isSavingOption || !newOptionValue.trim()}
                          className="px-2.5 py-1 bg-zinc-100 hover:bg-white text-zinc-950 font-bold border border-zinc-200 text-xs disabled:opacity-50"
                        >
                          {isSavingOption ? "Saving..." : "Add & Select"}
                        </button>
                      </div>
                    )}
                  </div>
                ) : field.field_type === "multi_select" ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-zinc-800 bg-zinc-950/50 max-h-32 overflow-y-auto">
                      {(field.options || []).map(opt => {
                        const arr = Array.isArray(val) ? val : [];
                        const isSelected = arr.includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                handleCustomFieldChange(field.key, arr.filter((x: any) => x !== opt));
                              } else {
                                handleCustomFieldChange(field.key, [...arr, opt]);
                              }
                            }}
                            className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center space-x-1 border transition ${
                              isSelected
                                ? "bg-zinc-100 text-zinc-950 font-bold border-indigo-600"
                                : "bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-850"
                            }`}
                          >
                            <span>{opt}</span>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </button>
                        );
                      })}
                    </div>

                    {isAddingThisOption && (
                      <div className="p-2.5 rounded-xl border border-zinc-700 bg-zinc-800/50 flex items-center space-x-2">
                        <Tag className="w-3.5 h-3.5 text-zinc-200 shrink-0" />
                        <input
                          type="text"
                          value={newOptionValue}
                          onChange={e => setNewOptionValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddNewOptionToField(field);
                            }
                          }}
                          placeholder={`Add new ${field.name.toLowerCase()} option...`}
                          className="flex-1 px-2.5 py-1 rounded border border-zinc-700 bg-zinc-900 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddNewOptionToField(field)}
                          disabled={isSavingOption || !newOptionValue.trim()}
                          className="px-2.5 py-1 rounded bg-zinc-100 hover:bg-white text-zinc-950 font-bold border border-zinc-200 font-bold text-xs disabled:opacity-50"
                        >
                          {isSavingOption ? "Saving..." : "Add & Select"}
                        </button>
                      </div>
                    )}
                  </div>
                ) : field.field_type === "long_text" ? (
                  <textarea
                    required={field.is_required}
                    value={val}
                    onChange={e => handleCustomFieldChange(field.key, e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-zinc-700 bg-zinc-950 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-400"
                  />
                ) : field.field_type === "boolean" ? (
                  <label className="flex items-center space-x-2 cursor-pointer mt-1">
                    <input
                      type="checkbox"
                      checked={Boolean(val)}
                      onChange={e => handleCustomFieldChange(field.key, e.target.checked)}
                      className="rounded text-zinc-200 focus:ring-indigo-500 w-4 h-4"
                    />
                    <span className="text-xs text-zinc-300 font-medium">Yes / Enabled</span>
                  </label>
                ) : field.field_type === "number" || field.field_type === "decimal" ? (
                  <input
                    type="number"
                    step={field.field_type === "decimal" ? "0.01" : "1"}
                    required={field.is_required}
                    value={val}
                    onChange={e => handleCustomFieldChange(field.key, e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-700 bg-zinc-950 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-400 font-mono"
                  />
                ) : field.field_type === "date" ? (
                  <input
                    type="date"
                    required={field.is_required}
                    value={val}
                    onChange={e => handleCustomFieldChange(field.key, e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-700 bg-zinc-950 text-zinc-100 text-sm focus:outline-none focus:border-zinc-400"
                  />
                ) : field.field_type === "datetime" ? (
                  <input
                    type="datetime-local"
                    required={field.is_required}
                    value={val}
                    onChange={e => handleCustomFieldChange(field.key, e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-700 bg-zinc-950 text-zinc-100 text-sm focus:outline-none focus:border-zinc-400"
                  />
                ) : (
                  <input
                    type={field.field_type === "email" ? "email" : field.field_type === "url" ? "url" : "text"}
                    required={field.is_required}
                    value={val}
                    onChange={e => handleCustomFieldChange(field.key, e.target.value)}
                    placeholder={`Enter ${field.name.toLowerCase()}...`}
                    className="w-full px-3 py-2 border border-zinc-700 bg-zinc-950 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-400"
                  />
                )}
              </div>
            );
          })}

          <div className="pt-4 border-t border-zinc-800 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-zinc-800 text-xs font-semibold text-zinc-400 hover:bg-zinc-950 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-bold border border-zinc-200 text-xs font-bold shadow-sm transition disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : editMember ? "Update Record" : "Create Record"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
