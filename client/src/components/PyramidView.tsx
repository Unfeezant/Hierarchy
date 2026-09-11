import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext.js";
import { api } from "../services/api.js";
import { PyramidTierSummary } from "../types/index.js";
import { DynamicIcon } from "./DynamicIcon.js";
import { ChevronRight, Users, Layers, ArrowDown } from "lucide-react";

export const PyramidView: React.FC = () => {
  const { currentHierarchy, setActiveLevel, setViewMode } = useApp();
  const [summary, setSummary] = useState<{ tiers: PyramidTierSummary[]; totalMembers: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!currentHierarchy) return;
      try {
        setIsLoading(true);
        const data = await api.getPyramidSummary(currentHierarchy.id);
        setSummary(data);
      } catch (err) {
        console.error("Failed to load pyramid summary", err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [currentHierarchy]);

  const handleTierClick = (lvl: any) => {
    setActiveLevel(lvl);
    setViewMode("table"); // Jump directly to level-wide view
  };

  if (isLoading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 p-12 text-center text-zinc-500 text-xs flex flex-col items-center justify-center space-y-2">
        <div className="w-5 h-5 border-2 border-zinc-400 border-t-transparent animate-spin" />
        <span>Calculating pyramid structure...</span>
      </div>
    );
  }

  const tiers = summary?.tiers || [];

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-zinc-800">
        <div>
          <h2 className="text-lg font-bold text-zinc-100 flex items-center space-x-2">
            <Layers className="w-5 h-5 text-zinc-400" />
            <span>Pyramid Tier Visualization</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Visual hierarchy distribution across {tiers.length} depth tiers ({summary?.totalMembers || 0} total records)
          </p>
        </div>

        <div className="flex items-center space-x-2 bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300">
          <Users className="w-4 h-4 text-zinc-400" />
          <span>Total Records: {summary?.totalMembers || 0}</span>
        </div>
      </div>

      {/* Visual Pyramid Stacking */}
      <div className="py-8 flex flex-col items-center space-y-4 max-w-4xl mx-auto">
        {tiers.map((tier, idx) => {
          const minW = 45;
          const maxW = 100;
          const widthPercent = tiers.length > 1
            ? minW + ((maxW - minW) / (tiers.length - 1)) * idx
            : 70;

          return (
            <div
              key={tier.level.id}
              style={{ width: `${widthPercent}%` }}
              onClick={() => handleTierClick(tier.level)}
              className="group relative cursor-pointer transform hover:-translate-y-0.5 transition-all duration-200"
            >
              {/* Connector line between tiers */}
              {idx > 0 && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-zinc-700" />
              )}

              <div className="p-4 border border-zinc-800 hover:border-zinc-700 bg-zinc-950 hover:bg-zinc-900 transition-all flex items-center justify-between">
                {/* Left: Level Icon, Name & Depth */}
                <div className="flex items-center space-x-3.5">
                  <div className="w-10 h-10 border border-zinc-700 bg-zinc-800 flex items-center justify-center shrink-0 text-zinc-200">
                    <DynamicIcon name={tier.level.icon || "Folder"} className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="font-bold text-sm text-zinc-100 group-hover:text-white transition">
                        {tier.level.name}
                      </h3>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 bg-zinc-850 border border-zinc-700 text-zinc-400">
                        Tier {idx + 1}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {tier.percentage.toFixed(1)}% of total system records
                    </p>
                  </div>
                </div>

                {/* Right: Record count & Jump Arrow */}
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <div className="text-base font-bold font-mono text-zinc-100">
                      {tier.member_count.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                      Records
                    </div>
                  </div>

                  <div className="w-8 h-8 flex items-center justify-center bg-zinc-850 border border-zinc-800 text-zinc-500 group-hover:text-zinc-200 transition">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
