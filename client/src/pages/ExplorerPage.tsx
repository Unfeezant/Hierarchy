import React, { useState } from "react";
import { useApp } from "../context/AppContext.js";
import { Member, Level, FieldDefinition } from "../types/index.js";
import { TreeView } from "../components/TreeView.js";
import { PyramidView } from "../components/PyramidView.js";
import { TableView } from "../components/TableView.js";
import { MemberDetailView } from "../components/MemberDetailView.js";
import { DynamicMemberModal } from "../components/DynamicMemberModal.js";
import { DynamicColumnModal } from "../components/DynamicColumnModal.js";
import { MoveMemberModal } from "../components/MoveMemberModal.js";
import { ImportModal } from "../components/ImportModal.js";
import { api } from "../services/api.js";
import { Network, Layers, Table, UserCheck, Plus, Building, AlertCircle, X } from "lucide-react";

export const ExplorerPage: React.FC = () => {
  const {
    currentHierarchy,
    levels,
    activeLevel,
    activeMember,
    selectMember,
    viewMode,
    setViewMode,
    refreshLevels
  } = useApp();

  // Modals state
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberModalLevel, setMemberModalLevel] = useState<Level | null>(null);
  const [memberModalParent, setMemberModalParent] = useState<Member | null>(null);
  const [memberModalEdit, setMemberModalEdit] = useState<Member | null>(null);

  const [showColumnModal, setShowColumnModal] = useState(false);
  const [columnModalLevel, setColumnModalLevel] = useState<Level | null>(null);
  const [columnModalEditField, setColumnModalEditField] = useState<FieldDefinition | null>(null);

  // Quick root level creation when hierarchy has 0 levels
  const [showCreateRootLevelModal, setShowCreateRootLevelModal] = useState(false);
  const [newRootLevelName, setNewRootLevelName] = useState("");
  const [isCreatingRootLevel, setIsCreatingRootLevel] = useState(false);
  const [rootLevelError, setRootLevelError] = useState<string | null>(null);

  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveTargetMember, setMoveTargetMember] = useState<Member | null>(null);

  const [showImportModal, setShowImportModal] = useState(false);

  // Handlers
  const handleAddRoot = () => {
    if (levels.length === 0) {
      setNewRootLevelName(currentHierarchy?.name ? `${currentHierarchy.name} Root` : "Root Level");
      setRootLevelError(null);
      setShowCreateRootLevelModal(true);
      return;
    }
    setMemberModalLevel(levels[0]);
    setMemberModalParent(null);
    setMemberModalEdit(null);
    setShowMemberModal(true);
  };

  const handleCreateRootLevelAndMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHierarchy) return;
    const nameToUse = newRootLevelName.trim() || "Root Level";
    try {
      setIsCreatingRootLevel(true);
      setRootLevelError(null);
      const createdLevel = await api.createLevel(currentHierarchy.id, {
        name: nameToUse,
        code: nameToUse.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32),
        color: "#71717a",
        icon: "Building",
        depth_order: 0,
        allowed_parent_level_ids: []
      });
      await refreshLevels();
      setShowCreateRootLevelModal(false);
      // Immediately open member modal for this brand-new root level
      setMemberModalLevel(createdLevel);
      setMemberModalParent(null);
      setMemberModalEdit(null);
      setShowMemberModal(true);
    } catch (err: any) {
      setRootLevelError(err.message);
    } finally {
      setIsCreatingRootLevel(false);
    }
  };

  const handleAddChild = (parent: Member) => {
    const parentLevel = levels.find(l => l.id === parent.level_id);
    let candidateChildLevels = levels.filter(
      l => l.allowed_parent_level_ids && l.allowed_parent_level_ids.includes(parent.level_id)
    );

    const anyExplicitRules = levels.some(l => l.allowed_parent_level_ids && l.allowed_parent_level_ids.length > 0);
    if (candidateChildLevels.length === 0 && !anyExplicitRules && parentLevel) {
      const nextIdx = levels.indexOf(parentLevel) + 1;
      if (nextIdx < levels.length) {
        candidateChildLevels = [levels[nextIdx]];
      }
    }

    if (candidateChildLevels.length === 0) {
      alert(`Cannot add child record: no subordinate level is configured under "${parent.level_name || parentLevel?.name || "this level"}". Configure subordinate levels in Configure Levels.`);
      return;
    }

    const targetLevel = candidateChildLevels[0];
    setMemberModalLevel(targetLevel);
    setMemberModalParent(parent);
    setMemberModalEdit(null);
    setShowMemberModal(true);
  };

  const handleEditMember = (m: Member) => {
    const lvl = levels.find(l => l.id === m.level_id);
    if (!lvl) return;
    setMemberModalLevel(lvl);
    setMemberModalParent(null);
    setMemberModalEdit(m);
    setShowMemberModal(true);
  };

  const handleMoveMember = (m: Member) => {
    setMoveTargetMember(m);
    setShowMoveModal(true);
  };

  const handleDeleteMember = async (m: Member) => {
    if (!window.confirm(`Are you sure you want to delete "${m.name}" and all its descendants? This action cannot be undone.`)) {
      return;
    }
    try {
      await api.deleteMember(m.id);
      await refreshLevels();
      if (activeMember?.id === m.id) {
        selectMember(null);
      }
    } catch (err: any) {
      alert("Delete failed: " + err.message);
    }
  };

  const handleAddColumn = (lvl?: Level) => {
    const target = lvl || activeLevel || levels[0];
    if (!target) return;
    setColumnModalLevel(target);
    setColumnModalEditField(null);
    setShowColumnModal(true);
  };

  const handleEditColumn = (field: FieldDefinition, lvl?: Level) => {
    const target = lvl || activeLevel || levels[0];
    if (!target) return;
    setColumnModalLevel(target);
    setColumnModalEditField(field);
    setShowColumnModal(true);
  };

  return (
    <div className="space-y-4">
      {/* Visualization Mode Selector */}
      <div className="flex items-center justify-between bg-zinc-900 px-4 py-2.5 border border-zinc-800">
        <div className="flex items-center space-x-1 sm:space-x-2">
          <button
            onClick={() => setViewMode("tree")}
            className={`px-3 py-1.5 font-bold text-xs flex items-center space-x-1.5 transition cursor-pointer border ${
              viewMode === "tree"
                ? "bg-zinc-100 text-zinc-950 border-zinc-200"
                : "text-zinc-400 border-transparent hover:bg-zinc-800 hover:text-zinc-100"
            }`}
          >
            <Network className="w-4 h-4" />
            <span>Tree View</span>
          </button>

          <button
            onClick={() => setViewMode("pyramid")}
            className={`px-3 py-1.5 font-bold text-xs flex items-center space-x-1.5 transition cursor-pointer border ${
              viewMode === "pyramid"
                ? "bg-zinc-100 text-zinc-950 border-zinc-200"
                : "text-zinc-400 border-transparent hover:bg-zinc-800 hover:text-zinc-100"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Pyramid Tiers</span>
          </button>

          <button
            onClick={() => setViewMode("table")}
            className={`px-3 py-1.5 font-bold text-xs flex items-center space-x-1.5 transition cursor-pointer border ${
              viewMode === "table"
                ? "bg-zinc-100 text-zinc-950 border-zinc-200"
                : "text-zinc-400 border-transparent hover:bg-zinc-800 hover:text-zinc-100"
            }`}
          >
            <Table className="w-4 h-4" />
            <span>Level Table</span>
          </button>

          {activeMember && (
            <button
              onClick={() => setViewMode("detail")}
              className={`px-3 py-1.5 font-bold text-xs flex items-center space-x-1.5 transition cursor-pointer border ${
                viewMode === "detail"
                  ? "bg-zinc-100 text-zinc-950 border-zinc-200"
                  : "text-zinc-400 border-transparent hover:bg-zinc-800 hover:text-zinc-100"
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span className="truncate max-w-[120px]">{activeMember.name}</span>
            </button>
          )}
        </div>

        <div className="text-xs text-zinc-500 font-medium hidden sm:block">
          Active: <strong className="text-zinc-200">{currentHierarchy?.name}</strong>
        </div>
      </div>

      {/* Render Active Explorer Mode */}
      {viewMode === "tree" && (
        <TreeView
          onAddRoot={handleAddRoot}
          onAddChild={handleAddChild}
          onEdit={handleEditMember}
          onMove={handleMoveMember}
          onDelete={handleDeleteMember}
        />
      )}

      {viewMode === "pyramid" && <PyramidView />}

      {viewMode === "table" && (
        <TableView
          onAddMember={() => {
            if (activeLevel) {
              setMemberModalLevel(activeLevel);
              setMemberModalParent(null);
              setMemberModalEdit(null);
              setShowMemberModal(true);
            }
          }}
          onAddColumn={() => handleAddColumn(activeLevel || undefined)}
          onEditColumn={(field) => handleEditColumn(field, activeLevel || undefined)}
          onEditMember={handleEditMember}
          onMoveMember={handleMoveMember}
          onDeleteMember={handleDeleteMember}
          onOpenImport={() => setShowImportModal(true)}
        />
      )}

      {viewMode === "detail" && (
        <MemberDetailView
          onEdit={handleEditMember}
          onMove={handleMoveMember}
          onDelete={handleDeleteMember}
          onAddChild={handleAddChild}
        />
      )}

      {/* Modals */}
      {showMemberModal && memberModalLevel && currentHierarchy && (
        <DynamicMemberModal
          isOpen={showMemberModal}
          onClose={() => setShowMemberModal(false)}
          onSuccess={async (m) => {
            await refreshLevels();
            selectMember(m);
          }}
          hierarchyId={currentHierarchy.id}
          level={memberModalLevel}
          parentMember={memberModalParent}
          editMember={memberModalEdit}
        />
      )}

      {showColumnModal && columnModalLevel && (
        <DynamicColumnModal
          isOpen={showColumnModal}
          onClose={() => setShowColumnModal(false)}
          onSuccess={async () => {
            await refreshLevels();
          }}
          level={columnModalLevel}
          editField={columnModalEditField}
        />
      )}

      {showMoveModal && moveTargetMember && (
        <MoveMemberModal
          isOpen={showMoveModal}
          onClose={() => setShowMoveModal(false)}
          onSuccess={async (updated) => {
            await refreshLevels();
            selectMember(updated);
          }}
          member={moveTargetMember}
          levels={levels}
        />
      )}

      {showImportModal && activeLevel && currentHierarchy && (
        <ImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onSuccess={async () => {
            await refreshLevels();
          }}
          hierarchyId={currentHierarchy.id}
          level={activeLevel}
        />
      )}

      {/* Create Root Level First Modal */}
      {showCreateRootLevelModal && currentHierarchy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
              <div className="flex items-center space-x-2">
                <Building className="w-5 h-5 text-zinc-300" />
                <h3 className="text-base font-bold text-zinc-100">Initialize Root Level</h3>
              </div>
              <button
                onClick={() => setShowCreateRootLevelModal(false)}
                className="p-1 text-zinc-500 hover:text-zinc-200 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRootLevelAndMember} className="p-6 space-y-4 text-xs bg-zinc-900">
              <div className="p-3 bg-zinc-850 border border-zinc-700 text-zinc-300 leading-relaxed">
                Every hierarchy requires at least one <strong>root level</strong> (e.g. Headquarters, School, Country, Company) before root records can be added.
              </div>

              {rootLevelError && (
                <div className="p-3 bg-red-950 border border-red-800 text-red-300 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{rootLevelError}</span>
                </div>
              )}

              <div>
                <label className="block font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Root Level Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newRootLevelName}
                  onChange={e => setNewRootLevelName(e.target.value)}
                  placeholder="e.g. Headquarters, Main School, Root Company"
                  className="w-full px-3 py-2 border border-zinc-800 bg-zinc-950 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500 font-medium"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  This will be Level 1 in the <strong>{currentHierarchy.name}</strong> hierarchy.
                </p>
              </div>

              <div className="pt-4 border-t border-zinc-800 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateRootLevelModal(false)}
                  className="px-4 py-2 border border-zinc-800 font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingRootLevel}
                  className="px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-950 font-bold transition disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer border border-zinc-200"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isCreatingRootLevel ? "Creating..." : "Create Level & Add Member"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
