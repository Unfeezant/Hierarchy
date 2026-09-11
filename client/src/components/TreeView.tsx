import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext.js";
import { api } from "../services/api.js";
import { Member } from "../types/index.js";
import { DynamicIcon } from "./DynamicIcon.js";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Edit2,
  Move,
  Trash2,
  Folder,
  Layers,
  Sparkles,
  Search
} from "lucide-react";

interface TreeNodeProps {
  member: Member;
  levelIndex: number;
  onSelectMember: (m: Member) => void;
  onAddChild: (parent: Member) => void;
  onEdit: (m: Member) => void;
  onMove: (m: Member) => void;
  onDelete: (m: Member) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  member,
  levelIndex,
  onSelectMember,
  onAddChild,
  onEdit,
  onMove,
  onDelete
}) => {
  const { displayMode, activeMember, currentUser, levels } = useApp();

  const subordinateLevels = levels.filter(l => l.allowed_parent_level_ids && l.allowed_parent_level_ids.includes(member.level_id));
  const anyExplicitRules = levels.some(l => l.allowed_parent_level_ids && l.allowed_parent_level_ids.length > 0);
  const memberLevelIdx = levels.findIndex(l => l.id === member.level_id);
  const hasSubordinate = subordinateLevels.length > 0 || (!anyExplicitRules && memberLevelIdx !== -1 && memberLevelIdx + 1 < levels.length);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [children, setChildren] = useState<Member[]>([]);
  const [isLoadingChildren, setIsLoadingChildren] = useState<boolean>(false);
  const [hasLoaded, setHasLoaded] = useState<boolean>(false);

  const isSelected = activeMember?.id === member.id;
  const canCreate = currentUser?.role.name === "Super Admin" || currentUser?.role.permissions.includes("member:create");
  const canEdit = currentUser?.role.name === "Super Admin" || currentUser?.role.permissions.includes("member:edit");
  const canMove = currentUser?.role.name === "Super Admin" || currentUser?.role.permissions.includes("member:move");
  const canDelete = currentUser?.role.name === "Super Admin" || currentUser?.role.permissions.includes("member:delete");

  const toggleExpand = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isExpanded && !hasLoaded) {
      setIsLoadingChildren(true);
      try {
        const fetched = await api.getChildren(member.id);
        setChildren(fetched);
        setHasLoaded(true);
      } catch (err) {
        console.error("Failed to fetch children", err);
      } finally {
        setIsLoadingChildren(false);
      }
    }
    setIsExpanded(!isExpanded);
  };

  const handleNodeClick = () => {
    onSelectMember(member);
  };

  return (
    <div className="select-none text-sm">
      <div
        onClick={handleNodeClick}
        style={{ paddingLeft: `${levelIndex * 24 + 12}px` }}
        className={`flex items-center justify-between py-2 pr-4 my-0.5 cursor-pointer transition group border ${
          isSelected
            ? "bg-zinc-800 border-zinc-700 text-white"
            : "hover:bg-zinc-850/60 border-transparent text-zinc-300"
        }`}
      >
        <div className="flex items-center space-x-2 truncate">
          {/* Expand/Collapse Toggle */}
          <button
            onClick={toggleExpand}
            className={`w-6 h-6 flex items-center justify-center hover:bg-zinc-700 text-zinc-500 transition cursor-pointer ${
              member.children_count === 0 ? "opacity-25 cursor-default" : ""
            }`}
            disabled={member.children_count === 0}
          >
            {isLoadingChildren ? (
              <div className="w-3 h-3 border-2 border-zinc-400 border-t-transparent animate-spin" />
            ) : isExpanded ? (
              <ChevronDown className="w-4 h-4 text-zinc-300" />
            ) : (
              <ChevronRight className="w-4 h-4 text-zinc-300" />
            )}
          </button>

          {/* Level Color Badge & Icon */}
          <div
            className="w-6 h-6 border border-zinc-700 bg-zinc-800 text-zinc-300 flex items-center justify-center shrink-0"
          >
            <DynamicIcon name="Folder" className="w-3 h-3" />
          </div>

          {/* Member Name */}
          <span className="font-semibold tracking-tight truncate group-hover:text-white">
            {member.name}
          </span>

          {/* Level Tag */}
          <span
            className="px-1.5 py-0.2 text-[10px] font-mono border border-zinc-700 bg-zinc-800 text-zinc-400"
          >
            {member.level_name}
          </span>

          {/* Children count badge */}
          {member.children_count !== undefined && member.children_count > 0 && (
            <span className="px-1.5 py-0.2 text-[9px] font-mono font-semibold bg-zinc-850 border border-zinc-750 text-zinc-400">
              {member.children_count} {member.children_count === 1 ? "child" : "children"}
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition">
          {canCreate && hasSubordinate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddChild(member);
              }}
              className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-700 transition cursor-pointer"
              title={`Add child record (${subordinateLevels.map(s => s.name).join(", ")})`}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          {canEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(member);
              }}
              className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-700 transition cursor-pointer"
              title="Edit record"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          {canMove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMove(member);
              }}
              className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-700 transition cursor-pointer"
              title="Move / Re-parent record"
            >
              <Move className="w-3.5 h-3.5" />
            </button>
          )}
          {canDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(member);
              }}
              className="p-1 text-zinc-400 hover:text-red-400 hover:bg-zinc-700 transition cursor-pointer"
              title="Delete record & descendants"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Mode B: Details Preview if enabled */}
      {displayMode === "details" && Object.keys(member.custom_data || {}).length > 0 && (
        <div
          style={{ paddingLeft: `${levelIndex * 24 + 48}px` }}
          className="py-1 px-3 mb-1 text-xs text-zinc-400 flex flex-wrap gap-2"
        >
          {Object.entries(member.custom_data).map(([k, v]) => (
            <div key={k} className="border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[10px]">
              <span className="font-semibold text-zinc-500">{k}: </span>
              <span className="text-zinc-200">{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Render children when expanded */}
      {isExpanded && children.length > 0 && (
        <div className="border-l border-zinc-800 ml-4">
          {children.map(child => (
            <TreeNode
              key={child.id}
              member={child}
              levelIndex={levelIndex + 1}
              onSelectMember={onSelectMember}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onMove={onMove}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface TreeViewProps {
  onAddRoot: () => void;
  onAddChild: (parent: Member) => void;
  onEdit: (m: Member) => void;
  onMove: (m: Member) => void;
  onDelete: (m: Member) => void;
}

export const TreeView: React.FC<TreeViewProps> = ({
  onAddRoot,
  onAddChild,
  onEdit,
  onMove,
  onDelete
}) => {
  const {
    currentHierarchy,
    levels,
    selectMember,
    displayMode,
    setDisplayMode,
    currentUser
  } = useApp();

  const [roots, setRoots] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Member[] | null>(null);

  const canCreate = currentUser?.role.name === "Super Admin" || currentUser?.role.permissions.includes("member:create");

  const loadRoots = async () => {
    if (!currentHierarchy) return;
    try {
      setIsLoading(true);
      const rootMembers = await api.getRoots(currentHierarchy.id);
      setRoots(rootMembers);
    } catch (err) {
      console.error("Failed to load root members", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRoots();
  }, [currentHierarchy, levels]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !currentHierarchy) {
      setSearchResults(null);
      return;
    }
    try {
      setIsLoading(true);
      const results = await api.searchMembers(searchQuery, currentHierarchy.id);
      setSearchResults(results);
    } catch (err) {
      console.error("Failed searching tree", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-6 flex flex-col min-h-[500px]">
      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-zinc-800 gap-3">
        <div className="flex items-center space-x-3">
          <h2 className="text-lg font-bold text-zinc-100 flex items-center space-x-2">
            <Folder className="w-5 h-5 text-zinc-400" />
            <span>Hierarchy Explorer</span>
          </h2>

          {/* Display Mode Toggle */}
          <div className="flex items-center border border-zinc-700 bg-zinc-800 p-0.5 text-xs">
            <button
              onClick={() => setDisplayMode("compact")}
              className={`px-2.5 py-1 font-semibold transition cursor-pointer ${
                displayMode === "compact"
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Compact
            </button>
            <button
              onClick={() => setDisplayMode("details")}
              className={`px-2.5 py-1 font-semibold transition cursor-pointer ${
                displayMode === "details"
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Attributes
            </button>
          </div>
        </div>

        {/* Search & Actions */}
        <div className="flex items-center space-x-2">
          <form onSubmit={handleSearch} className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search tree..."
              className="pl-8 pr-3 py-1.5 border border-zinc-800 bg-zinc-950 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 placeholder:text-zinc-600 w-44 sm:w-60"
            />
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          </form>

          {canCreate && (
            <button
              onClick={onAddRoot}
              className="px-3 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs flex items-center space-x-1.5 transition cursor-pointer border border-zinc-200"
              title="Add a top-level root record"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Root</span>
            </button>
          )}
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto pr-2">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500 text-xs space-y-2">
            <div className="w-5 h-5 border-2 border-zinc-400 border-t-transparent animate-spin" />
            <span>Loading tree structure...</span>
          </div>
        ) : searchResults !== null ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <span className="text-xs font-bold text-zinc-300">
                Search Results ({searchResults.length})
              </span>
              <button
                onClick={() => setSearchResults(null)}
                className="text-xs text-zinc-400 hover:underline cursor-pointer"
              >
                Clear Search
              </button>
            </div>
            {searchResults.length === 0 ? (
              <div className="py-8 text-center text-zinc-500 text-xs">
                No matching members found.
              </div>
            ) : (
              searchResults.map(member => (
                <div
                  key={member.id}
                  onClick={() => selectMember(member)}
                  className="p-3 border border-zinc-800 bg-zinc-950 hover:bg-zinc-850 cursor-pointer flex items-center justify-between group transition"
                >
                  <div>
                    <div className="font-semibold text-zinc-200 group-hover:text-white text-sm">
                      {member.name}
                    </div>
                    <div className="text-xs text-zinc-500 flex items-center space-x-2 mt-0.5">
                      <span className="px-1.5 py-0.2 text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-400">
                        {member.level_name}
                      </span>
                      {member.parent_name && <span>Parent: {member.parent_name}</span>}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300" />
                </div>
              ))
            )}
          </div>
        ) : roots.length === 0 ? (
          <div className="py-20 text-center text-zinc-500 text-xs">
            <Layers className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="font-semibold text-zinc-300">Hierarchy is empty</p>
            <p className="mt-1">Click "+ Add Root" to create your first top-level record.</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {roots.map(root => (
              <TreeNode
                key={root.id}
                member={root}
                levelIndex={0}
                onSelectMember={selectMember}
                onAddChild={onAddChild}
                onEdit={onEdit}
                onMove={onMove}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
