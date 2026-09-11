import React, { useState, useEffect } from "react";
import { AppProvider, useApp } from "./context/AppContext.js";
import { Header } from "./components/Header.js";
import { SideNavigator } from "./components/SideNavigator.js";
import { DashboardView } from "./components/DashboardView.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { ExplorerPage } from "./pages/ExplorerPage.js";
import { HierarchyDesigner } from "./components/HierarchyDesigner.js";
import { AuditLogView } from "./components/AuditLogView.js";
import { LiveSqlInspector } from "./components/LiveSqlInspector.js";
import { PresetsModal } from "./components/PresetsModal.js";
import { NewHierarchyModal } from "./components/NewHierarchyModal.js";
import { DynamicColumnModal } from "./components/DynamicColumnModal.js";
import { AiRecordModal } from "./components/AiRecordModal.js";
import { BootstrapSetup } from "./components/auth/BootstrapSetup.js";
import { LoginView } from "./components/auth/LoginView.js";
import { AcceptInvitationView } from "./components/auth/AcceptInvitationView.js";
import { GuestAccessView } from "./components/auth/GuestAccessView.js";
import { AdminManagementView } from "./components/admin/AdminManagementView.js";
import { AdminProfileView } from "./components/admin/AdminProfileView.js";
import { Level, FieldDefinition } from "./types/index.js";
import { AlertTriangle, X } from "lucide-react";

export type ActiveTab = "dashboard" | "explorer" | "designer" | "audit" | "sql" | "admin" | "profile";
export type NavTab = ActiveTab | "presets";

