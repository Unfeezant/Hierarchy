import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext.js";
import { api } from "../services/api.js";
import {
  Database,
  Play,
  Square,
  Zap,
  HardDrive,
  RefreshCw,
  Terminal,
  Clock,
  CheckCircle2,
  Table as TableIcon,
  Layers,
  FileCode,
  ShieldCheck,
  ChevronRight
} from "lucide-react";

export const LiveSqlInspector: React.FC = () => {
  const { currentHierarchy, refreshLevels } = useApp();
  const [stats, setStats] = useState<any>(null);
  const [tables, setTables] = useState<any[]>([]);
  const [streamerStatus, setStreamerStatus] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // SQL Query Console
  const [sqlQuery, setSqlQuery] = useState<string>(
    "SELECT m.id, m.name, l.name as level_name, p.name as parent_name, m.depth, m.created_at FROM members m JOIN levels l ON m.level_id = l.id LEFT JOIN members p ON m.parent_id = p.id ORDER BY m.created_at DESC LIMIT 15;"
  );
  const [queryResult, setQueryResult] = useState<any>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [isExecutingSql, setIsExecutingSql] = useState(false);

  // Load stats and tables
  const loadData = async () => {
    try {
      setIsRefreshing(true);
      const [st, tbls, streamSt] = await Promise.all([
        api.getSqlStats(),
        api.getSqlTables(),
        api.getRealtimeStatus()
      ]);
      setStats(st);
      setTables(tbls);
      setStreamerStatus(streamSt);
    } catch (err) {
      console.error("Failed to load SQL stats", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    executeSql(sqlQuery);
  }, []);

  // Poll streamer status when active
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (streamerStatus?.isRunning) {
      interval = setInterval(async () => {
        try {
          const st = await api.getRealtimeStatus();
          setStreamerStatus(st);
          // Also refresh general stats
          const newStats = await api.getSqlStats();
          setStats(newStats);
        } catch {
          // ignore
        }
      }, 1500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [streamerStatus?.isRunning]);

  const toggleStreamer = async () => {
    try {
      if (streamerStatus?.isRunning) {
        const res = await api.stopRealtimeStream();
        setStreamerStatus(res);
      } else {
        const res = await api.startRealtimeStream(2000, currentHierarchy?.id);
        setStreamerStatus(res);
      }
      await loadData();
      await refreshLevels();
    } catch (err: any) {
      alert("Streamer error: " + err.message);
    }
  };

  const handleGenerateBatch = async (count: number) => {
    try {
      setIsRefreshing(true);
      await api.generateRealtimeBatch(count, currentHierarchy?.id);
      await loadData();
      await refreshLevels();
      executeSql(sqlQuery);
    } catch (err: any) {
      alert("Batch generation error: " + err.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const executeSql = async (queryToRun = sqlQuery) => {
    if (!queryToRun.trim()) return;
    try {
      setIsExecutingSql(true);
      setQueryError(null);
      const res = await api.runSqlQuery(queryToRun.trim());
      setQueryResult(res);
    } catch (err: any) {
      setQueryError(err.message);
      setQueryResult(null);
    } finally {
      setIsExecutingSql(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Live SQL Database Header Banner */}
      <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 text-white p-6 rounded-2xl shadow-xl border border-zinc-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center shrink-0">
              <Database className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-extrabold tracking-tight">
                  Live SQL Database Storage & Streamer
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Real-Time WAL Active</span>
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl font-mono text-[11px] truncate" title={stats?.database_file}>
                Database file: <span className="text-amber-300 font-semibold">{stats?.database_file || "Loading..."}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={loadData}
              disabled={isRefreshing}
              className="px-3 py-1.5 rounded-xl bg-zinc-900/10 hover:bg-zinc-900/20 text-white text-xs font-semibold flex items-center space-x-1.5 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              <span>Refresh Stats</span>
            </button>
          </div>
        </div>

        {/* Live SQL Stats Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-white/10 text-xs">
          <div className="bg-zinc-900/5 p-3 rounded-xl border border-white/5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Total SQL Records</div>
            <div className="text-xl font-extrabold text-white mt-0.5">{stats?.total_records ?? 0}</div>
            <div className="text-[10px] text-emerald-400 mt-0.5">Persisted in `members` table</div>
          </div>

          <div className="bg-zinc-900/5 p-3 rounded-xl border border-white/5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Audit Log Events</div>
            <div className="text-xl font-extrabold text-white mt-0.5">{stats?.total_audit_events ?? 0}</div>
            <div className="text-[10px] text-indigo-300 mt-0.5">Append-only SQL trail</div>
          </div>

          <div className="bg-zinc-900/5 p-3 rounded-xl border border-white/5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">DB File Size</div>
            <div className="text-xl font-extrabold text-white mt-0.5">{stats?.file_size_formatted || "0 KB"}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">WAL Buffer: {stats?.wal_size_formatted || "0 KB"}</div>
          </div>

          <div className="bg-zinc-900/5 p-3 rounded-xl border border-white/5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Database Engine</div>
            <div className="text-sm font-extrabold text-white mt-1">SQLite 3 (WAL)</div>
            <div className="text-[10px] text-amber-300 mt-0.5">Instant ACID Transactions</div>
          </div>
        </div>
      </div>

      {/* Real-Time Live Data Generation Streamer Card */}
      <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-800 gap-3">
          <div>
            <h3 className="text-base font-bold text-zinc-100 flex items-center space-x-2">
              <Zap className="w-5 h-5 text-amber-500" />
              <span>Real-Time Data Generator & Streamer</span>
            </h3>
            <p className="text-xs text-zinc-500">
              Continuously stream and persist live hierarchical data directly into the SQL database
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center space-x-2">
            <button
              onClick={toggleStreamer}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 transition shadow-sm ${
                streamerStatus?.isRunning
                  ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200 animate-pulse"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200"
              }`}
            >
              {streamerStatus?.isRunning ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop Real-Time Stream</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Start Real-Time Stream (2s)</span>
                </>
              )}
            </button>

            <button
              onClick={() => handleGenerateBatch(5)}
              disabled={isRefreshing}
              className="px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-950 hover:bg-zinc-850 text-zinc-300 text-xs font-semibold transition"
              title="Immediately insert 5 records into SQL database"
            >
              +5 Records
            </button>

            <button
              onClick={() => handleGenerateBatch(20)}
              disabled={isRefreshing}
              className="px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-950 hover:bg-zinc-850 text-zinc-300 text-xs font-semibold transition"
              title="Immediately insert 20 records into SQL database"
            >
              +20 Records
            </button>
          </div>
        </div>

        {/* Live Stream Event Feed */}
        <div>
          <div className="flex items-center justify-between text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
            <span>Live Stream Log ({streamerStatus?.recentEvents?.length || 0} recent SQL commits)</span>
            <span className="text-[10px] text-zinc-500">Total Streamed: {streamerStatus?.totalGenerated || 0}</span>
          </div>

          <div className="max-h-52 overflow-y-auto border border-zinc-800 rounded-xl bg-slate-900 p-3 font-mono text-[11px] text-slate-300 space-y-1.5 divide-y divide-slate-800">
            {(!streamerStatus?.recentEvents || streamerStatus.recentEvents.length === 0) ? (
              <div className="text-zinc-500 py-4 text-center italic">
                Streamer idle. Click "Start Real-Time Stream" or "+5 Records" to generate data into the SQL database in real time.
              </div>
            ) : (
              streamerStatus.recentEvents.map((ev: any) => (
                <div key={ev.id} className="pt-1.5 first:pt-0 flex items-start justify-between text-xs">
                  <div className="space-x-2">
                    <span className="text-emerald-400 font-bold">[INSERT INTO members]</span>
                    <span className="text-white font-semibold">{ev.name}</span>
                    <span className="text-indigo-400">({ev.level_name})</span>
                    <span className="text-zinc-500">? Parent: {ev.parent_name}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 shrink-0">
                    {new Date(ev.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Direct Live SQL Console & Query Runner */}
      <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div>
            <h3 className="text-base font-bold text-zinc-100 flex items-center space-x-2">
              <Terminal className="w-5 h-5 text-zinc-200" />
              <span>Interactive SQL Query Console</span>
            </h3>
            <p className="text-xs text-zinc-500">
              Execute raw read-only SQL queries directly against the live database file
            </p>
          </div>

          <button
            onClick={() => executeSql(sqlQuery)}
            disabled={isExecutingSql || !sqlQuery.trim()}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center space-x-2 shadow-sm transition disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isExecutingSql ? "Executing..." : "Run SQL Query"}</span>
          </button>
        </div>

        {/* Quick Query Templates */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          <span className="text-zinc-500 font-semibold text-[11px]">Quick Queries:</span>
          <button
            onClick={() => {
              const q = "SELECT m.id, m.name, l.name as level_name, p.name as parent_name, m.depth, m.created_at FROM members m JOIN levels l ON m.level_id = l.id LEFT JOIN members p ON m.parent_id = p.id ORDER BY m.created_at DESC LIMIT 15;";
              setSqlQuery(q);
              executeSql(q);
            }}
            className="px-2.5 py-1 rounded-lg bg-zinc-850 hover:bg-slate-200 text-zinc-300 font-mono text-[11px]"
          >
            SELECT * FROM members
          </button>
          <button
            onClick={() => {
              const q = "SELECT id, action, entity_type, entity_id, user_name, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 15;";
              setSqlQuery(q);
              executeSql(q);
            }}
            className="px-2.5 py-1 rounded-lg bg-zinc-850 hover:bg-slate-200 text-zinc-300 font-mono text-[11px]"
          >
            SELECT * FROM audit_logs
          </button>
          <button
            onClick={() => {
              const q = "SELECT id, name, code, depth_order, allowed_parent_level_ids FROM levels ORDER BY depth_order ASC;";
              setSqlQuery(q);
              executeSql(q);
            }}
            className="px-2.5 py-1 rounded-lg bg-zinc-850 hover:bg-slate-200 text-zinc-300 font-mono text-[11px]"
          >
            SELECT * FROM levels
          </button>
          <button
            onClick={() => {
              const q = "SELECT id, level_id, name, key, field_type, is_required, default_value FROM field_definitions;";
              setSqlQuery(q);
              executeSql(q);
            }}
            className="px-2.5 py-1 rounded-lg bg-zinc-850 hover:bg-slate-200 text-zinc-300 font-mono text-[11px]"
          >
            SELECT * FROM field_definitions
          </button>
        </div>

        {/* SQL Query Editor */}
        <div className="relative">
          <textarea
            value={sqlQuery}
            onChange={e => setSqlQuery(e.target.value)}
            rows={3}
            placeholder="Type your SELECT query here..."
            className="w-full px-4 py-3 rounded-xl border border-zinc-700 bg-slate-900 text-emerald-400 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
          />
        </div>

        {/* Error message */}
        {queryError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono">
            {queryError}
          </div>
        )}

        {/* Query Results Table */}
        {queryResult && (
          <div className="border border-zinc-800 rounded-xl overflow-hidden text-xs">
            <div className="bg-zinc-950 px-4 py-2 border-b border-zinc-800 flex items-center justify-between text-[11px] font-semibold text-zinc-500">
              <span>Returned {queryResult.total_returned} rows</span>
              <span className="font-mono text-zinc-200">Query Time: {queryResult.duration_ms} ms</span>
            </div>

            <div className="max-h-72 overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300 border-collapse">
                <thead className="bg-zinc-850 uppercase text-[10px] font-bold text-zinc-400 border-b border-zinc-800 sticky top-0">
                  <tr>
                    {queryResult.columns.map((col: string) => (
                      <th key={col} className="py-2.5 px-3 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {queryResult.rows.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-indigo-50/40">
                      {queryResult.columns.map((col: string) => (
                        <td key={col} className="py-2 px-3 whitespace-nowrap max-w-xs truncate">
                          {typeof row[col] === "object" ? JSON.stringify(row[col]) : String(row[col] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* SQL Tables Metadata Overview */}
      <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-zinc-100 flex items-center space-x-2">
          <TableIcon className="w-4 h-4 text-zinc-200" />
          <span>Active SQL Database Tables ({tables.length})</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tables.map(t => (
            <div
              key={t.table_name}
              onClick={() => {
                const q = `SELECT * FROM "${t.table_name}" LIMIT 15;`;
                setSqlQuery(q);
                executeSql(q);
              }}
              className="p-3.5 rounded-xl border border-zinc-800 hover:border-indigo-400 hover:bg-indigo-50/20 cursor-pointer transition flex items-center justify-between group"
            >
              <div>
                <div className="font-bold text-xs text-zinc-100 group-hover:text-zinc-200 font-mono">
                  {t.table_name}
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  {t.columns.length} columns • {t.row_count} rows
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-zinc-200 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
