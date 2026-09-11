import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext.js";
import { api } from "../services/api.js";
import { Level, AuditLog } from "../types/index.js";
import { DynamicIcon } from "./DynamicIcon.js";
import {
  Layers,
  Users,
  Network,
  Shield,
  Sparkles,
  Sliders,
  Table,
  ArrowRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  Building,
  FileText,
  Activity
} from "lucide-react";

interface DashboardViewProps {
  onNavigateTab: (tab: "explorer" | "designer" | "audit" | "sql" | "presets") => void;
  onNavigateLevelTable: (lvl: Level) => void;
  onOpenAi: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigateTab,
  onNavigateLevelTable,
  onOpenAi
}) => {
  const { currentHierarchy, levels, currentUser } = useApp();
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const totalMembers = levels.reduce((sum, lvl) => sum + (lvl.member_count || 0), 0);

  useEffect(() => {
    async function loadRecentActivity() {
      if (!currentHierarchy) return;
      try {
        setIsLoadingLogs(true);
        const res = await api.getAuditLogs({
          hierarchy_id: currentHierarchy.id,
          limit: 6
        });
        setRecentLogs(res.items);
      } catch (err) {
        console.error("Failed to load audit logs in dashboard", err);
      } finally {
        setIsLoadingLogs(false);
      }
    }
    loadRecentActivity();
  }, [currentHierarchy]);

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero */}
      <div className="bg-zinc-900 border border-zinc-800 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 px-2 py-0.5 bg-zinc-800 border border-zinc-700">
              Overview
            </span>
            <span className="text-xs text-zinc-400 font-mono">
              Hierarchy ID: {currentHierarchy?.id.slice(0, 8)}...
            </span>
          </div>
          <h1 className="text-2xl font-black text-white mt-1 tracking-tight">
            {currentHierarchy?.name || "Hierarchical Operations"}
          </h1>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            {currentHierarchy?.description || "High-performance tree data management, dynamic attributes, cascade rules, and security controls."}
          </p>
        </div>

        {/* Quick Launch Buttons */}
        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={() => onNavigateTab("explorer")}
            className="px-3.5 py-2 bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs flex items-center space-x-1.5 transition cursor-pointer border border-zinc-200"
          >
            <Network className="w-4 h-4 text-zinc-950" />
            <span>Open Tree</span>
          </button>
          <button
            onClick={onOpenAi}
            className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs flex items-center space-x-1.5 transition cursor-pointer border border-zinc-700"
          >
            <Sparkles className="w-4 h-4 text-zinc-300" />
            <span>AI Assistant</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Records */}
        <div className="bg-zinc-900 border border-zinc-800 p-5 hover:border-zinc-700 transition">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-bold uppercase tracking-wider">Total Records</span>
            <div className="w-8 h-8 bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-white font-mono">
            {totalMembers.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-zinc-400 flex items-center space-x-1">
            <TrendingUp className="w-3.5 h-3.5 text-zinc-400" />
            <span>Distributed across {levels.length} levels</span>
          </div>
        </div>

        {/* Metric 2: Levels Count */}
        <div className="bg-zinc-900 border border-zinc-800 p-5 hover:border-zinc-700 transition">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-bold uppercase tracking-wider">Configured Levels</span>
            <div className="w-8 h-8 bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-white font-mono">
            {levels.length}
          </div>
          <div className="mt-1 text-[11px] text-zinc-400 flex items-center space-x-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-zinc-400" />
            <span>Strict parent rules enforced</span>
          </div>
        </div>

        {/* Metric 3: Active Scope */}
        <div className="bg-zinc-900 border border-zinc-800 p-5 hover:border-zinc-700 transition">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-bold uppercase tracking-wider">Active Scope</span>
            <div className="w-8 h-8 bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
              <Building className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-base font-bold text-white truncate">
            {currentHierarchy?.name || "Primary"}
          </div>
          <div className="mt-1 text-[11px] text-zinc-400">
            Access Role: <strong className="text-zinc-200">{currentUser?.role.name}</strong>
          </div>
        </div>

        {/* Metric 4: Storage Engine Status */}
        <div className="bg-zinc-900 border border-zinc-800 p-5 hover:border-zinc-700 transition">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-bold uppercase tracking-wider">Database Engine</span>
            <div className="w-8 h-8 bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-base font-black text-white flex items-center space-x-2">
            <span className="w-2 h-2 bg-emerald-500 inline-block" />
            <span>SQLite WAL</span>
          </div>
          <div className="mt-1 text-[11px] text-zinc-400">
            ACID Cascade &amp; Cycle Safe
          </div>
        </div>
      </div>

      {/* Main Grid: Levels Table & Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Levels Summary */}
        <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-zinc-400" />
              <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide">
                Hierarchy Levels Breakdown
              </h2>
            </div>
            <button
              onClick={() => onNavigateTab("designer")}
              className="text-xs text-zinc-400 hover:text-white flex items-center space-x-1 font-semibold transition"
            >
              <span>Manage Schema</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-zinc-950 text-zinc-400 uppercase font-semibold text-[10px] tracking-wider border-b border-zinc-800">
                <tr>
                  <th className="py-2.5 px-4">Depth</th>
                  <th className="py-2.5 px-4">Level Name</th>
                  <th className="py-2.5 px-4">Parent Constraints</th>
                  <th className="py-2.5 px-4 text-right">Records</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {levels.map((lvl, index) => (
                  <tr key={lvl.id} className="hover:bg-zinc-850/50 transition">
                    <td className="py-3 px-4 font-mono font-bold text-zinc-400">
                      #{index + 1}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-2.5">
                        <div
                          className="w-5 h-5 border border-zinc-700 bg-zinc-800 text-zinc-200 flex items-center justify-center shrink-0"
                        >
                          <DynamicIcon name={lvl.icon || "Folder"} className="w-3 h-3" />
                        </div>
                        <span className="font-bold text-zinc-100">{lvl.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-zinc-400">
                      {lvl.allowed_parent_level_ids && lvl.allowed_parent_level_ids.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {lvl.allowed_parent_level_ids.map(pid => {
                            const plvl = levels.find(l => l.id === pid);
                            return (
                              <span
                                key={pid}
                                className="px-1.5 py-0.5 border border-zinc-700 bg-zinc-800 text-zinc-300 text-[10px] font-medium"
                              >
                                {plvl?.name || "Parent"}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-zinc-500 italic text-[11px]">Root Tier (No Parent)</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-zinc-100">
                      {lvl.member_count ?? 0}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => onNavigateLevelTable(lvl)}
                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-[11px] font-semibold transition"
                      >
                        View Table
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 1 Col: Recent Audit Log Feed */}
        <div className="bg-zinc-900 border border-zinc-800 flex flex-col">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4 text-zinc-400" />
              <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide">
                Recent Security Audit
              </h2>
            </div>
            <button
              onClick={() => onNavigateTab("audit")}
              className="text-xs text-zinc-400 hover:text-white flex items-center space-x-1 font-semibold transition"
            >
              <span>All Logs</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-3 flex-1 overflow-y-auto divide-y divide-zinc-800/60">
            {isLoadingLogs ? (
              <div className="p-6 text-center text-xs text-zinc-500">Loading audit events...</div>
            ) : recentLogs.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-500">No recent security events.</div>
            ) : (
              recentLogs.map((log) => (
                <div key={log.id} className="py-2.5 px-2 hover:bg-zinc-850/40 transition">
                  <div className="flex items-center justify-between">
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-zinc-800 border border-zinc-700 text-zinc-300">
                      {log.action}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-semibold text-zinc-200 truncate">
                    {log.entity_type.toUpperCase()} - {log.entity_id.slice(0, 8)}
                  </div>
                  <div className="text-[10px] text-zinc-500 flex items-center justify-between mt-0.5">
                    <span>By: {log.user_name || "System"}</span>
                    <span className="capitalize">{log.entity_type}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
