import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext.js";
import { api } from "../services/api.js";
import { Member, FieldDefinition } from "../types/index.js";
import { DynamicIcon } from "./DynamicIcon.js";
import {
  Edit2,
  Move,
  Trash2,
  Plus,
  ChevronRight,
  Clock,
  Layers,
  Info,
  Calendar,
  Phone,
  Mail,
  Link as LinkIcon,
  CheckCircle2,
  XCircle
} from "lucide-react";

interface MemberDetailViewProps {
  onEdit: (m: Member) => void;
  onMove: (m: Member) => void;
  onDelete: (m: Member) => void;
  onAddChild: (m: Member) => void;
}

export const MemberDetailView: React.FC<MemberDetailViewProps> = ({
  onEdit,
  onMove,
  onDelete,
  onAddChild
}) => {
  const { activeMember, selectMember, currentUser, levels } = useApp();

  const subordinateLevels = levels.filter(l => l.allowed_parent_level_ids && l.allowed_parent_level_ids.includes(activeMember?.level_id || ""));
  const anyExplicitRules = levels.some(l => l.allowed_parent_level_ids && l.allowed_parent_level_ids.length > 0);
  const activeLevelIdx = levels.findIndex(l => l.id === activeMember?.level_id);
  const hasSubordinate = subordinateLevels.length > 0 || (!anyExplicitRules && activeLevelIdx !== -1 && activeLevelIdx + 1 < levels.length);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [children, setChildren] = useState<Member[]>([]);
  const [parent, setParent] = useState<Member | null>(null);
  const [ancestors, setAncestors] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const canEdit = currentUser?.role.name === "Super Admin" || currentUser?.role.permissions.includes("member:edit");
  const canMove = currentUser?.role.name === "Super Admin" || currentUser?.role.permissions.includes("member:move");
  const canDelete = currentUser?.role.name === "Super Admin" || currentUser?.role.permissions.includes("member:delete");
  const canAddChild = currentUser?.role.name === "Super Admin" || currentUser?.role.permissions.includes("member:create");

  const loadMemberDetails = async () => {
    if (!activeMember) return;
    try {
      setIsLoading(true);
      const [fieldDefs, childList, parentRecord, ancestorList] = await Promise.all([
        api.getFields(activeMember.level_id),
        api.getChildren(activeMember.id),
        api.getParent(activeMember.id),
        api.getAncestors(activeMember.id)
      ]);

      setFields(fieldDefs);
      setChildren(childList);
      setParent(parentRecord);
      setAncestors(ancestorList);
    } catch (err) {
      console.error("Failed to load full member details", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMemberDetails();
  }, [activeMember]);

  if (!activeMember) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 p-12 text-center text-zinc-500 text-xs">
        No record selected. Click on any member from the tree or table to inspect details.
      </div>
    );
  }

  const renderFieldValue = (field: FieldDefinition, value: any) => {
    if (value === undefined || value === null || value === "") {
      return <span className="text-zinc-600 italic">Not set</span>;
    }

    switch (field.field_type) {
      case "boolean":
        return value ? (
          <span className="flex items-center space-x-1 text-emerald-400 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Yes</span>
          </span>
        ) : (
          <span className="flex items-center space-x-1 text-red-400 font-semibold">
            <XCircle className="w-3.5 h-3.5" />
            <span>No</span>
          </span>
        );
      case "email":
        return (
          <a
            href={`mailto:${value}`}
            className="text-zinc-300 hover:text-white hover:underline flex items-center space-x-1 font-medium"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>{value}</span>
          </a>
        );
      case "phone":
        return (
          <a
            href={`tel:${value}`}
            className="text-zinc-300 hover:text-white hover:underline flex items-center space-x-1 font-medium"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>{value}</span>
          </a>
        );
      case "url":
        return (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="text-zinc-300 hover:text-white hover:underline flex items-center space-x-1 font-medium"
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span className="truncate max-w-xs">{value}</span>
          </a>
        );
      case "single_select":
        return (
          <span className="px-2.5 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold text-xs">
            {value}
          </span>
        );
      case "multi_select":
        return (
          <div className="flex flex-wrap gap-1">
            {(Array.isArray(value) ? value : [value]).map((v: any) => (
              <span key={v} className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-200 font-medium text-xs">
                {v}
              </span>
            ))}
          </div>
        );
      default:
        return <span className="font-semibold text-zinc-200">{String(value)}</span>;
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 shadow-sm flex flex-col space-y-6 p-6">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-800 gap-4">
        <div className="flex items-center space-x-4">
          <div
            className="w-12 h-12 border border-zinc-700 bg-zinc-800 text-zinc-200 flex items-center justify-center shrink-0"
          >
            <DynamicIcon name="Folder" className="w-6 h-6" />
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold text-zinc-100">{activeMember.name}</h1>
              <span
                className="px-2 py-0.5 text-xs font-mono font-bold bg-zinc-800 border border-zinc-700 text-zinc-300"
              >
                {activeMember.level_name}
              </span>
            </div>
            <div className="text-xs text-zinc-500 mt-1 flex items-center space-x-3">
              <span>ID: <code className="text-zinc-400 font-mono">{activeMember.id.slice(0, 8)}</code></span>
              <span>&bull;</span>
              <span className="flex items-center space-x-1">
                <Clock className="w-3 h-3 text-zinc-500" />
                <span>Created {new Date(activeMember.created_at).toLocaleDateString()}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center flex-wrap gap-2">
          {canAddChild && hasSubordinate && (
            <button
              onClick={() => onAddChild(activeMember)}
              className="px-3 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs flex items-center space-x-1.5 transition cursor-pointer border border-zinc-200"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Subordinate</span>
            </button>
          )}

          {canEdit && (
            <button
              onClick={() => onEdit(activeMember)}
              className="px-3 py-1.5 border border-zinc-700 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 font-medium text-xs flex items-center space-x-1.5 transition cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5 text-zinc-400" />
              <span>Edit</span>
            </button>
          )}

          {canMove && (
            <button
              onClick={() => onMove(activeMember)}
              className="px-3 py-1.5 border border-zinc-700 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 font-medium text-xs flex items-center space-x-1.5 transition cursor-pointer"
            >
              <Move className="w-3.5 h-3.5 text-zinc-400" />
              <span>Move / Re-parent</span>
            </button>
          )}

          {canDelete && (
            <button
              onClick={() => onDelete(activeMember)}
              className="px-3 py-1.5 border border-zinc-700 bg-zinc-800 hover:bg-zinc-750 text-red-400 font-medium text-xs flex items-center space-x-1.5 transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Ancestor Breadcrumbs */}
      <div className="bg-zinc-950 border border-zinc-800 p-3 flex items-center space-x-2 overflow-x-auto text-xs">
        <span className="font-bold text-zinc-500 uppercase tracking-wider text-[10px] shrink-0">Path:</span>
        <span
          onClick={() => selectMember(null)}
          className="text-zinc-400 hover:text-zinc-200 cursor-pointer font-medium shrink-0"
        >
          Root
        </span>
        {ancestors.map(a => (
          <React.Fragment key={a.id}>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
            <span
              onClick={() => selectMember(a)}
              className="text-zinc-300 hover:text-white cursor-pointer font-medium shrink-0"
            >
              {a.name}
            </span>
          </React.Fragment>
        ))}
        <ChevronRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
        <span className="font-bold text-white shrink-0">{activeMember.name}</span>
      </div>

      {/* Main Grid: Custom Attributes & Direct Subordinates */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Schema Attributes */}
        <div className="lg:col-span-2 space-y-4">
          <div className="border border-zinc-800 bg-zinc-950 p-5">
            <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider mb-4 flex items-center space-x-2">
              <Info className="w-4 h-4 text-zinc-400" />
              <span>{activeMember.level_name} Custom Attributes</span>
            </h2>

            {fields.length === 0 ? (
              <div className="text-xs text-zinc-500 py-4">
                No custom attributes defined for this level yet. Add fields in the Configure Levels tab.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {fields.map(f => (
                  <div key={f.id} className="p-3 border border-zinc-800 bg-zinc-900">
                    <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                      {f.name}
                    </div>
                    <div className="mt-1 text-xs">
                      {renderFieldValue(f, activeMember.custom_data[f.key])}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Col: Direct Subordinates / Children */}
        <div className="border border-zinc-800 bg-zinc-950 p-5 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-3">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-zinc-400" />
              <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
                Direct Children ({children.length})
              </h2>
            </div>
            {canAddChild && hasSubordinate && (
              <button
                onClick={() => onAddChild(activeMember)}
                className="text-xs text-zinc-300 hover:text-white font-semibold flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add</span>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 max-h-96">
            {children.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500">
                No direct subordinate members.
              </div>
            ) : (
              children.map(child => (
                <div
                  key={child.id}
                  onClick={() => selectMember(child)}
                  className="p-2.5 border border-zinc-800 hover:border-zinc-700 bg-zinc-900 hover:bg-zinc-850 cursor-pointer flex items-center justify-between group transition"
                >
                  <div>
                    <div className="text-xs font-bold text-zinc-200 group-hover:text-white">
                      {child.name}
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">
                      {child.level_name}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300" />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
