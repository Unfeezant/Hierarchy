import React, { useState, useEffect } from "react";
import { Level, FieldType, FieldDefinition } from "../types/index.js";
import { api } from "../services/api.js";
import { X, AlertCircle, Plus, Tag, Trash2 } from "lucide-react";

interface DynamicColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (field: FieldDefinition) => void;
  level: Level;
  editField?: FieldDefinition | null;
}

export const DynamicColumnModal: React.FC<DynamicColumnModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  level,
  editField
}) => {
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("text");
  const [isRequired, setIsRequired] = useState(false);
  const [defaultValue, setDefaultValue] = useState("");
  const [isVisibleDefault, setIsVisibleDefault] = useState(true);
  const [optionsList, setOptionsList] = useState<string[]>([]);
  const [newOptionInput, setNewOptionInput] = useState("");
  const [calculationFormula, setCalculationFormula] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (editField) {
      setName(editField.name);
      setFieldType(editField.field_type);
      setIsRequired(editField.is_required);
      setDefaultValue(editField.default_value || "");
      setIsVisibleDefault(editField.is_visible_default);
      setOptionsList(editField.options || []);
      setCalculationFormula(editField.calculation_formula || "");
    } else {
      setName("");
      setFieldType("text");
      setIsRequired(false);
      setDefaultValue("");
      setIsVisibleDefault(true);
      setOptionsList([]);
      setCalculationFormula("");
    }
    setNewOptionInput("");
    setError(null);
  }, [isOpen, editField]);

  if (!isOpen) return null;

  const handleAddOption = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    const trimmed = newOptionInput.trim();
    if (!trimmed) return;
    if (optionsList.includes(trimmed)) {
      setError(`Option "${trimmed}" already exists.`);
      return;
    }
    setOptionsList(prev => [...prev, trimmed]);
    setNewOptionInput("");
    setError(null);
  };

  const handleRemoveOption = (indexToRemove: number) => {
    setOptionsList(prev => prev.filter((_, i) => i !== indexToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Column Name is required");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const options =
        fieldType === "single_select" || fieldType === "multi_select"
          ? optionsList
          : undefined;

      if (editField) {
        const updated = await api.updateField(editField.id, {
          name: name.trim(),
          is_required: isRequired,
          default_value: defaultValue.trim() || undefined,
          is_visible_default: isVisibleDefault,
          options,
          calculation_formula: fieldType === "calculated" ? calculationFormula.trim() : undefined
        });
        onSuccess(updated);
      } else {
        const created = await api.createField(level.id, {
          name: name.trim(),
          field_type: fieldType,
          is_required: isRequired,
          default_value: defaultValue.trim() || undefined,
          is_visible_default: isVisibleDefault,
          options,
          calculation_formula: fieldType === "calculated" ? calculationFormula.trim() : undefined
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

  const handleDelete = async () => {
    if (!editField) return;
    if (!window.confirm(`Are you sure you want to delete column "${editField.name}"? This action will permanently remove this field and all its values across records at this level.`)) {
      return;
    }
    try {
      setIsDeleting(true);
      setError(null);
      await api.deleteField(editField.id);
      onSuccess(editField);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-800 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-zinc-100">
              {editField ? `Edit Column: ${editField.name}` : `+ Add Column to ${level.name}`}
            </h3>
            <p className="text-xs text-zinc-500">
              {editField ? "Modify field properties, options domain, or formulas" : "Dynamically extends the level schema at runtime"}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-500 hover:text-zinc-400 hover:bg-zinc-850">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block font-bold text-zinc-300 uppercase tracking-wider mb-1">
              Column Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Employee ID, Department, Score"
              className="w-full px-3 py-2 border border-zinc-700 bg-zinc-950 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-400 font-medium"
            />
          </div>

          <div>
            <label className="block font-bold text-zinc-300 uppercase tracking-wider mb-1">
              Column Type
            </label>
            <select
              disabled={Boolean(editField)} // lock type once created to prevent data corruption
              value={fieldType}
              onChange={e => setFieldType(e.target.value as FieldType)}
              className="w-full px-3 py-2 border border-zinc-700 bg-zinc-950 text-zinc-100 text-sm focus:outline-none focus:border-zinc-400 disabled:bg-zinc-900 disabled:text-zinc-500"
            >
              <option value="text">Text</option>
              <option value="long_text">Long Text</option>
              <option value="number">Number (Integer)</option>
              <option value="decimal">Decimal</option>
              <option value="boolean">Boolean</option>
              <option value="date">Date</option>
              <option value="datetime">Date + Time</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="url">URL</option>
              <option value="single_select">Single Select</option>
              <option value="multi_select">Multi Select</option>
              <option value="file">File Attachment</option>
              <option value="image">Image</option>
              <option value="reference">Reference to another member</option>
              <option value="calculated">Calculated field</option>
            </select>
            {editField && (
              <span className="text-[10px] text-zinc-500 mt-0.5 block">Column type cannot be changed after creation to maintain data integrity.</span>
            )}
          </div>

          {/* Interactive Options Domain Manager for Select / Multi-Select */}
          {(fieldType === "single_select" || fieldType === "multi_select") && (
            <div className="p-3.5 rounded-xl border border-indigo-100 bg-zinc-800/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="block font-bold text-indigo-950 uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
                  <Tag className="w-3.5 h-3.5 text-zinc-200" />
                  <span>Acceptable Options / Values Domain ({optionsList.length})</span>
                </label>
                <span className="text-[10px] text-zinc-500">Allowed filler items</span>
              </div>

              {/* Existing options chips */}
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
                {optionsList.map((opt, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-indigo-800 text-xs font-semibold flex items-center space-x-1.5 shadow-xs"
                  >
                    <span>{opt}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(idx)}
                      className="text-zinc-500 hover:text-rose-600 p-0.5 rounded"
                      title="Remove option"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {optionsList.length === 0 && (
                  <span className="text-zinc-500 italic text-[11px]">No options configured yet. Add items below.</span>
                )}
              </div>

              {/* Add Option Input Row */}
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="text"
                  value={newOptionInput}
                  onChange={e => setNewOptionInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddOption();
                    }
                  }}
                  placeholder="e.g. Artificial Intelligence, Neuroscience..."
                  className="flex-1 px-3 py-1.5 border border-zinc-700 bg-zinc-950 text-zinc-100 placeholder-zinc-500 text-xs focus:outline-none focus:border-zinc-400"
                />
                <button
                  type="button"
                  onClick={handleAddOption}
                  className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-bold border border-zinc-200 font-bold text-xs flex items-center space-x-1 transition shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Item</span>
                </button>
              </div>
            </div>
          )}

          {fieldType === "calculated" && (
            <div>
              <label className="block font-bold text-zinc-300 uppercase tracking-wider mb-1">
                Calculation Formula
              </label>
              <input
                type="text"
                required
                value={calculationFormula}
                onChange={e => setCalculationFormula(e.target.value)}
                placeholder="e.g. {salary} * 0.15 + {bonus}"
                className="w-full px-3 py-2 border border-zinc-700 bg-zinc-950 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-400 font-mono"
              />
              <p className="text-[10px] text-zinc-500 mt-1">
                Use curly braces for other column keys, e.g. &#123;score&#125; / &#123;max_score&#125; * 100
              </p>
            </div>
          )}

          <div>
            <label className="block font-bold text-zinc-300 uppercase tracking-wider mb-1">
              Default Value (optional)
            </label>
            <input
              type="text"
              value={defaultValue}
              onChange={e => setDefaultValue(e.target.value)}
              placeholder="Leave empty if none"
              className="w-full px-3 py-2 border border-zinc-700 bg-zinc-950 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-400"
            />
          </div>

          <div className="pt-2 space-y-2">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isRequired}
                onChange={e => setIsRequired(e.target.checked)}
                className="rounded text-zinc-200 focus:ring-indigo-500 w-4 h-4"
              />
              <span className="font-semibold text-zinc-300">Required field</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isVisibleDefault}
                onChange={e => setIsVisibleDefault(e.target.checked)}
                className="rounded text-zinc-200 focus:ring-indigo-500 w-4 h-4"
              />
              <span className="font-semibold text-zinc-300">Visible by default in tables</span>
            </label>
          </div>

          <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
            {editField ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSubmitting || isDeleting}
                className="px-3 py-2 rounded-lg text-rose-600 hover:bg-rose-50 font-semibold text-xs flex items-center space-x-1.5 transition disabled:opacity-50 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? "Deleting..." : "Delete Column"}</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-zinc-800 font-semibold text-zinc-400 hover:bg-zinc-950 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isDeleting}
                className="px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-bold border border-zinc-200 font-bold shadow-sm transition disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : editField ? "Update Column" : "Create Column"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
