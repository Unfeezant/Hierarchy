import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../context/AppContext.js";
import {
  Search,
  ChevronDown,
  Building,
  Check,
  Sparkles,
  Plus,
  Shield,
  User,
  LogOut
} from "lucide-react";

interface HeaderProps {
  currentTab: "dashboard" | "explorer" | "designer" | "audit" | "sql" | "admin" | "profile" | "presets";
  onTabChange: (tab: "dashboard" | "explorer" | "designer" | "audit" | "sql" | "admin" | "profile" | "presets") => void;
  onOpenPresets?: () => void;
  onOpenNewHierarchy: () => void;
  onOpenAiAssistant?: () => void;
  onOpenCommandPalette?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onTabChange,
  onOpenPresets,
  onOpenNewHierarchy,
  onOpenAiAssistant,
  onOpenCommandPalette
}) => {
  const {
    currentUser,
    allUsers,
    switchUser,
    logout,
    hierarchies,
    currentHierarchy,
    setCurrentHierarchy
  } = useApp();

  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  const [showHierarchyDropdown, setShowHierarchyDropdown] = useState(false);
  const hierarchyRef = useRef<HTMLDivElement>(null);

  const isSuperAdmin =
    currentUser?.role.name === "Super Admin" ||
    currentUser?.role.id === "role_super_admin";

  const isGuest = currentUser?.role?.id === "role_guest" || currentUser?.role?.name === "Guest";

  const isSuperAdminOrAdmin =
    !isGuest &&
    (isSuperAdmin ||
      currentUser?.role.id === "role_admin" ||
      currentUser?.role.permissions.includes("user:manage"));

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userRef.current && !userRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
      }
      if (hierarchyRef.current && !hierarchyRef.current.contains(event.target as Node)) {
        setShowHierarchyDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="bg-zinc-950 border-b border-zinc-800 h-14 sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6">
      {/* Brand & Hierarchy Selector */}
      <div className="flex items-center space-x-4">
        <div
          onClick={() => onTabChange("dashboard")}
          className="flex items-center space-x-2.5 cursor-pointer group select-none"
        >
          <div className="w-7 h-7 bg-zinc-850 border border-zinc-700 text-zinc-100 flex items-center justify-center font-black text-xs">
            H
          </div>
          <div className="hidden sm:flex items-center space-x-1.5">
            <span className="font-bold text-sm text-zinc-100 tracking-wider group-hover:text-white transition">
              HIERARCHY
            </span>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1.5 py-0.5 bg-zinc-900 border border-zinc-800">
              SYS
            </span>
          </div>
        </div>

        <div className="h-4 w-px bg-zinc-800 hidden md:block" />

        {/* Hierarchy Switcher Dropdown */}
        <div className="relative" ref={hierarchyRef}>
          <button
            onClick={() => setShowHierarchyDropdown(!showHierarchyDropdown)}
            className="flex items-center space-x-2 px-2.5 py-1.5 border border-zinc-800 hover:border-zinc-700 bg-zinc-900 hover:bg-zinc-850 text-xs font-semibold text-zinc-200 transition cursor-pointer"
            title="Switch Active Hierarchy"
          >
            <Building className="w-3.5 h-3.5 text-zinc-400" />
            <span className="max-w-[130px] truncate font-bold text-zinc-100">
              {currentHierarchy?.name || "Select Hierarchy"}
            </span>
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          </button>

          {showHierarchyDropdown && (
            <div className="absolute left-0 mt-1.5 w-72 bg-zinc-900 border border-zinc-800 py-1.5 z-50 shadow-2xl">
              <div className="px-3.5 py-1.5 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Select Hierarchy
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {hierarchies.length} available
                </span>
              </div>
              <div className="max-h-60 overflow-y-auto py-1">
                {hierarchies.map((h) => {
                  const isSelected = h.id === currentHierarchy?.id;
                  return (
                    <button
                      key={h.id}
                      onClick={() => {
                        setCurrentHierarchy(h);
                        setShowHierarchyDropdown(false);
                      }}
                      className={`w-full text-left px-3.5 py-2 hover:bg-zinc-800 flex items-center justify-between text-xs transition cursor-pointer ${
                        isSelected ? "bg-zinc-800/90 text-white font-bold" : "text-zinc-300"
                      }`}
                    >
                      <div className="truncate pr-2">
                        <div className="font-semibold truncate">{h.name}</div>
                        {h.description && (
                          <div className="text-[10px] text-zinc-400 truncate mt-0.5">
                            {h.description}
                          </div>
                        )}
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-zinc-100 shrink-0" />}
                    </button>
                  );
                })}
              </div>
              {isSuperAdmin && (
                <div className="p-2 border-t border-zinc-800">
                  <button
                    onClick={() => {
                      setShowHierarchyDropdown(false);
                      onOpenNewHierarchy();
                    }}
                    className="w-full flex items-center justify-center space-x-1.5 py-1.5 border border-zinc-800 hover:border-zinc-700 bg-zinc-850 hover:bg-zinc-800 text-xs font-bold text-zinc-200 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-zinc-400" />
                    <span>New Hierarchy</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Omni Search Button */}
        {onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            className="flex items-center space-x-2 px-3 py-1.5 border border-zinc-800 hover:border-zinc-700 bg-zinc-900 hover:bg-zinc-850 text-xs text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
            title="Search records & navigate (Ctrl+K)"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden md:inline font-medium">Search records...</span>
            <kbd className="hidden lg:inline text-[9px] font-mono px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-300">
              Ctrl+K
            </kbd>
          </button>
        )}

        {/* AI Assistant Button */}
        {onOpenAiAssistant && !isGuest && (
          <button
            onClick={onOpenAiAssistant}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs transition cursor-pointer select-none"
            title="Conversational AI Assistant (Ctrl+J)"
          >
            <Sparkles className="w-3.5 h-3.5 text-zinc-900" />
            <span>AI Assistant</span>
          </button>
        )}

        {/* Admin Navigation Quick Link */}
        {isSuperAdminOrAdmin && (
          <button
            onClick={() => onTabChange("admin")}
            className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 border transition cursor-pointer ${
              currentTab === "admin"
                ? "border-zinc-200 bg-zinc-100 text-black font-bold"
                : "border-zinc-800 hover:border-zinc-700 bg-zinc-900 text-zinc-300"
            }`}
            title="Administration & Security Workspace"
          >
            <Shield className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline">Admin</span>
          </button>
        )}

        <div className="h-4 w-px bg-zinc-800 mx-1 hidden sm:block" />

        {/* Role & User Profile Dropdown */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            className="flex items-center space-x-2 px-2.5 py-1.5 border border-zinc-800 bg-zinc-900 hover:bg-zinc-850 text-xs font-medium text-zinc-200 transition cursor-pointer"
          >
            <div className="w-5 h-5 bg-zinc-800 border border-zinc-700 text-zinc-200 flex items-center justify-center font-bold text-[10px]">
              {currentUser?.full_name?.charAt(0) || "U"}
            </div>
            <div className="text-left hidden lg:block">
              <div className="font-bold text-zinc-200 leading-tight">
                {currentUser?.full_name || "User"}
              </div>
              <div className="text-[10px] text-zinc-400 font-medium">
                {currentUser?.role?.name || "Viewer"}
              </div>
            </div>
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          </button>

          {showUserDropdown && (
            <div className="absolute right-0 mt-1.5 w-76 bg-zinc-900 border border-zinc-800 py-2 z-50 shadow-2xl">
              <div className="px-3.5 py-2 border-b border-zinc-800">
                <div className="text-xs font-bold text-zinc-100">{currentUser?.full_name}</div>
                <div className="text-[11px] text-zinc-400 font-mono">{currentUser?.email}</div>
                <div className="mt-1">
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-zinc-800 border border-zinc-700 text-zinc-200">
                    {currentUser?.role?.name}
                  </span>
                </div>
              </div>

              <div className="py-1 border-b border-zinc-800">
                <button
                  onClick={() => {
                    onTabChange("profile");
                    setShowUserDropdown(false);
                  }}
                  className="w-full text-left px-3.5 py-1.5 hover:bg-zinc-800 text-xs text-zinc-300 flex items-center gap-2"
                >
                  <User className="w-3.5 h-3.5 text-zinc-400" />
                  <span>My Profile & Credentials</span>
                </button>

                {isSuperAdminOrAdmin && (
                  <button
                    onClick={() => {
                      onTabChange("admin");
                      setShowUserDropdown(false);
                    }}
                    className="w-full text-left px-3.5 py-1.5 hover:bg-zinc-800 text-xs text-zinc-300 flex items-center gap-2"
                  >
                    <Shield className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Administration Workspace</span>
                  </button>
                )}
              </div>

              {allUsers.length > 1 && (
                <div className="py-1 border-b border-zinc-800">
                  <div className="px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Switch Test Account
                  </div>
                  {allUsers.slice(0, 5).map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        switchUser(u.id);
                        setShowUserDropdown(false);
                      }}
                      className="w-full text-left px-3.5 py-1.5 hover:bg-zinc-800 text-xs text-zinc-300 flex items-center justify-between"
                    >
                      <span className="truncate">{u.full_name} ({u.role_name})</span>
                      {currentUser?.id === u.id && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              )}

              <div className="pt-1">
                <button
                  onClick={() => {
                    setShowUserDropdown(false);
                    logout();
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-red-950/40 text-xs text-red-300 flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5 text-red-400" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
