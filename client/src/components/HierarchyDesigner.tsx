import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext.js";
import { api } from "../services/api.js";
import { Level, FieldDefinition } from "../types/index.js";
import { DynamicIcon } from "./DynamicIcon.js";
import {
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Edit2,
  Sliders,
  Layers,
  Sparkles,
  GitBranch,
  Check,
  AlertCircle,
  X
} from "lucide-react";

interface HierarchyDesignerProps {
  onOpenAddColumn: (lvl: Level) => void;
  onOpenEditColumn?: (lvl: Level, field: FieldDefinition) => void;
}

export const HierarchyDesigner: React.FC<HierarchyDesignerProps> = ({ onOpenAddColumn, onOpenEditColumn }) => {
  const { currentHierarchy, levels, refreshLevels, currentUser } = useApp();
  const [selectedLevel, setSelectedLevel] = useState<Level | null>(null);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [isLoadingFields, setIsLoadingFields] = useState(false);

  // Level modal state (for both Add and Edit)
  const [showAddLevelModal, setShowAddLevelModal] = useState(false);
  const [editingLevel, setEditingLevel] = useState<Level | null>(null);
  const [newLevelName, setNewLevelName] = useState("");
  const [newLevelCode, setNewLevelCode] = useState("");
  const [newLevelDesc, setNewLevelDesc] = useState("");
  const [newLevelIcon, setNewLevelIcon] = useState("Folder");
  const [newLevelColor, setNewLevelColor] = useState("#6366f1");
  const [allowedParentIds, setAllowedParentIds] = useState<string[]>([]);

  // Open modal in Add mode with smart default parent (preceding level)
  const handleOpenAddLevel = () => {
    setEditingLevel(null);
    setNewLevelName("");
    setNewLevelCode("");
    setNewLevelDesc("");
    setNewLevelIcon("Folder");
    setNewLevelColor("#6366f1");
    // Default to preceding level if any levels exist!
    if (levels.length > 0) {
      setAllowedParentIds([levels[levels.length - 1].id]);
    } else {
      setAllowedParentIds([]);
    }
    setModalError(null);
    setShowAddLevelModal(true);
  };

  // Open modal in Edit mode to change name, icon, color, or parent branching rules
  const handleOpenEditLevel = (lvl: Level) => {
    setEditingLevel(lvl);
    setNewLevelName(lvl.name);
    setNewLevelCode(lvl.code);
    setNewLevelDesc(lvl.description || "");
    setNewLevelIcon(lvl.icon || "Folder");
    setNewLevelColor(lvl.color || "#6366f1");
    setAllowedParentIds(lvl.allowed_parent_level_ids || []);
    setModalError(null);
    setShowAddLevelModal(true);
  };
  const [modalError, setModalError] = useState<string | null>(null);
  const [isCreatingLevel, setIsCreatingLevel] = useState(false);

  useEffect(() => {
    if (levels.length > 0 && !selectedLevel) {
      setSelectedLevel(levels[0]);
    } else if (levels.length > 0 && selectedLevel) {
      const refreshed = levels.find(l => l.id === selectedLevel.id) || levels[0];
      setSelectedLevel(refreshed);
    }
  }, [levels]);

  useEffect(() => {
    async function loadFields() {
      if (!selectedLevel) {
        setFields([]);
        return;
      }
      try {
        setIsLoadingFields(true);
        const data = await api.getFields(selectedLevel.id);
        setFields(data);
      } catch (err) {
        console.error("Failed to load fields", err);
      } finally {
        setIsLoadingFields(false);
      }
    }
    loadFields();
  }, [selectedLevel]);

  // Reorder levels
  const handleMoveLevel = async (index: number, direction: "up" | "down") => {
    if (!currentHierarchy) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= levels.length) return;

    const reordered = [...levels];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    const levelIds = reordered.map(l => l.id);
    await api.reorderLevels(currentHierarchy.id, levelIds);
    await refreshLevels();
  };

  const handleDeleteLevel = async (lvl: Level) => {
    if (!window.confirm(`Are you sure you want to delete level "${lvl.name}"?`)) return;
    try {
      await api.deleteLevel(lvl.id);
      await refreshLevels();
      setSelectedLevel(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    if (!window.confirm("Are you sure you want to delete this column?")) return;
    try {
      await api.deleteField(fieldId);
      if (selectedLevel) {
        const refreshed = await api.getFields(selectedLevel.id);
        setFields(refreshed);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateLevel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHierarchy || !newLevelName.trim()) return;

    try {
      setIsCreatingLevel(true);
      setModalError(null);

      if (editingLevel) {
        await api.updateLevel(editingLevel.id, {
          name: newLevelName.trim(),
          code: newLevelCode.trim() || newLevelName.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
          description: newLevelDesc.trim() || undefined,
          icon: newLevelIcon,
          color: newLevelColor,
          allowed_parent_level_ids: allowedParentIds
        });
      } else {
        await api.createLevel(currentHierarchy.id, {
          name: newLevelName.trim(),
          code: newLevelCode.trim() || newLevelName.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
          description: newLevelDesc.trim() || undefined,
          icon: newLevelIcon,
          color: newLevelColor,
          allowed_parent_level_ids: allowedParentIds
        });
      }

      await refreshLevels();
      setShowAddLevelModal(false);
      setEditingLevel(null);
      setNewLevelName("");
      setNewLevelCode("");
      setNewLevelDesc("");
      setAllowedParentIds([]);
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setIsCreatingLevel(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900 p-6 rounded-2xl border border-zinc-800 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-zinc-100 flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-zinc-200" />
            <span>Administrative Hierarchy Designer</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Configure levels, multiple child branching rules, and dynamic field schemas in real time
          </p>
        </div>

        <button
          onClick={handleOpenAddLevel}
          className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-bold border border-zinc-200 font-bold text-xs flex items-center space-x-1.5 shadow-sm shadow-indigo-200 transition"
        >
          <Plus className="w-4 h-4" />
          <span>+ Add New Level</span>
        </button>
      </div>

      {/* Two Column Layout: Levels on Left, Schema Details on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Levels Reordering & Branching List */}
        <div className="lg:col-span-5 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-sm p-5 space-y-3">
          <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
            Hierarchy Level Structure ({levels.length} Levels)
          </div>

          <div className="space-y-2">
            {levels.map((lvl, index) => {
              const isSelected = selectedLevel?.id === lvl.id;
              const parentNames = lvl.allowed_parent_level_ids.map(
                pid => levels.find(l => l.id === pid)?.name
              ).filter(Boolean);

              return (
                <div
                  key={lvl.id}
                  onClick={() => setSelectedLevel(lvl)}
                  className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? "bg-zinc-800/70 border-zinc-700 shadow-xs"
                      : "bg-zinc-900 border-zinc-800/80 hover:bg-zinc-950"
                  }`}
                >
                  <div className="flex items-center space-x-3 truncate">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white"
                      style={{ backgroundColor: lvl.color || "#6366f1" }}
                    >
                      <DynamicIcon name={lvl.icon || "Folder"} className="w-4 h-4" />
                    </div>

                    <div className="truncate text-left">
                      <div className="font-bold text-xs text-zinc-100 truncate flex items-center space-x-1.5">
                        <span>{lvl.name}</span>
                        <span className="text-[10px] text-zinc-500 font-normal">
                          (Level {index + 1})
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                        {parentNames.length > 0 ? (
                          <span>Child of: {parentNames.join(", ")}</span>
                        ) : (
                          <span className="text-zinc-200 font-medium">Root Level</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Reorder, Edit, and Delete Controls */}
                  <div className="flex items-center space-x-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => handleOpenEditLevel(lvl)}
                      className="p-1 rounded hover:bg-slate-200 text-zinc-500 hover:text-zinc-200 transition"
                      title="Edit Level & Branching Rules"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      disabled={index === 0}
                      onClick={() => handleMoveLevel(index, "up")}
                      className="p-1 rounded hover:bg-slate-200 text-zinc-500 disabled:opacity-20"
                      title="Move Up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      disabled={index === levels.length - 1}
                      onClick={() => handleMoveLevel(index, "down")}
                      className="p-1 rounded hover:bg-slate-200 text-zinc-500 disabled:opacity-20"
                      title="Move Down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteLevel(lvl)}
                      className="p-1 rounded hover:bg-rose-50 text-zinc-500 hover:text-rose-600"
                      title="Delete Level"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Level Schema & Fields Editor */}
        <div className="lg:col-span-7 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-sm p-6 space-y-6">
          {selectedLevel ? (
            <>
              {/* Level Info Header */}
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                <div className="flex items-center space-x-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                    style={{ backgroundColor: selectedLevel.color || "#6366f1" }}
                  >
                    <DynamicIcon name={selectedLevel.icon || "Folder"} className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-zinc-100">
                      {selectedLevel.name} Schema Definition
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Code: <code className="font-mono">{selectedLevel.code}</code> � {selectedLevel.member_count || 0} active records
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => onOpenAddColumn(selectedLevel)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-bold border border-zinc-200 font-semibold text-xs flex items-center space-x-1.5 shadow-sm transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add Column</span>
                </button>
              </div>

              {/* Dynamic Field Definitions List */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  Configured Dynamic Columns ({fields.length})
                </div>

                {isLoadingFields ? (
                  <div className="py-8 text-center text-xs text-zinc-500">Loading fields...</div>
                ) : fields.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-500 border border-dashed rounded-xl">
                    No custom fields configured for this level. Click "+ Add Column" to define one.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-zinc-800 rounded-xl overflow-hidden">
                    {fields.map(f => (
                      <div key={f.id} className="p-3.5 flex items-center justify-between hover:bg-zinc-950 text-xs">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-zinc-100">{f.name}</span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-zinc-850 text-zinc-400">
                              {f.field_type}
                            </span>
                            {f.is_required && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-50 text-rose-600">
                                Required
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                            key: {f.key} {f.default_value && `� default: "${f.default_value}"`}
                            {f.options && f.options.length > 0 && ` � options: [${f.options.join(", ")}]`}
                            {f.calculation_formula && ` � formula: ${f.calculation_formula}`}
                          </div>
                        </div>

                        <div className="flex items-center space-x-1">
                          {onOpenEditColumn && (
                            <button
                              onClick={() => selectedLevel && onOpenEditColumn(selectedLevel, f)}
                              className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded transition"
                              title="Edit Column & Options"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteField(f.id)}
                            className="p-1 text-zinc-500 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                            title="Delete Field"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-xs text-zinc-500">
              Select a level to view and edit its schema fields.
            </div>
          )}
        </div>
      </div>

      {/* Add Level Modal */}
      {showAddLevelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-800 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-100">
                {editingLevel ? `Edit Level: ${editingLevel.name}` : "+ Add New Level"}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddLevelModal(false)}
                className="p-1 rounded-lg text-zinc-500 hover:text-zinc-400 hover:bg-zinc-850 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLevel} className="p-6 space-y-4 text-xs">
              {modalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label className="block font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Level Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newLevelName}
                  onChange={e => setNewLevelName(e.target.value)}
                  placeholder="e.g. Department, Team, Project"
                  className="w-full px-3 py-2 border border-zinc-700 bg-zinc-950 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-400 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={newLevelDesc}
                  onChange={e => setNewLevelDesc(e.target.value)}
                  placeholder="Brief description of this level role"
                  className="w-full px-3 py-2 border border-zinc-700 bg-zinc-950 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    Color Accent
                  </label>
                  <input
                    type="color"
                    value={newLevelColor}
                    onChange={e => setNewLevelColor(e.target.value)}
                    className="w-full h-9 border border-zinc-700 bg-zinc-950 cursor-pointer p-0.5"
                  />
                </div>

                <div>
                  <label className="block font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    Icon
                  </label>
                  <select
                    value={newLevelIcon}
                    onChange={e => setNewLevelIcon(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-700 bg-zinc-950 text-zinc-100 text-sm focus:outline-none focus:border-zinc-400"
                  >
                    <option value="Folder">Folder</option>
                    <option value="Building">Building / School</option>
                    <option value="UserCheck">Executive / Principal</option>
                    <option value="GraduationCap">Teacher / Academic</option>
                    <option value="BookOpen">Class / Course</option>
                    <option value="Users">Student / User</option>
                    <option value="Award">Award / Mark</option>
                    <option value="Briefcase">Company / Work</option>
                    <option value="Globe">Planet / Country</option>
                  </select>
                </div>
              </div>

              {/* Branching: Allowed Parent Levels */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-zinc-300 uppercase tracking-wider">
                    Parent Level in Hierarchy
                  </label>
                  <span className="text-[10px] font-semibold text-zinc-500">
                    {allowedParentIds.length === 0 ? "Configured as Root Level" : `Child of ${allowedParentIds.length} level(s)`}
                  </span>
                </div>

                <div className="border border-zinc-800 rounded-xl p-2.5 space-y-2 bg-zinc-950/50">
                  {/* Option to explicitly make it a Root level */}
                  <label className="flex items-center space-x-2 cursor-pointer pb-2 border-b border-zinc-800 text-xs font-semibold text-zinc-300 select-none">
                    <input
                      type="checkbox"
                      checked={allowedParentIds.length === 0}
                      onChange={e => {
                        if (e.target.checked) {
                          setAllowedParentIds([]);
                        } else if (levels.length > 0) {
                          const candidate = levels.find(l => l.id !== editingLevel?.id);
                          setAllowedParentIds(candidate ? [candidate.id] : []);
                        }
                      }}
                      className="rounded text-zinc-200 focus:ring-indigo-500"
                    />
                    <span>Make this a Root Level (Has No Parent)</span>
                  </label>

                  {/* Available parent candidates */}
                  <div className="space-y-1 pt-1 max-h-36 overflow-y-auto">
                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                      Or select parent level(s) (supports branching):
                    </div>
                    {levels
                      .filter(l => l.id !== editingLevel?.id)
                      .map((l, lIdx) => {
                        const isChecked = allowedParentIds.includes(l.id);
                        return (
                          <label
                            key={l.id}
                            className={`flex items-center space-x-2 cursor-pointer p-1.5 rounded-lg text-xs transition select-none ${
                              isChecked ? "bg-zinc-800/80 font-semibold text-indigo-900 border border-zinc-700" : "hover:bg-zinc-850 text-zinc-300"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={e => {
                                if (e.target.checked) {
                                  setAllowedParentIds([...allowedParentIds, l.id]);
                                } else {
                                  setAllowedParentIds(allowedParentIds.filter(id => id !== l.id));
                                }
                              }}
                              className="rounded text-zinc-200 focus:ring-indigo-500"
                            />
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color || "#6366f1" }} />
                            <span>{l.name}</span>
                            <span className="text-[10px] text-zinc-500 font-normal">
                              (Level {levels.indexOf(l) + 1})
                            </span>
                          </label>
                        );
                      })}
                    {levels.length === 0 && (
                      <div className="text-zinc-500 italic text-xs">
                        This is the first level and will be the Root Level.
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-zinc-500 mt-1">
                  By default, each level branches under the preceding level. You can select multiple parents if this level supports multi-parent branches.
                </p>
              </div>

              <div className="pt-4 border-t border-zinc-800 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAddLevelModal(false)}
                  className="px-4 py-2 rounded-lg border border-zinc-800 font-semibold text-zinc-400 hover:bg-zinc-950 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingLevel}
                  className="px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-bold border border-zinc-200 font-bold shadow-sm transition disabled:opacity-50"
                >
                  {isCreatingLevel ? "Saving..." : (editingLevel ? "Save Level Changes" : "Create Level")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
