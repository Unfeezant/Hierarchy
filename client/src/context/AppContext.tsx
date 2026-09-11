import React, { createContext, useContext, useState, useEffect } from "react";
import { Hierarchy, Level, Member, AuthUser } from "../types/index.js";
import { api } from "../services/api.js";

interface AppContextType {
  currentUser: AuthUser | null;
  allUsers: any[];
  currentHierarchy: Hierarchy | null;
  hierarchies: Hierarchy[];
  levels: Level[];
  activeLevel: Level | null;
  activeMember: Member | null;
  breadcrumbs: Array<{ id: string; name: string; level_name?: string }>;
  viewMode: "tree" | "pyramid" | "table" | "detail";
  displayMode: "compact" | "details";
  isLoading: boolean;
  bootstrapRequired: boolean;
  error: string | null;
  setViewMode: (mode: "tree" | "pyramid" | "table" | "detail") => void;
  setDisplayMode: (mode: "compact" | "details") => void;
  setCurrentHierarchy: (h: Hierarchy) => void;
  setActiveLevel: (lvl: Level | null) => void;
  selectMember: (m: Member | null) => Promise<void>;
  navigateBreadcrumb: (id: string | null) => Promise<void>;
  refreshHierarchy: () => Promise<void>;
  refreshLevels: () => Promise<void>;
  switchUser: (userId: string) => Promise<void>;
  login: (user: AuthUser, token: string) => Promise<void>;
  logout: () => Promise<void>;
  setGuestContext: (guestData: any) => void;
  setError: (err: string | null) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [hierarchies, setHierarchies] = useState<Hierarchy[]>([]);
  const [currentHierarchy, setCurrentHierarchyState] = useState<Hierarchy | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [activeLevel, setActiveLevel] = useState<Level | null>(null);
  const [activeMember, setActiveMember] = useState<Member | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; name: string; level_name?: string }>>([]);
  const [viewMode, setViewMode] = useState<"tree" | "pyramid" | "table" | "detail">("tree");
  const [displayMode, setDisplayModeState] = useState<"compact" | "details">(() => {
    return (localStorage.getItem("display_mode") as "compact" | "details") || "compact";
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [bootstrapRequired, setBootstrapRequired] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const setDisplayMode = (mode: "compact" | "details") => {
    setDisplayModeState(mode);
    localStorage.setItem("display_mode", mode);
  };

  const loadInitialHierarchyData = async () => {
    try {
      const list = await api.getHierarchies().catch(() => []);
      setHierarchies(list);
      if (list.length > 0) {
        setCurrentHierarchyState(list[0]);
        const lvls = await api.getLevels(list[0].id).catch(() => []);
        setLevels(lvls);
        if (lvls.length > 0) {
          setActiveLevel(lvls[0]);
        }
      }
    } catch {
      // Ignored if unauthorized
    }
  };

  // Initial load
  useEffect(() => {
    async function init() {
      try {
        setIsLoading(true);

        // 1. Check bootstrap status
        const bootStatus = await api.getBootstrapStatus().catch(() => ({ bootstrapRequired: false }));
        if (bootStatus.bootstrapRequired) {
          setBootstrapRequired(true);
          setIsLoading(false);
          return;
        }

        // 2. If token exists, load current session
        const token = localStorage.getItem("auth_token");
        if (token) {
          try {
            const meRes = await api.getMe();
            if (meRes && meRes.user) {
              setCurrentUser(meRes.user);
              await loadInitialHierarchyData();
              const users = await api.getUsers().catch(() => []);
              setAllUsers(users);
            }
          } catch {
            localStorage.removeItem("auth_token");
            setCurrentUser(null);
          }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  const login = async (user: AuthUser, token: string) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("active_user_id", user.id);
    setCurrentUser(user);
    setBootstrapRequired(false);
    await loadInitialHierarchyData();
    const users = await api.getUsers().catch(() => []);
    setAllUsers(users);
  };

  const logout = async () => {
    try {
      await api.logout().catch(() => {});
    } finally {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("active_user_id");
      localStorage.removeItem("guest_token");
      setCurrentUser(null);
      setHierarchies([]);
      setCurrentHierarchyState(null);
      setLevels([]);
      setActiveLevel(null);
      setActiveMember(null);
      setBreadcrumbs([]);
    }
  };

  const setGuestContext = (guestData: any) => {
    localStorage.setItem("guest_token", guestData.token);
    const simulatedGuestUser: AuthUser = {
      id: "guest_" + guestData.id,
      username: "guest",
      email: "guest@link",
      full_name: `Guest (${guestData.name})`,
      status: "active",
      email_verified: false,
      role: {
        id: "role_guest",
        name: "Guest",
        permissions: guestData.access_level === "editor" 
          ? ["hierarchy:view", "level:view", "field:view", "member:view", "member:create", "member:edit"]
          : ["hierarchy:view", "level:view", "field:view", "member:view"]
      },
      scopes: [{
        id: "scope_guest",
        user_id: "guest_" + guestData.id,
        hierarchy_id: guestData.hierarchy_id,
        member_id: guestData.member_id,
        access_level: guestData.access_level
      }]
    };
    setCurrentUser(simulatedGuestUser);
    loadInitialHierarchyData();
  };

  const refreshHierarchy = async () => {
    const list = await api.getHierarchies();
    setHierarchies(list);
    if (currentHierarchy) {
      const refreshed = list.find(h => h.id === currentHierarchy.id) || list[0] || null;
      setCurrentHierarchyState(refreshed);
    } else if (list.length > 0) {
      setCurrentHierarchyState(list[0]);
    }
  };

  const refreshLevels = async () => {
    if (!currentHierarchy) return;
    const lvls = await api.getLevels(currentHierarchy.id);
    setLevels(lvls);
    if (activeLevel) {
      const refreshedLvl = lvls.find(l => l.id === activeLevel.id) || lvls[0] || null;
      setActiveLevel(refreshedLvl);
    } else if (lvls.length > 0) {
      setActiveLevel(lvls[0]);
    }
  };

  const setCurrentHierarchy = async (h: Hierarchy) => {
    setCurrentHierarchyState(h);
    setActiveMember(null);
    setBreadcrumbs([]);
    const lvls = await api.getLevels(h.id);
    setLevels(lvls);
    if (lvls.length > 0) {
      setActiveLevel(lvls[0]);
    } else {
      setActiveLevel(null);
    }
  };

  const selectMember = async (m: Member | null) => {
    setActiveMember(m);
    if (!m) {
      setBreadcrumbs([]);
      return;
    }
    try {
      const ancestors = await api.getAncestors(m.id);
      const trail = ancestors.map(a => ({
        id: a.id,
        name: a.name,
        level_name: a.level_name
      }));
      trail.push({ id: m.id, name: m.name, level_name: m.level_name });
      setBreadcrumbs(trail);
      if (viewMode === "table") {
        setViewMode("detail");
      }
    } catch {
      setBreadcrumbs([{ id: m.id, name: m.name, level_name: m.level_name }]);
    }
  };

  const navigateBreadcrumb = async (id: string | null) => {
    if (!id) {
      setActiveMember(null);
      setBreadcrumbs([]);
      return;
    }
    try {
      const member = await api.getMember(id);
      await selectMember(member);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const switchUser = async (userId: string) => {
    try {
      setIsLoading(true);
      const res = await api.switchUser(userId);
      localStorage.setItem("auth_token", res.token);
      localStorage.setItem("active_user_id", res.user.id);
      setCurrentUser(res.user);
      await refreshLevels();
      if (activeMember) {
        try {
          await api.getMember(activeMember.id);
        } catch {
          setActiveMember(null);
          setBreadcrumbs([]);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        allUsers,
        currentHierarchy,
        hierarchies,
        levels,
        activeLevel,
        activeMember,
        breadcrumbs,
        viewMode,
        displayMode,
        isLoading,
        bootstrapRequired,
        error,
        setViewMode,
        setDisplayMode,
        setCurrentHierarchy,
        setActiveLevel,
        selectMember,
        navigateBreadcrumb,
        refreshHierarchy,
        refreshLevels,
        switchUser,
        login,
        logout,
        setGuestContext,
        setError
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
