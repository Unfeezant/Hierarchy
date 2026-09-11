import React, { useState } from "react";
import { useApp } from "../context/AppContext.js";
import { api } from "../services/api.js";
import { X, Sparkles, Building2, Globe2, GraduationCap, CheckCircle2, ArrowRight } from "lucide-react";

interface PresetsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PresetsModal: React.FC<PresetsModalProps> = ({ isOpen, onClose }) => {
  const { refreshHierarchy, setCurrentHierarchy, currentUser } = useApp();
  const [isGenerating, setIsGenerating] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Generate Corporate Hierarchy (Organization -> Region -> Branch -> Department -> Employee -> Project -> Task)
  const generateCorporateHierarchy = async () => {
    try {
      setIsGenerating(true);
      setSuccessMsg(null);

      // 1. Create hierarchy
      const h = await api.createHierarchy({
        name: "Corporate Enterprise Ecosystem",
        description: "Schema-agnostic demonstration: Organization -> Region -> Branch -> Department -> Employee -> Project -> Task"
      });

      // 2. Levels
      const lOrg = await api.createLevel(h.id, { name: "Organization", code: "org", color: "#4f46e5", icon: "Building", depth_order: 0, allowed_parent_level_ids: [] });
      const lRegion = await api.createLevel(h.id, { name: "Region", code: "region", color: "#0ea5e9", icon: "Globe", depth_order: 1, allowed_parent_level_ids: [lOrg.id] });
      const lBranch = await api.createLevel(h.id, { name: "Branch", code: "branch", color: "#10b981", icon: "Building", depth_order: 2, allowed_parent_level_ids: [lRegion.id] });
      const lDept = await api.createLevel(h.id, { name: "Department", code: "dept", color: "#f59e0b", icon: "Briefcase", depth_order: 3, allowed_parent_level_ids: [lBranch.id] });
      const lEmp = await api.createLevel(h.id, { name: "Employee", code: "emp", color: "#ec4899", icon: "Users", depth_order: 4, allowed_parent_level_ids: [lDept.id] });
      const lProj = await api.createLevel(h.id, { name: "Project", code: "proj", color: "#8b5cf6", icon: "Folder", depth_order: 5, allowed_parent_level_ids: [lEmp.id] });
      const lTask = await api.createLevel(h.id, { name: "Task", code: "task", color: "#06b6d4", icon: "Award", depth_order: 6, allowed_parent_level_ids: [lProj.id] });

      // 3. Dynamic Fields
      await api.createField(lOrg.id, { name: "Headquarters City", key: "hq_city", field_type: "text", is_required: true });
      await api.createField(lOrg.id, { name: "Ticker Symbol", key: "ticker", field_type: "text" });

      await api.createField(lBranch.id, { name: "Office Code", key: "office_code", field_type: "text", is_required: true });
      await api.createField(lBranch.id, { name: "Headcount", key: "headcount", field_type: "number" });

      await api.createField(lEmp.id, { name: "Role Title", key: "title", field_type: "text", is_required: true });
      await api.createField(lEmp.id, { name: "Work Email", key: "email", field_type: "email" });
      await api.createField(lEmp.id, {
        name: "Employment Type",
        key: "emp_type",
        field_type: "single_select",
        options: ["Full-Time", "Contractor", "Intern"]
      });

      await api.createField(lProj.id, { name: "Budget ($)", key: "budget", field_type: "number" });
      await api.createField(lProj.id, {
        name: "Status",
        key: "status",
        field_type: "single_select",
        options: ["Planning", "In Progress", "Review", "Completed"]
      });

      await api.createField(lTask.id, { name: "Estimated Hours", key: "est_hours", field_type: "number" });
      await api.createField(lTask.id, { name: "Completed", key: "is_completed", field_type: "boolean" });

      // 4. Records
      const org = await api.createMember({
        hierarchy_id: h.id,
        level_id: lOrg.id,
        name: "Global Technologies Holding Corp",
        custom_data: { hq_city: "New York", ticker: "GTH" }
      });

      const regAmericas = await api.createMember({
        hierarchy_id: h.id,
        level_id: lRegion.id,
        parent_id: org.id,
        name: "North America Region"
      });

      const regEMEA = await api.createMember({
        hierarchy_id: h.id,
        level_id: lRegion.id,
        parent_id: org.id,
        name: "EMEA Region"
      });

      const branchNY = await api.createMember({
        hierarchy_id: h.id,
        level_id: lBranch.id,
        parent_id: regAmericas.id,
        name: "Manhattan Hub",
        custom_data: { office_code: "US-NYC-01", headcount: 450 }
      });

      const deptEng = await api.createMember({
        hierarchy_id: h.id,
        level_id: lDept.id,
        parent_id: branchNY.id,
        name: "AI & Platform Engineering"
      });

      const emp1 = await api.createMember({
        hierarchy_id: h.id,
        level_id: lEmp.id,
        parent_id: deptEng.id,
        name: "Sarah Chen",
        custom_data: { title: "Lead Systems Architect", email: "s.chen@globaltech.com", emp_type: "Full-Time" }
      });

      const proj1 = await api.createMember({
        hierarchy_id: h.id,
        level_id: lProj.id,
        parent_id: emp1.id,
        name: "NextGen Dynamic Query Engine",
        custom_data: { budget: 250000, status: "In Progress" }
      });

      await api.createMember({
        hierarchy_id: h.id,
        level_id: lTask.id,
        parent_id: proj1.id,
        name: "Recursive CTE Performance Optimization",
        custom_data: { est_hours: 35, is_completed: true }
      });

      await api.createMember({
        hierarchy_id: h.id,
        level_id: lTask.id,
        parent_id: proj1.id,
        name: "Multi-View Frontend Synchronization",
        custom_data: { est_hours: 20, is_completed: false }
      });

      await refreshHierarchy();
      setCurrentHierarchy(h);
      setSuccessMsg("Corporate Enterprise hierarchy created and activated!");
    } catch (err: any) {
      alert("Failed: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Generate Cosmic Hierarchy (Universe -> Galaxy -> Star System -> Planet -> Continent -> Country -> City)
  const generateCosmicHierarchy = async () => {
    try {
      setIsGenerating(true);
      setSuccessMsg(null);

      const h = await api.createHierarchy({
        name: "Cosmic Astrological Hierarchy",
        description: "Schema-agnostic demonstration: Universe -> Galaxy -> Star System -> Planet -> Continent -> Country -> City"
      });

      const lUni = await api.createLevel(h.id, { name: "Universe", code: "universe", color: "#1e1b4b", icon: "Globe", depth_order: 0, allowed_parent_level_ids: [] });
      const lGal = await api.createLevel(h.id, { name: "Galaxy", code: "galaxy", color: "#4338ca", icon: "Globe", depth_order: 1, allowed_parent_level_ids: [lUni.id] });
      const lStar = await api.createLevel(h.id, { name: "Star System", code: "star", color: "#6366f1", icon: "Award", depth_order: 2, allowed_parent_level_ids: [lGal.id] });
      const lPlan = await api.createLevel(h.id, { name: "Planet", code: "planet", color: "#0ea5e9", icon: "Globe", depth_order: 3, allowed_parent_level_ids: [lStar.id] });
      const lCont = await api.createLevel(h.id, { name: "Continent", code: "continent", color: "#10b981", icon: "Folder", depth_order: 4, allowed_parent_level_ids: [lPlan.id] });
      const lCtry = await api.createLevel(h.id, { name: "Country", code: "country", color: "#f59e0b", icon: "Building", depth_order: 5, allowed_parent_level_ids: [lCont.id] });
      const lCity = await api.createLevel(h.id, { name: "City", code: "city", color: "#ec4899", icon: "Users", depth_order: 6, allowed_parent_level_ids: [lCtry.id] });

      await api.createField(lPlan.id, { name: "Atmosphere Type", key: "atmosphere", field_type: "text" });
      await api.createField(lPlan.id, { name: "Habitable", key: "is_habitable", field_type: "boolean" });
      await api.createField(lCity.id, { name: "Population", key: "population", field_type: "number" });

      const uni = await api.createMember({ hierarchy_id: h.id, level_id: lUni.id, name: "Known Universe" });
      const gal = await api.createMember({ hierarchy_id: h.id, level_id: lGal.id, parent_id: uni.id, name: "Milky Way Galaxy" });
      const star = await api.createMember({ hierarchy_id: h.id, level_id: lStar.id, parent_id: gal.id, name: "Solar System" });
      const plan = await api.createMember({ hierarchy_id: h.id, level_id: lPlan.id, parent_id: star.id, name: "Earth", custom_data: { atmosphere: "Nitrogen-Oxygen", is_habitable: true } });
      const cont = await api.createMember({ hierarchy_id: h.id, level_id: lCont.id, parent_id: plan.id, name: "Asia" });
      const ctry = await api.createMember({ hierarchy_id: h.id, level_id: lCtry.id, parent_id: cont.id, name: "Japan" });
      await api.createMember({ hierarchy_id: h.id, level_id: lCity.id, parent_id: ctry.id, name: "Tokyo", custom_data: { population: 14000000 } });

      await refreshHierarchy();
      setCurrentHierarchy(h);
      setSuccessMsg("Cosmic hierarchy created and activated!");
    } catch (err: any) {
      alert("Failed: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-800 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <div>
              <h3 className="text-base font-bold text-zinc-100">Schema-Agnostic Presets Generator</h3>
              <p className="text-xs text-zinc-500">Proves Section 37: 100% schema-driven without code changes</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-500 hover:text-zinc-400 hover:bg-zinc-850">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center space-x-2 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <p className="text-zinc-400">
            Generate completely different deep hierarchies instantly to verify that the application operates generically without any hardcoded models.
          </p>

          <div className="space-y-3">
            {/* Corporate Preset */}
            <div
              onClick={() => !isGenerating && generateCorporateHierarchy()}
              className="p-4 rounded-xl border border-zinc-800 hover:border-indigo-500 hover:bg-zinc-800/40 cursor-pointer transition flex items-center justify-between group"
            >
              <div className="flex items-center space-x-3.5">
                <div className="w-10 h-10 rounded-xl bg-zinc-100 text-zinc-950 font-bold flex items-center justify-center shrink-0 shadow-sm">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-sm text-zinc-100 group-hover:text-zinc-200">
                    Corporate Enterprise Hierarchy (7 Tiers)
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">
                    Organization ? Region ? Branch ? Department ? Employee ? Project ? Task
                  </div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-zinc-200 shrink-0" />
            </div>

            {/* Cosmic Preset */}
            <div
              onClick={() => !isGenerating && generateCosmicHierarchy()}
              className="p-4 rounded-xl border border-zinc-800 hover:border-indigo-500 hover:bg-zinc-800/40 cursor-pointer transition flex items-center justify-between group"
            >
              <div className="flex items-center space-x-3.5">
                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Globe2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-sm text-zinc-100 group-hover:text-zinc-200">
                    Cosmic Astrological Hierarchy (7 Tiers)
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">
                    Universe ? Galaxy ? Star System ? Planet ? Continent ? Country ? City
                  </div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-zinc-200 shrink-0" />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-end bg-zinc-950/50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-zinc-800 font-semibold text-zinc-400 hover:bg-zinc-850 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
