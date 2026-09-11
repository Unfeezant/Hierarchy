import React, { useState } from "react";
import { useApp } from "../context/AppContext.js";
import { DynamicIcon } from "./DynamicIcon.js";
import {
  ChevronLeft,
  ChevronRight,
  Layers,
  Table,
  Network,
  LayoutDashboard,
  Sliders,
  Shield,
  Database,
  Sparkles,
  BookOpen,
  FolderTree
} from "lucide-react";

interface SideNavigatorProps {
  currentTab: "dashboard" | "explorer" | "designer" | "audit" | "sql" | "admin" | "profile" | "presets";
  onTabChange: (tab: "dashboard" | "explorer" | "designer" | "audit" | "sql" | "admin" | "profile" | "presets") => void;
  onOpenPresets?: () => void;
  onOpenAiAssistant?: () => void;
  onOpenNewHierarchy?: () => void;
}

export const SideNavigator: React.FC<SideNavigatorProps> = ({
  currentTab,
  onTabChange,
  onOpenPresets,
  onOpenAiAssistant,
  onOpenNewHierarchy
}) => {
  const {
    currentUser,
    levels,
    activeLevel,
    setActiveLevel,
    setViewMode,
    viewMode,
    currentHierarchy
  } = useApp();

  const [isCollapsed, setIsCollapsed] = useState(false);

  const isGuest = currentUser?.role?.id === "role_guest" || currentUser?.role?.name === "Guest";
  const canConfigureLevels = !isGuest && (currentUser?.role?.name === "Super Admin" || currentUser?.role?.permissions.includes("level:edit") || currentUser?.role?.permissions.includes("level:create"));
  const canManageAdmin = !isGuest && currentUser && (currentUser.role.name === "Super Admin" || currentUser.role.id === "role_super_admin" || currentUser.role.id === "role_admin" || currentUser.role.permissions.includes("user:manage"));
  const canViewAudit = !isGuest && (currentUser?.role?.name === "Super Admin" || currentUser?.role?.permissions.includes("audit:view"));
  const canViewSql = !isGuest && (currentUser?.role?.name === "Super Admin" || currentUser?.role?.permissions.includes("sql:read"));
  const canUsePresets = !isGuest && (currentUser?.role?.name === "Super Admin" || currentUser?.role?.permissions.includes("hierarchy:create"));
  const showPlatformTools = !isGuest && (Boolean(onOpenAiAssistant) || canConfigureLevels || canManageAdmin || canViewAudit || canViewSql || (Boolean(onOpenPresets) && canUsePresets));

  const handleLevelClick = (lvl: any) => {
    setActiveLevel(lvl);
    setViewMode("table");
    if (currentTab !== "explorer") {
      onTabChange("explorer");
    }
  };

  const handleViewModeChange = (mode: "tree" | "pyramid") => {
    setViewMode(mode);
    if (currentTab !== "explorer") {
      onTabChange("explorer");
    }
  };

  return (
    <aside
      className={`bg-zinc-950 border-r border-zinc-800 text-zinc-300 flex flex-col shrink-0 select-none transition-all duration-200 z-20 ${
        isCollapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Sidebar Header / Collapser */}
      <div className="h-12 border-b border-zinc-800 flex items-center justify-between px-3">
        {!isCollapsed && (
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
            Navigation
          </span>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 border border-zinc-800 hover:border-zinc-700 bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-zinc-100 transition cursor-pointer ml-auto"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-5">
        {/* Core Workspace Section */}
        <div>
          {!isCollapsed && (
            <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Workspace
            </div>
          )}
          <div className="space-y-0.5">
            {/* Dashboard */}
            <button
              onClick={() => onTabChange("dashboard")}
              className={`w-full flex items-center space-x-2.5 px-2.5 py-2 text-xs font-semibold transition cursor-pointer ${
                currentTab === "dashboard"
                  ? "bg-zinc-850 text-white border-l-2 border-zinc-100"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
              }`}
              title="Dashboard"
            >
              <LayoutDashboard className="w-4 h-4 shrink-0 text-zinc-400" />
              {!isCollapsed && <span>Dashboard</span>}
            </button>

            {/* Tree View */}
            <button
              onClick={() => handleViewModeChange("tree")}
              className={`w-full flex items-center space-x-2.5 px-2.5 py-2 text-xs font-semibold transition cursor-pointer ${
                currentTab === "explorer" && viewMode === "tree"
                  ? "bg-zinc-850 text-white border-l-2 border-zinc-100"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
              }`}
              title="Hierarchy Tree"
            >
              <Network className="w-4 h-4 shrink-0 text-zinc-400" />
              {!isCollapsed && <span>Hierarchy Tree</span>}
            </button>

            {/* Pyramid Tiers */}
            <button
              onClick={() => handleViewModeChange("pyramid")}
              className={`w-full flex items-center space-x-2.5 px-2.5 py-2 text-xs font-semibold transition cursor-pointer ${
                currentTab === "explorer" && viewMode === "pyramid"
                  ? "bg-zinc-850 text-white border-l-2 border-zinc-100"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
              }`}
              title="Pyramid Tiers"
            >
              <Layers className="w-4 h-4 shrink-0 text-zinc-400" />
              {!isCollapsed && <span>Pyramid Tiers</span>}
            </button>
          </div>
        </div>

        {/* Dynamic Level Datasets */}
        <div>
          {!isCollapsed && (
            <div className="px-2 pb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              <span>Level Datasets</span>
              <span className="font-mono text-[9px]">{levels.length}</span>
            </div>
          )}

          <div className="space-y-0.5">
            {levels.map((lvl) => {
              const isSelected = currentTab === "explorer" && viewMode === "table" && activeLevel?.id === lvl.id;
              return (
                <button
                  key={lvl.id}
                  onClick={() => handleLevelClick(lvl)}
                  className={`w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium transition cursor-pointer ${
                    isSelected
                      ? "bg-zinc-850 text-white font-bold border-l-2 border-zinc-100"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                  }`}
                  title={lvl.name}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <div
                      className="w-4 h-4 border border-zinc-700 bg-zinc-850 text-zinc-300 flex items-center justify-center shrink-0 text-[10px]"
                    >
                      <DynamicIcon name={lvl.icon || "Folder"} className="w-2.5 h-2.5" />
                    </div>
                    {!isCollapsed && <span className="truncate">{lvl.name}</span>}
                  </div>

                  {!isCollapsed && (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 bg-zinc-900 border border-zinc-800 text-zinc-500">
                      {lvl.member_count ?? 0}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Platform Tools */}
        {showPlatformTools && (
          <div>
            {!isCollapsed && (
              <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Platform Tools
              </div>
            )}
            <div className="space-y-0.5">
              {onOpenAiAssistant && !isGuest && (
                <button
                  onClick={onOpenAiAssistant}
                  className="w-full flex items-center space-x-2.5 px-2.5 py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-900 transition cursor-pointer"
                  title="AI Assistant (Ctrl+J)"
                >
                  <Sparkles className="w-4 h-4 shrink-0 text-zinc-300" />
                  {!isCollapsed && <span>AI Assistant</span>}
                </button>
              )}

              {canConfigureLevels && (
                <button
                  onClick={() => onTabChange("designer")}
                  className={`w-full flex items-center space-x-2.5 px-2.5 py-2 text-xs font-semibold transition cursor-pointer ${
                    currentTab === "designer"
                      ? "bg-zinc-850 text-white border-l-2 border-zinc-100"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                  }`}
                  title="Configure Levels"
                >
                  <Sliders className="w-4 h-4 shrink-0 text-zinc-400" />
                  {!isCollapsed && <span>Configure Levels</span>}
                </button>
              )}

              {canManageAdmin && (
                <button
                  onClick={() => onTabChange("admin")}
                  className={`w-full flex items-center space-x-2.5 px-2.5 py-2 text-xs font-semibold transition cursor-pointer ${
                    currentTab === "admin"
                      ? "bg-zinc-850 text-white border-l-2 border-zinc-100"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                  }`}
                  title="Administration"
                >
                  <Shield className="w-4 h-4 shrink-0 text-zinc-400" />
                  {!isCollapsed && <span>Administration</span>}
                </button>
              )}

              {canViewAudit && (
                <button
                  onClick={() => onTabChange("audit")}
                  className={`w-full flex items-center space-x-2.5 px-2.5 py-2 text-xs font-semibold transition cursor-pointer ${
                    currentTab === "audit"
                      ? "bg-zinc-850 text-white border-l-2 border-zinc-100"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                  }`}
                  title="Audit Trail"
                >
                  <Shield className="w-4 h-4 shrink-0 text-zinc-400" />
                  {!isCollapsed && <span>Audit Trail</span>}
                </button>
              )}

              {canViewSql && (
                <button
                  onClick={() => onTabChange("sql")}
                  className={`w-full flex items-center space-x-2.5 px-2.5 py-2 text-xs font-semibold transition cursor-pointer ${
                    currentTab === "sql"
                      ? "bg-zinc-850 text-white border-l-2 border-zinc-100"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                  }`}
                  title="SQL Inspector"
                >
                  <Database className="w-4 h-4 shrink-0 text-zinc-400" />
                  {!isCollapsed && <span>SQL Inspector</span>}
                </button>
              )}

              {onOpenPresets && canUsePresets && (
                <button
                  onClick={onOpenPresets}
                  className="w-full flex items-center space-x-2.5 px-2.5 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition cursor-pointer"
                  title="Hierarchy Templates"
                >
                  <BookOpen className="w-4 h-4 shrink-0 text-zinc-400" />
                  {!isCollapsed && <span>Templates</span>}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
