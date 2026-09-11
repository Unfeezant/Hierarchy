import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext.js";
import { api } from "../services/api.js";
import { AuditLog } from "../types/index.js";
import { Shield, Clock, Search, ChevronDown, ChevronRight, FileText } from "lucide-react";

export const AuditLogView: React.FC = () => {
  const { currentHierarchy } = useApp();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [entityFilter, setEntityFilter] = useState("");

  useEffect(() => {
    async function loadLogs() {
      try {
        setIsLoading(true);
        const res = await api.getAuditLogs({
          hierarchy_id: currentHierarchy?.id,
          entity_type: entityFilter || undefined,
          limit: 50
        });
        setLogs(res.items);
        setTotal(res.total);
      } catch (err) {
        console.error("Failed to load audit logs", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadLogs();
  }, [currentHierarchy, entityFilter]);

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-800 gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-100 flex items-center space-x-2">
            <Shield className="w-5 h-5 text-zinc-400" />
            <span>Append-Only Security Audit Trail</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Immutable tracking of records created, modified, moved, schema changes, and actor credentials
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={entityFilter}
            onChange={e => setEntityFilter(e.target.value)}
            className="px-3 py-1.5 border border-zinc-800 bg-zinc-950 text-xs font-semibold text-zinc-200 focus:outline-none"
          >
            <option value="">All Entity Types</option>
            <option value="member">Members</option>
            <option value="level">Levels</option>
            <option value="field">Fields / Schema</option>
            <option value="hierarchy">Hierarchy</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-xs text-zinc-500">Loading audit history...</div>
      ) : logs.length === 0 ? (
        <div className="py-12 text-center text-xs text-zinc-500">No audit records found.</div>
      ) : (
        <div className="divide-y divide-zinc-800 border border-zinc-800 overflow-hidden text-xs">
          {logs.map(log => {
            const isExpanded = expandedId === log.id;
            return (
              <div key={log.id} className="p-3.5 hover:bg-zinc-850/50 transition">
                <div
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center space-x-3">
                    <span
                      className="px-2 py-0.5 font-bold font-mono text-[10px] uppercase bg-zinc-800 border border-zinc-700 text-zinc-300"
                    >
                      {log.action}
                    </span>

                    <span className="font-semibold text-zinc-200">{log.entity_type.toUpperCase()}</span>
                    <span className="text-zinc-500 font-mono text-[11px] truncate max-w-[150px]">{log.entity_id}</span>
                  </div>

                  <div className="flex items-center space-x-4 text-zinc-400 text-[11px]">
                    <span className="font-semibold text-zinc-300">{log.user_name}</span>
                    <span className="font-mono text-zinc-500">{new Date(log.created_at).toLocaleString()}</span>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-600" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-zinc-800 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                    {log.previous_state && (
                      <div className="p-2.5 bg-zinc-950 border border-zinc-800 font-mono">
                        <div className="font-bold text-zinc-500 uppercase text-[9px] mb-1">Previous State:</div>
                        <pre className="overflow-x-auto text-[10px] text-zinc-400">
                          {JSON.stringify(log.previous_state, null, 2)}
                        </pre>
                      </div>
                    )}
                    {log.new_state && (
                      <div className="p-2.5 bg-zinc-950 border border-zinc-800 font-mono">
                        <div className="font-bold text-zinc-400 uppercase text-[9px] mb-1">New State:</div>
                        <pre className="overflow-x-auto text-[10px] text-zinc-300">
                          {JSON.stringify(log.new_state, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
