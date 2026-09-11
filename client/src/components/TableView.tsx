import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext.js";
import { api } from "../services/api.js";
import { Member, FieldDefinition } from "../types/index.js";
import {
  Sparkles,
  Copy,
  Check,
  X,
  RefreshCw,
  Plus,
  Search,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Upload,
  Eye,
  Edit2,
  Move,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Columns
} from "lucide-react";

interface TableViewProps {
  onAddMember: () => void;
  onAddColumn: () => void;
  onEditColumn?: (field: FieldDefinition) => void;
  onEditMember: (m: Member) => void;
  onMoveMember: (m: Member) => void;
  onDeleteMember: (m: Member) => void;
  onOpenImport: () => void;
}

export const TableView: React.FC<TableViewProps> = ({
  onAddMember,
  onAddColumn,
  onEditColumn,
  onEditMember,
  onMoveMember,
  onDeleteMember,
  onOpenImport
}) => {
  const {
    activeLevel,
    currentHierarchy,
    selectMember,
    currentUser
  } = useApp();

  const [members, setMembers] = useState<Member[]>([]);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Table options
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  // AI Table Summarization State
  const [showAiSummary, setShowAiSummary] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryData, setSummaryData] = useState<{
    summary: string;
    levelName: string;
    totalCount: number;
    fieldCount: number;
    parentCount: number;
  } | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const handleOpenAiSummary = async () => {
    if (!activeLevel) return;
    setShowAiSummary(true);
    setIsSummarizing(true);
    setSummaryError(null);
    try {
      const res = await api.summarizeLevel(activeLevel.id, currentHierarchy?.id);
      setSummaryData(res);
    } catch (err: any) {
      setSummaryError(err.message || "Failed to generate AI summary");
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleCopySummary = () => {
    if (!summaryData?.summary) return;
    navigator.clipboard.writeText(summaryData.summary);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };


  // Multi-attribute filters
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [showFilterBar, setShowFilterBar] = useState(false);

  const canCreate = currentUser?.role.name === "Super Admin" || currentUser?.role.permissions.includes("member:create");
  const canEdit = currentUser?.role.name === "Super Admin" || currentUser?.role.permissions.includes("member:edit");
  const canMove = currentUser?.role.name === "Super Admin" || currentUser?.role.permissions.includes("member:move");
  const canDelete = currentUser?.role.name === "Super Admin" || currentUser?.role.permissions.includes("member:delete");
  const canManageFields = currentUser?.role.name === "Super Admin" || currentUser?.role.permissions.includes("field:manage");
  const canExport = currentUser?.role.name === "Super Admin" || currentUser?.role.permissions.includes("data:export");
  const canImport = currentUser?.role.name === "Super Admin" || currentUser?.role.permissions.includes("data:import");

  useEffect(() => {
    async function loadFields() {
      if (!activeLevel) return;
      try {
        const fetchedFields = await api.getFields(activeLevel.id);
        setFields(fetchedFields);

        const initialVis: Record<string, boolean> = {
          name: true,
          parent_name: true
        };
        for (const f of fetchedFields) {
          initialVis[f.key] = f.is_visible_default;
        }
        setVisibleColumns(initialVis);
      } catch (err) {
        console.error("Failed to load level fields", err);
      }
    }
    loadFields();
    setPage(1);
  }, [activeLevel]);

  const loadData = async () => {
    if (!activeLevel) return;
    try {
      setIsLoading(true);
      const params: Record<string, any> = {
        page,
        limit,
        sortKey,
        sortOrder,
        hierarchy_id: currentHierarchy?.id
      };

      if (search.trim()) {
        params.search = search.trim();
      }

      for (const [k, v] of Object.entries(activeFilters)) {
        if (v.trim()) {
          params[`filter_${k}`] = v.trim();
        }
      }

      const res = await api.getMembersByLevel(activeLevel.id, params);
      setMembers(res.items);
      setTotalCount(res.total);
    } catch (err) {
      console.error("Failed to load records", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeLevel, page, limit, sortKey, sortOrder, search, activeFilters]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const handleExport = (format: "csv" | "json") => {
    if (!activeLevel) return;
    const url = api.getExportUrl(activeLevel.id, format, currentHierarchy?.id);
    window.open(url, "_blank");
  };

  const toggleColumnVisibility = (key: string) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDeleteColumn = async (field: FieldDefinition) => {
    if (!window.confirm(`Are you sure you want to delete column "${field.name}"? This action will permanently delete this column and its data across all records at this level.`)) {
      return;
    }
    try {
      await api.deleteField(field.id);
      if (activeLevel) {
        const refreshed = await api.getFields(activeLevel.id);
        setFields(refreshed);
      }
    } catch (err: any) {
      alert("Failed to delete column: " + err.message);
    }
  };

  const totalPages = Math.ceil(totalCount / limit) || 1;

  if (!activeLevel) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 p-12 text-center text-zinc-500 text-xs">
        Select a level from the side navigator to view its records.
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 flex flex-col min-h-[500px]">
      {/* Top Header */}
      <div className="p-5 border-b border-zinc-800 bg-zinc-900 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="text-lg font-bold text-zinc-100">
              All {activeLevel.name}
            </h2>
            <span
              className="px-2.5 py-0.5 text-xs font-bold font-mono bg-zinc-800 border border-zinc-700 text-zinc-300"
            >
              Level View ({totalCount} total)
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Showing all records at this level across all permitted branches with dynamic schema columns
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex items-center flex-wrap gap-2">
          {/* AI Table Summary Button */}
          <button
            onClick={handleOpenAiSummary}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700 font-bold text-xs flex items-center space-x-1.5 transition cursor-pointer"
            title="Summarize this level dataset with AI"
          >
            <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
            <span>AI Summarize Table</span>
          </button>

          {canCreate && (
            <button
              onClick={onAddMember}
              className="px-3 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs flex items-center space-x-1.5 transition cursor-pointer border border-zinc-200"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add {activeLevel.name}</span>
            </button>
          )}

          {canManageFields && (
            <button
              onClick={onAddColumn}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-semibold text-xs flex items-center space-x-1.5 transition cursor-pointer"
              title="Add new dynamic field to this level schema"
            >
              <Plus className="w-3.5 h-3.5 text-zinc-400" />
              <span>+ Add Column</span>
            </button>
          )}

          {canImport && (
            <button
              onClick={onOpenImport}
              className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-medium text-xs flex items-center space-x-1.5 transition cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-zinc-400" />
              <span>Import</span>
            </button>
          )}

          {canExport && (
            <div className="flex items-center border border-zinc-700 bg-zinc-800 p-0.5 text-xs">
              <button
                onClick={() => handleExport("csv")}
                className="px-2 py-1 hover:bg-zinc-700 text-zinc-200 font-medium flex items-center space-x-1 cursor-pointer"
                title="Export CSV"
              >
                <Download className="w-3 h-3 text-zinc-400" />
                <span>CSV</span>
              </button>
              <button
                onClick={() => handleExport("json")}
                className="px-2 py-1 hover:bg-zinc-700 text-zinc-200 font-medium cursor-pointer"
                title="Export JSON"
              >
                JSON
              </button>
            </div>
          )}

          {/* Column Picker Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowColumnPicker(!showColumnPicker)}
              className="px-2.5 py-1.5 border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center space-x-1 cursor-pointer"
              title="Toggle Columns"
            >
              <Columns className="w-3.5 h-3.5 text-zinc-400" />
              <span>Columns</span>
            </button>

            {showColumnPicker && (
              <div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-800 p-2.5 z-50 text-xs shadow-2xl">
                <div className="font-bold text-zinc-200 pb-1.5 border-b border-zinc-800 mb-1.5">
                  Configure Visible Columns
                </div>
                <label className="flex items-center space-x-2 py-1 cursor-pointer hover:bg-zinc-800 px-1 text-zinc-300">
                  <input
                    type="checkbox"
                    checked={visibleColumns["parent_name"] !== false}
                    onChange={() => toggleColumnVisibility("parent_name")}
                    className="text-zinc-200 focus:ring-0 bg-zinc-950 border-zinc-700"
                  />
                  <span>Parent Member</span>
                </label>
                {fields.map(f => (
                  <div key={f.id} className="flex items-center justify-between py-1 hover:bg-zinc-800 px-1 text-zinc-300">
                    <label className="flex items-center space-x-2 cursor-pointer truncate flex-1">
                      <input
                        type="checkbox"
                        checked={visibleColumns[f.key] !== false}
                        onChange={() => toggleColumnVisibility(f.key)}
                        className="text-zinc-200 focus:ring-0 bg-zinc-950 border-zinc-700"
                      />
                      <span className="truncate">{f.name}</span>
                    </label>
                    {canManageFields && (
                      <div className="flex items-center space-x-0.5 ml-1">
                        {onEditColumn && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditColumn(f);
                            }}
                            className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition cursor-pointer"
                            title={`Edit column "${f.name}" & acceptable items`}
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteColumn(f);
                          }}
                          className="p-1 text-zinc-500 hover:text-red-400 hover:bg-zinc-700 transition cursor-pointer"
                          title={`Delete column "${f.name}"`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="px-5 py-3 bg-zinc-950 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2 flex-1 max-w-sm">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={`Search ${activeLevel.name.toLowerCase()}...`}
              className="w-full pl-8 pr-3 py-1.5 border border-zinc-800 bg-zinc-900 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 placeholder:text-zinc-600"
            />
          </div>
        </div>

        <button
          onClick={() => setShowFilterBar(!showFilterBar)}
          className={`px-2.5 py-1.5 border text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer ${
            showFilterBar
              ? "bg-zinc-800 border-zinc-700 text-white"
              : "border-zinc-800 bg-zinc-900 hover:bg-zinc-850 text-zinc-400"
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          <span>Advanced Filters {Object.keys(activeFilters).length > 0 && `(${Object.keys(activeFilters).length})`}</span>
        </button>
      </div>

      {/* Advanced Filter Inputs */}
      {showFilterBar && (
        <div className="p-4 bg-zinc-950 border-b border-zinc-800 text-xs flex flex-wrap gap-3 items-center">
          {fields.slice(0, 5).map(f => (
            <div key={f.id} className="flex items-center space-x-1.5">
              <span className="font-semibold text-zinc-400 text-[11px]">{f.name}:</span>
              <input
                type="text"
                value={activeFilters[f.key] || ""}
                onChange={e => {
                  setActiveFilters(prev => ({
                    ...prev,
                    [f.key]: e.target.value
                  }));
                  setPage(1);
                }}
                placeholder={`Filter by ${f.name.toLowerCase()}`}
                className="px-2 py-1 border border-zinc-800 bg-zinc-900 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 w-36 placeholder:text-zinc-600"
              />
            </div>
          ))}
          {Object.keys(activeFilters).length > 0 && (
            <button
              onClick={() => {
                setActiveFilters({});
                setPage(1);
              }}
              className="text-xs text-red-400 hover:underline font-semibold ml-2 cursor-pointer"
            >
              Clear All Filters
            </button>
          )}
        </div>
      )}

      {/* Data Table */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left text-xs text-zinc-300 border-collapse">
          <thead className="bg-zinc-950 text-zinc-400 uppercase text-[10px] font-bold tracking-wider border-b border-zinc-800 sticky top-0">
            <tr>
              <th
                onClick={() => handleSort("name")}
                className="py-3 px-4 cursor-pointer hover:bg-zinc-900 transition whitespace-nowrap"
              >
                <div className="flex items-center space-x-1">
                  <span>Member Name</span>
                  {sortKey === "name" ? (
                    sortOrder === "asc" ? <ArrowUp className="w-3 h-3 text-white" /> : <ArrowDown className="w-3 h-3 text-white" />
                  ) : (
                    <ArrowUpDown className="w-3 h-3 text-zinc-600" />
                  )}
                </div>
              </th>

              {visibleColumns["parent_name"] !== false && (
                <th className="py-3 px-4 whitespace-nowrap">
                  Parent Branch
                </th>
              )}

              {fields.map(f => {
                if (visibleColumns[f.key] === false) return null;
                return (
                  <th
                    key={f.id}
                    className="py-3 px-4 hover:bg-zinc-900 transition whitespace-nowrap group/th"
                  >
                    <div className="flex items-center justify-between space-x-2">
                      <div
                        onClick={() => handleSort(f.key)}
                        className="flex items-center space-x-1 cursor-pointer"
                      >
                        <span>{f.name}</span>
                        {sortKey === f.key ? (
                          sortOrder === "asc" ? <ArrowUp className="w-3 h-3 text-white" /> : <ArrowDown className="w-3 h-3 text-white" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-zinc-600" />
                        )}
                      </div>
                      {canManageFields && (
                        <div className="opacity-0 group-hover/th:opacity-100 flex items-center space-x-0.5 transition">
                          {onEditColumn && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditColumn(f);
                              }}
                              className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition"
                              title={`Edit column "${f.name}" & acceptable values`}
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteColumn(f);
                            }}
                            className="p-1 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition"
                            title={`Delete column "${f.name}"`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </th>
                );
              })}

              <th className="py-3 px-4 text-right whitespace-nowrap">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80 font-medium">
            {isLoading ? (
              <tr>
                <td colSpan={fields.length + 3} className="py-12 text-center text-zinc-500">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="w-5 h-5 border-2 border-zinc-400 border-t-transparent animate-spin" />
                    <span>Loading records...</span>
                  </div>
                </td>
              </tr>
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={fields.length + 3} className="py-12 text-center text-zinc-500">
                  No records match the current criteria.
                </td>
              </tr>
            ) : (
              members.map(member => (
                <tr
                  key={member.id}
                  className="hover:bg-zinc-850/60 transition group cursor-pointer"
                  onClick={() => selectMember(member)}
                >
                  {/* Name */}
                  <td className="py-3 px-4 font-semibold text-zinc-200 group-hover:text-white">
                    <div className="flex items-center space-x-2">
                      <span>{member.name}</span>
                      {member.children_count !== undefined && member.children_count > 0 && (
                        <span className="px-1.5 py-0.2 text-[9px] font-bold bg-zinc-800 border border-zinc-700 text-zinc-400 font-mono">
                          {member.children_count}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Parent Member */}
                  {visibleColumns["parent_name"] !== false && (
                    <td className="py-3 px-4 text-zinc-400 whitespace-nowrap">
                      {member.parent_name ? (
                        <span className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-300 text-[11px] font-medium">
                          {member.parent_name}
                        </span>
                      ) : (
                        <span className="text-zinc-600 text-[10px] italic">None (Root)</span>
                      )}
                    </td>
                  )}

                  {/* Dynamic Fields */}
                  {fields.map(f => {
                    if (visibleColumns[f.key] === false) return null;
                    const val = member.custom_data[f.key];

                    return (
                      <td key={f.id} className="py-3 px-4 whitespace-nowrap text-zinc-300">
                        {val === undefined || val === null || val === "" ? (
                          <span className="text-zinc-700">-</span>
                        ) : f.field_type === "boolean" ? (
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold border ${
                              val ? "bg-zinc-800 border-zinc-700 text-emerald-400" : "bg-zinc-800 border-zinc-700 text-zinc-500"
                            }`}
                          >
                            {val ? "Yes" : "No"}
                          </span>
                        ) : f.field_type === "single_select" ? (
                          <span className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-200 font-semibold text-[11px]">
                            {String(val)}
                          </span>
                        ) : f.field_type === "email" ? (
                          <a
                            href={`mailto:${val}`}
                            onClick={e => e.stopPropagation()}
                            className="text-zinc-300 hover:text-white hover:underline"
                          >
                            {String(val)}
                          </a>
                        ) : (
                          <span>{String(val)}</span>
                        )}
                      </td>
                    );
                  })}

                  {/* Actions */}
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div
                      className="flex items-center justify-end space-x-1"
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        onClick={() => selectMember(member)}
                        className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
                        title="View Details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      {canEdit && (
                        <button
                          onClick={() => onEditMember(member)}
                          className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {canMove && (
                        <button
                          onClick={() => onMoveMember(member)}
                          className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
                          title="Move"
                        >
                          <Move className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {canDelete && (
                        <button
                          onClick={() => onDeleteMember(member)}
                          className="p-1 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-4 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400 bg-zinc-950">
        <div className="flex items-center space-x-2">
          <span>Rows per page:</span>
          <select
            value={limit}
            onChange={e => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
            className="px-2 py-1 border border-zinc-800 bg-zinc-900 text-zinc-200 font-medium focus:outline-none"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span>
            Showing {members.length > 0 ? (page - 1) * limit + 1 : 0} to {Math.min(page * limit, totalCount)} of {totalCount} records
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="p-1.5 border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-zinc-300"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="font-semibold text-zinc-200">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="p-1.5 border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-zinc-300"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* AI Table Summary Modal */}
      {showAiSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-zinc-200" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                    <span>AI Dataset Executive Summary</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono">
                      {activeLevel.name}
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400 font-mono">
                    Deep analysis of records, dynamic attributes, and hierarchy distributions
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAiSummary(false)}
                className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Metrics Quick Bar */}
            {summaryData && (
              <div className="grid grid-cols-3 gap-px bg-zinc-800 border-b border-zinc-800 text-center text-xs">
                <div className="bg-zinc-900/90 py-2.5 px-3">
                  <div className="text-[10px] uppercase font-mono text-zinc-400">Total Records</div>
                  <div className="text-base font-bold text-zinc-100 font-mono">{summaryData.totalCount ?? totalCount}</div>
                </div>
                <div className="bg-zinc-900/90 py-2.5 px-3">
                  <div className="text-[10px] uppercase font-mono text-zinc-400">Configured Attributes</div>
                  <div className="text-base font-bold text-zinc-100 font-mono">{summaryData.fieldCount ?? fields.length}</div>
                </div>
                <div className="bg-zinc-900/90 py-2.5 px-3">
                  <div className="text-[10px] uppercase font-mono text-zinc-400">Parent Groups</div>
                  <div className="text-base font-bold text-zinc-100 font-mono">{summaryData.parentCount ?? 0}</div>
                </div>
              </div>
            )}

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto flex-1 text-zinc-200 text-xs leading-relaxed space-y-4 font-sans select-text">
              {isSummarizing ? (
                <div className="py-16 flex flex-col items-center justify-center space-y-3 text-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-zinc-400" />
                  <p className="font-bold text-sm text-zinc-200 uppercase tracking-wider">
                    Synthesizing {activeLevel.name} Dataset
                  </p>
                  <p className="text-zinc-500 max-w-sm text-xs font-mono">
                    Analyzing member records, branch groupings, and dynamic attributes via AI engine...
                  </p>
                </div>
              ) : summaryError ? (
                <div className="py-10 flex flex-col items-center justify-center space-y-3 text-center">
                  <div className="p-3 border border-red-800 bg-red-950/40 text-red-300 max-w-md">
                    <p className="font-bold text-sm mb-1">Failed to Generate Summary</p>
                    <p className="text-xs text-red-400 font-mono">{summaryError}</p>
                  </div>
                  <button
                    onClick={handleOpenAiSummary}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Try Again</span>
                  </button>
                </div>
              ) : summaryData?.summary ? (
                <div className="prose prose-invert max-w-none text-xs leading-relaxed whitespace-pre-wrap font-sans text-zinc-200 bg-zinc-950/50 p-4 border border-zinc-800/80">
                  {summaryData.summary}
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 border-t border-zinc-800 flex items-center justify-between bg-zinc-950">
              <span className="text-[11px] text-zinc-400 font-mono">
                Powered by NVIDIA Cloud AI Engine
              </span>
              <div className="flex items-center space-x-2">
                {summaryData?.summary && (
                  <button
                    onClick={handleCopySummary}
                    className="px-3.5 py-1.5 border border-zinc-700 bg-zinc-850 hover:bg-zinc-800 text-zinc-200 font-bold text-xs flex items-center space-x-1.5 transition cursor-pointer"
                  >
                    {copiedSummary ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                    <span>{copiedSummary ? "Copied!" : "Copy Summary"}</span>
                  </button>
                )}
                <button
                  onClick={() => setShowAiSummary(false)}
                  className="px-4 py-1.5 bg-zinc-100 hover:bg-white text-black font-bold text-xs transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
