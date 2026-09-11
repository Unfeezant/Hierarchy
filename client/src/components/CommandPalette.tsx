import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../context/AppContext.js";
import { api } from "../services/api.js";
import { Member, Level } from "../types/index.js";
import {
  Search,
  X,
  Network,
  Layers,
  Sliders,
  Table,
  Shield,
  Database,
  Sparkles,
  ChevronRight,
  User,
  ArrowRight,
  FolderTree
} from "lucide-react";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tab: "dashboard" | "explorer" | "designer" | "audit" | "sql" | "presets") => void;
  onNavigateLevelTable: (lvl: Level) => void;
  onOpenAi: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
  onNavigateLevelTable,
  onOpenAi
}) => {
  const { currentHierarchy, levels, selectMember, setViewMode, currentUser } = useApp();
  const [query, setQuery] = useState("");
  const [memberResults, setMemberResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isGuest = currentUser?.role?.id === "role_guest" || currentUser?.role?.name === "Guest";
  const canConfigureLevels = !isGuest && (currentUser?.role?.name === "Super Admin" || (currentUser?.role?.permissions?.includes("level:edit") ?? false) || (currentUser?.role?.permissions?.includes("level:create") ?? false));
  const canViewAudit = !isGuest && (currentUser?.role?.name === "Super Admin" || (currentUser?.role?.permissions?.includes("audit:view") ?? false));

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setMemberResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2 || !currentHierarchy) {
      setMemberResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        const results = await api.searchMembers(query.trim(), currentHierarchy.id);
        setMemberResults(results);
      } catch (err) {
        console.error("Search failed", err);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, currentHierarchy]);

  if (!isOpen) return null;

  const filteredLevels = levels.filter(l =>
    l.name.toLowerCase().includes(query.toLowerCase()) ||
    l.code.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelectMember = async (m: any) => {
    await selectMember(m);
    setViewMode("detail");
    onNavigateTab("explorer");
    onClose();
  };

  const handleSelectLevel = (lvl: Level) => {
    onNavigateLevelTable(lvl);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-100">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-zinc-800 bg-zinc-950">
          <Search className="w-5 h-5 text-zinc-500 shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a command, member name, department, ID, or level..."
            className="flex-1 text-sm font-medium text-zinc-100 placeholder:text-zinc-500 bg-transparent focus:outline-hidden"
          />
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-semibold text-zinc-400 bg-zinc-850 border border-zinc-700">
            ESC
          </kbd>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-200 ml-2 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results Body */}
        <div className="max-h-96 overflow-y-auto p-3 space-y-4 bg-zinc-900">
          {/* Member Search Results */}
          {memberResults.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 px-2 py-1">
                Hierarchy Records ({memberResults.length})
              </div>
              {memberResults.map(m => (
                <button
                  key={m.id}
                  onClick={() => handleSelectMember(m)}
                  className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center justify-between group transition cursor-pointer border border-transparent hover:border-zinc-700"
                >
                  <div className="truncate">
                    <div className="text-xs font-bold text-zinc-200 group-hover:text-white truncate">
                      {m.name}
                    </div>
                    <div className="text-[11px] text-zinc-500 flex items-center space-x-1 truncate mt-0.5">
                      <span className="font-medium text-zinc-400">{m.level_name}</span>
                      {m.ancestors && m.ancestors.length > 0 && (
                        <>
                          <span>&bull;</span>
                          <span className="truncate">
                            {m.ancestors.map((a: any) => a.name).join(" > ")}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* Levels Results */}
          {filteredLevels.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 px-2 py-1">
                Levels &amp; Datasets
              </div>
              {filteredLevels.map(lvl => (
                <button
                  key={lvl.id}
                  onClick={() => handleSelectLevel(lvl)}
                  className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center justify-between group transition cursor-pointer border border-transparent hover:border-zinc-700"
                >
                  <div className="flex items-center space-x-2.5">
                    <div
                      className="w-6 h-6 border border-zinc-700 bg-zinc-800 flex items-center justify-center text-xs font-bold shrink-0 text-zinc-300"
                    >
                      {lvl.name.charAt(0)}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-zinc-200 group-hover:text-white">
                        {lvl.name} Table
                      </span>
                      <span className="text-[10px] text-zinc-500 ml-2">
                        {lvl.member_count || 0} records
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-300" />
                </button>
              ))}
            </div>
          )}

          {/* Quick Platform Actions */}
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 px-2 py-1">
              Platform Actions
            </div>
            <button
              onClick={() => {
                onNavigateTab("dashboard");
                onClose();
              }}
              className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center space-x-2.5 text-xs text-zinc-300 hover:text-white transition cursor-pointer"
            >
              <FolderTree className="w-4 h-4 text-zinc-500" />
              <span>Go to Overview Dashboard</span>
            </button>
            <button
              onClick={() => {
                onNavigateTab("explorer");
                setViewMode("tree");
                onClose();
              }}
              className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center space-x-2.5 text-xs text-zinc-300 hover:text-white transition cursor-pointer"
            >
              <Network className="w-4 h-4 text-zinc-500" />
              <span>Open Hierarchy Tree View</span>
            </button>
            <button
              onClick={() => {
                onNavigateTab("explorer");
                setViewMode("pyramid");
                onClose();
              }}
              className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center space-x-2.5 text-xs text-zinc-300 hover:text-white transition cursor-pointer"
            >
              <Layers className="w-4 h-4 text-zinc-500" />
              <span>Open Pyramid Tiers View</span>
            </button>
            {!isGuest && (
              <button
                onClick={() => {
                  onOpenAi();
                  onClose();
                }}
                className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center space-x-2.5 text-xs text-zinc-200 hover:text-white font-semibold transition cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-zinc-400" />
                <span>Open AI Assistant &amp; Point Finder</span>
              </button>
            )}
            {canConfigureLevels && (
              <button
                onClick={() => {
                  onNavigateTab("designer");
                  onClose();
                }}
                className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center space-x-2.5 text-xs text-zinc-300 hover:text-white transition cursor-pointer"
              >
                <Sliders className="w-4 h-4 text-zinc-500" />
                <span>Configure Hierarchy Levels &amp; Schema</span>
              </button>
            )}
            {canViewAudit && (
              <button
                onClick={() => {
                  onNavigateTab("audit");
                  onClose();
                }}
                className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center space-x-2.5 text-xs text-zinc-300 hover:text-white transition cursor-pointer"
              >
                <Shield className="w-4 h-4 text-zinc-500" />
                <span>View Append-Only Security Audit Trail</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500 font-medium">
          <div className="flex items-center space-x-3">
            <span>Navigation: ↑ ↓</span>
            <span>Select: Enter</span>
          </div>
          <span>Hierarchy Data Platform</span>
        </div>
      </div>
    </div>
  );
};
