import React, { useState } from "react";
import { useApp } from "../context/AppContext.js";
import { api } from "../services/api.js";
import { X, Building, AlertCircle } from "lucide-react";

interface NewHierarchyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewHierarchyModal: React.FC<NewHierarchyModalProps> = ({ isOpen, onClose }) => {
  const { refreshHierarchy, setCurrentHierarchy } = useApp();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [createRootLevel, setCreateRootLevel] = useState(true);
  const [rootLevelName, setRootLevelName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Hierarchy name is required");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const created = await api.createHierarchy({
        name: name.trim(),
        description: description.trim() || undefined
      });

      // Automatically create root level if enabled
      if (createRootLevel) {
        const lvlName = rootLevelName.trim() || `${name.trim()} Root`;
        await api.createLevel(created.id, {
          name: lvlName,
          code: lvlName.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32),
          color: "#4f46e5",
          icon: "Building",
          depth_order: 0,
          allowed_parent_level_ids: []
        });
      }

      await refreshHierarchy();
      await setCurrentHierarchy(created);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-800 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Building className="w-5 h-5 text-zinc-200" />
            <h3 className="text-base font-bold text-zinc-100">Create New Hierarchy</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-500 hover:text-zinc-400 hover:bg-zinc-850">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block font-bold text-zinc-300 uppercase tracking-wider mb-1">
              Hierarchy Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Supply Chain, University Department"
              className="w-full px-3 py-2 border border-zinc-700 bg-zinc-950 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-400 font-medium"
            />
          </div>

          <div>
            <label className="block font-bold text-zinc-300 uppercase tracking-wider mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Provide context for this hierarchy structure..."
              rows={2}
              className="w-full px-3 py-2 border border-zinc-700 bg-zinc-950 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-400"
            />
          </div>

          {/* Optional auto-provision root level */}
          <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 space-y-2">
            <label className="flex items-center space-x-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={createRootLevel}
                onChange={e => setCreateRootLevel(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 text-zinc-200 focus:ring-indigo-500"
              />
              <span className="text-xs font-bold text-zinc-200">
                Initialize with Root Level (Level 1)
              </span>
            </label>
            {createRootLevel && (
              <div>
                <label className="block text-[10px] font-semibold uppercase text-zinc-500 tracking-wider mb-1">
                  Root Level Name
                </label>
                <input
                  type="text"
                  value={rootLevelName}
                  onChange={e => setRootLevelName(e.target.value)}
                  placeholder={name.trim() ? `${name.trim()} Root` : "e.g. Headquarters, School, Organization"}
                  className="w-full px-3 py-1.5 border border-zinc-700 bg-zinc-950 text-zinc-100 placeholder-zinc-500 text-xs focus:outline-none focus:border-zinc-400 font-medium"
                />
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-zinc-800 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-zinc-800 font-semibold text-zinc-400 hover:bg-zinc-950 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-bold border border-zinc-200 font-bold shadow-sm transition disabled:opacity-50"
            >
              {isSubmitting ? "Creating..." : "Create Hierarchy"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
