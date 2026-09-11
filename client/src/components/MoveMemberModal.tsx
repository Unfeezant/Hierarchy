import React, { useState, useEffect } from "react";
import { Member, Level } from "../types/index.js";
import { api } from "../services/api.js";
import { X, AlertCircle, Move, Check } from "lucide-react";

interface MoveMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updated: Member) => void;
  member: Member;
  levels: Level[];
}

export const MoveMemberModal: React.FC<MoveMemberModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  member,
  levels
}) => {
  const [candidates, setCandidates] = useState<Member[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(member.parent_id);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memberLevel = levels.find(l => l.id === member.level_id);
  const allowedParentLevelIds = memberLevel?.allowed_parent_level_ids || [];

  useEffect(() => {
    if (!isOpen) return;

    async function loadCandidates() {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch candidate parents across the allowed parent levels
        const candidateList: Member[] = [];

        for (const pLevelId of allowedParentLevelIds) {
          const res = await api.getMembersByLevel(pLevelId, {
            hierarchy_id: member.hierarchy_id,
            limit: 200
          });
          candidateList.push(...res.items);
        }

        // Filter out the member itself and its descendants
        const validCandidates = candidateList.filter(
          c => c.id !== member.id && !c.path.startsWith(member.path)
        );

        setCandidates(validCandidates);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }

    loadCandidates();
  }, [isOpen, member, memberLevel]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setError(null);
      const updated = await api.moveMember(member.id, selectedParentId);
      onSuccess(updated);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-800 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Move className="w-5 h-5 text-zinc-200" />
            <div>
              <h3 className="text-base font-bold text-zinc-100">Move / Re-parent Member</h3>
              <p className="text-xs text-zinc-500">
                Reassign <strong>{member.name}</strong> to a different valid parent branch
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-500 hover:text-zinc-400 hover:bg-zinc-850">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block font-bold text-zinc-300 uppercase tracking-wider mb-2">
              Select New Parent Member:
            </label>

            {isLoading ? (
              <div className="py-8 text-center text-zinc-500">Loading valid parent targets...</div>
            ) : (
              <div className="max-h-60 overflow-y-auto border border-zinc-800 rounded-xl divide-y divide-slate-100">
                {/* Option for Root if allowed */}
                {allowedParentLevelIds.length === 0 && (
                  <div
                    onClick={() => setSelectedParentId(null)}
                    className={`p-3 cursor-pointer hover:bg-zinc-800 flex items-center justify-between ${
                      selectedParentId === null ? "bg-zinc-800/80 font-bold text-indigo-700" : "text-zinc-300"
                    }`}
                  >
                    <span>None (Make Top-Level Root)</span>
                    {selectedParentId === null && <Check className="w-4 h-4 text-zinc-200" />}
                  </div>
                )}

                {candidates.map(candidate => {
                  const isSelected = selectedParentId === candidate.id;
                  return (
                    <div
                      key={candidate.id}
                      onClick={() => setSelectedParentId(candidate.id)}
                      className={`p-3 cursor-pointer hover:bg-zinc-800 flex items-center justify-between transition ${
                        isSelected ? "bg-zinc-800/80 font-bold text-indigo-700" : "text-zinc-300"
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-zinc-100">{candidate.name}</div>
                        <div className="text-[11px] text-zinc-500">Level: {candidate.level_name}</div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-zinc-200" />}
                    </div>
                  );
                })}

                {candidates.length === 0 && allowedParentLevelIds.length > 0 && (
                  <div className="p-4 text-center text-zinc-500">
                    No valid parent candidates found in the allowed levels.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-zinc-800 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-zinc-800 font-semibold text-zinc-400 hover:bg-zinc-950 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || selectedParentId === member.parent_id}
              className="px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-bold border border-zinc-200 font-bold shadow-sm transition disabled:opacity-50"
            >
              {isSubmitting ? "Moving..." : "Confirm Move"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