const MainLayout: React.FC = () => {
  const {
    currentUser,
    login,
    logout,
    bootstrapRequired,
    setGuestContext,
    hierarchies,
    error,
    setError,
    refreshLevels,
    currentHierarchy,
    levels,
    setActiveLevel,
    setViewMode
  } = useApp();
  
  const [currentTab, setCurrentTab] = useState<ActiveTab>("dashboard");
  const [showPresetsModal, setShowPresetsModal] = useState(false);
  const [showNewHierarchyModal, setShowNewHierarchyModal] = useState(false);
  const [showGlobalAiAssistant, setShowGlobalAiAssistant] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // Column modal triggered from designer
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [columnLevel, setColumnLevel] = useState<Level | null>(null);
  const [columnEditField, setColumnEditField] = useState<FieldDefinition | null>(null);

  // Check for invitation URL query
  const [inviteToken, setInviteToken] = useState<string | null>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("invite");
  });

  // Check for guest link URL query
  const [guestToken, setGuestToken] = useState<string | null>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("guest");
  });

  // Global Keyboard Shortcuts (Ctrl+K omni-search, Ctrl+J AI assistant)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setShowGlobalAiAssistant((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 1. Initial Super Admin Bootstrap Required
  if (bootstrapRequired) {
    return <BootstrapSetup onBootstrapped={(user, token) => login(user, token)} />;
  }

  // 2. Guest Link Direct Access Screen
  if (guestToken) {
    return (
      <GuestAccessView
        token={guestToken}
        onSuccess={(user, token) => {
          window.history.replaceState({}, document.title, window.location.pathname);
          setGuestToken(null);
          login(user, token);
        }}
        onCancel={() => {
          window.history.replaceState({}, document.title, window.location.pathname);
          setGuestToken(null);
        }}
      />
    );
  }

  // 3. Invitation Acceptance Screen
  if (inviteToken) {
    return (
      <AcceptInvitationView
        token={inviteToken}
        onAccepted={(user, token) => {
          // Clear query param
          window.history.replaceState({}, document.title, window.location.pathname);
          setInviteToken(null);
          login(user, token);
        }}
        onCancel={() => {
          window.history.replaceState({}, document.title, window.location.pathname);
          setInviteToken(null);
        }}
      />
    );
  }

  // 3. User Authentication Required
  if (!currentUser) {
    return (
      <LoginView
        onLoginSuccess={(user, token) => login(user, token)}
        onOpenGuestLink={(guestData) => setGuestContext(guestData)}
      />
    );
  }

  const handleTabChange = (tab: NavTab) => {
    if (tab === "presets") {
      setShowPresetsModal(true);
    } else {
      setCurrentTab(tab);
    }
  };

  const handleNavigateLevelTable = (lvl: Level) => {
    setActiveLevel(lvl);
    setCurrentTab("explorer");
    setViewMode("table");
  };

  const handleOpenAddColumnFromDesigner = (lvl: Level) => {
    setColumnLevel(lvl);
    setColumnEditField(null);
    setShowColumnModal(true);
  };

  const handleOpenEditColumnFromDesigner = (lvl: Level, field: FieldDefinition) => {
    setColumnLevel(lvl);
    setColumnEditField(field);
    setShowColumnModal(true);
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans selection:bg-zinc-700 selection:text-white antialiased">
      {/* Top Enterprise Header */}
      <Header
        currentTab={currentTab}
        onTabChange={handleTabChange}
        onOpenPresets={() => setShowPresetsModal(true)}
        onOpenNewHierarchy={() => setShowNewHierarchyModal(true)}
        onOpenAiAssistant={() => setShowGlobalAiAssistant(true)}
        onOpenCommandPalette={() => setShowCommandPalette(true)}
      />

      {/* Global Error Notification Banner */}
      {error && (
        <div className="bg-red-950 border-b border-red-800 text-red-200 px-4 py-2 text-xs font-semibold flex items-center justify-between z-30">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button 
            onClick={() => setError(null)} 
            className="p-1 text-red-400 hover:text-white transition"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Body Layout: Sidebar Shell + Main Canvas */}
      <div className="flex-1 flex overflow-hidden">
        {/* Collapsible Left Navigation Shell */}
        <SideNavigator
          currentTab={currentTab}
          onTabChange={handleTabChange}
          onOpenAiAssistant={() => setShowGlobalAiAssistant(true)}
          onOpenPresets={() => setShowPresetsModal(true)}
          onOpenNewHierarchy={() => setShowNewHierarchyModal(true)}
        />

        {/* Main Work Canvas */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto bg-black">
          {currentTab === "dashboard" && (
            <DashboardView
              onNavigateTab={handleTabChange}
              onNavigateLevelTable={handleNavigateLevelTable}
              onOpenAi={() => setShowGlobalAiAssistant(true)}
            />
          )}

          {currentTab === "explorer" && <ExplorerPage />}

          {currentTab === "designer" && (
            <HierarchyDesigner
              onOpenAddColumn={handleOpenAddColumnFromDesigner}
              onOpenEditColumn={handleOpenEditColumnFromDesigner}
            />
          )}

          {currentTab === "audit" && <AuditLogView />}

          {currentTab === "sql" && <LiveSqlInspector />}

          {currentTab === "admin" && (
            <AdminManagementView hierarchies={hierarchies} />
          )}

          {currentTab === "profile" && (
            <AdminProfileView user={currentUser} onLogout={logout} />
          )}
        </main>
      </div>

      {/* Omni-Search Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onNavigateTab={handleTabChange}
        onNavigateLevelTable={handleNavigateLevelTable}
        onOpenAi={() => setShowGlobalAiAssistant(true)}
      />

      {/* Configuration & Data Modals */}
      <PresetsModal
        isOpen={showPresetsModal}
        onClose={() => setShowPresetsModal(false)}
      />

      <NewHierarchyModal
        isOpen={showNewHierarchyModal}
        onClose={() => setShowNewHierarchyModal(false)}
      />

      {showColumnModal && columnLevel && (
        <DynamicColumnModal
          isOpen={showColumnModal}
          onClose={() => setShowColumnModal(false)}
          onSuccess={async () => {
            await refreshLevels();
          }}
          level={columnLevel}
          editField={columnEditField}
        />
      )}

      {/* AI Hierarchy Point & Subordinate Inspector Modal */}
      {showGlobalAiAssistant && currentHierarchy && (
        <AiRecordModal
          isOpen={showGlobalAiAssistant}
          onClose={() => setShowGlobalAiAssistant(false)}
          hierarchyId={currentHierarchy.id}
          availableLevels={levels}
        />
      )}
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
