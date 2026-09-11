import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Send,
  Paperclip,
  X,
  CheckCircle2,
  FileText,
  Loader2,
  Bot,
  User as UserIcon,
  Search,
  MapPin,
  FolderTree
} from "lucide-react";
import { Level } from "../types/index.js";
import { useApp } from "../context/AppContext.js";
import { API_BASE_URL } from "../services/api.js";

interface AiRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  hierarchyId: string;
  availableLevels?: Level[];
}

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: string;
  attachments?: string[];
  foundPoint?: any;
}

export const AiRecordModal: React.FC<AiRecordModalProps> = ({
  isOpen,
  onClose,
  hierarchyId,
  availableLevels: propLevels
}) => {
  const {
    currentUser,
    levels: globalLevels,
    currentHierarchy,
    selectMember,
    setViewMode
  } = useApp();

  const levels = propLevels && propLevels.length > 0 ? propLevels : globalLevels;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeFoundPoint, setActiveFoundPoint] = useState<any | null>(null);
  const [modelStatus, setModelStatus] = useState<{ available: boolean; model: string }>({
    available: true,
    model: "Qwen 2.5 Coder (Local)"
  });

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const startSession = async () => {
    setIsLoading(true);
    const targetLevelId = levels[0]?.id || "";
    try {
      const token = localStorage.getItem("auth_token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-user-id": currentUser?.id || ""
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_BASE_URL}/ai/session`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          hierarchyId,
          targetLevelId,
          parentId: null,
          mode: "lookup"
        })
      });

      if (res.ok) {
        const session = await res.json();
        setSessionId(session.id);
        setMessages(session.messages || []);
      }
    } catch (err) {
      console.error("Failed to start AI session", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setSessionId(null);
      setMessages([]);
      setSelectedFiles([]);
      setInputText("");
      setActiveFoundPoint(null);
      return;
    }

    startSession();

    fetch(`${API_BASE_URL}/ai/status`)
      .then(res => res.json())
      .then(data => {
        if (data.activeModel) {
          setModelStatus({ available: data.available, model: data.activeModel });
        }
      })
      .catch(() => {});
  }, [isOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const messageText = (textToSend !== undefined ? textToSend : inputText).trim();
    const filesToSend = [...selectedFiles];
    if ((!messageText && filesToSend.length === 0) || !sessionId || isLoading) return;

    setInputText("");
    setSelectedFiles([]);
    setIsLoading(true);

    const tempUserMsg: Message = {
      role: "user",
      content: messageText || `Uploaded ${filesToSend.length} document(s)`,
      timestamp: new Date().toISOString(),
      attachments: filesToSend.map(f => f.name)
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const formData = new FormData();
      formData.append("message", messageText);
      filesToSend.forEach(file => {
        formData.append("files", file);
      });

      const token = localStorage.getItem("auth_token");
      const headers: Record<string, string> = {
        "x-user-id": currentUser?.id || ""
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE_URL}/ai/session/${sessionId}/chat`, {
        method: "POST",
        headers,
        body: formData
      });

      if (res.ok) {
        const session = await res.json();
        setMessages(session.messages || []);

        if (session.foundPoints && session.foundPoints.length > 0) {
          setActiveFoundPoint(session.foundPoints[0]);
        }
      } else {
        const err = await res.json();
        setMessages(prev => [
          ...prev,
          {
            role: "assistant",
            content: `Error: ${err.error || "Failed to process message."}`,
            timestamp: new Date().toISOString()
          }
        ]);
      }
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: `Connection error: ${err.message}`,
          timestamp: new Date().toISOString()
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleJumpToPoint = async (point: any) => {
    if (!point) return;
    if (selectMember) {
      await selectMember(point);
    }
    if (setViewMode) {
      setViewMode("detail");
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xs">
      <div className="bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-800 w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-purple-200">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-extrabold text-zinc-100 text-base">
                  AI Hierarchy Finder
                </h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                  {modelStatus.model}
                </span>
              </div>
              <div className="text-xs text-zinc-500 mt-0.5 flex items-center space-x-2">
                <span>Find any point and get details across:</span>
                <span className="font-bold text-zinc-200 bg-zinc-850 px-1.5 py-0.5 rounded">
                  {currentHierarchy?.name || "Hierarchy"}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-400 hover:bg-slate-200/60 transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Body: 2 Columns */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Chat Stream & Input */}
          <div className="flex-1 flex flex-col border-r border-zinc-800 bg-zinc-900">
            {/* Messages Thread */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.map((msg, idx) => {
                const isAi = msg.role === "assistant";
                return (
                  <div
                    key={idx}
                    className={`flex items-start space-x-3 ${isAi ? "" : "flex-row-reverse space-x-reverse"}`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-xs shadow-xs ${
                        isAi ? "bg-purple-600 text-white" : "bg-slate-800 text-white"
                      }`}
                    >
                      {isAi ? <Bot className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
                    </div>

                    <div className="max-w-[85%] space-y-1.5">
                      <div
                        className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                          isAi
                            ? "bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-tl-xs"
                            : "bg-zinc-100 text-zinc-950 font-semibold rounded-tr-xs shadow-sm"
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{msg.content}</div>

                        {/* Interactive Jump Button on Found Point */}
                        {isAi && activeFoundPoint && idx === messages.length - 1 && (
                          <div className="mt-3 pt-2.5 border-t border-zinc-800 flex items-center justify-between">
                            <span className="text-[11px] text-zinc-500 font-medium">
                              {activeFoundPoint.name} ({activeFoundPoint.level_name})
                            </span>
                            <button
                              type="button"
                              onClick={() => handleJumpToPoint(activeFoundPoint)}
                              className="px-3 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 font-bold border border-zinc-200 rounded-lg font-bold text-xs flex items-center space-x-1 transition shadow-xs cursor-pointer"
                            >
                              <MapPin className="w-3.5 h-3.5" />
                              <span>View in Hierarchy</span>
                            </button>
                          </div>
                        )}
                      </div>
                      <div
                        className={`text-[10px] text-zinc-500 px-1 ${
                          isAi ? "text-left" : "text-right"
                        }`}
                      >
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                );
              })}

              {isLoading && (
                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 rounded-lg shrink-0 bg-purple-600 text-white flex items-center justify-center shadow-xs">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="p-3.5 rounded-2xl rounded-tl-xs bg-zinc-950 border border-zinc-800 text-zinc-400 text-xs flex items-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                    <span>Finding point and retrieving details...</span>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Quick Suggestion Chips */}
            <div className="px-4 py-2 bg-zinc-950 border-t border-zinc-800 flex items-center space-x-2 overflow-x-auto text-[11px]">
              <span className="text-zinc-500 font-medium shrink-0">Try asking:</span>
              <button
                type="button"
                onClick={() => handleSendMessage("Find Sarah Khan")}
                className="px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700 font-medium transition cursor-pointer shrink-0"
              >
                🔍 Find Sarah Khan
              </button>
              <button
                type="button"
                onClick={() => handleSendMessage("Where is Web Development?")}
                className="px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700 font-medium transition cursor-pointer shrink-0"
              >
                📍 Where is Web Development?
              </button>
              <button
                type="button"
                onClick={() => handleSendMessage("Show Software department details")}
                className="px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700 font-medium transition cursor-pointer shrink-0"
              >
                🏢 Software Department
              </button>
            </div>

            {/* Input and Attachment Zone */}
            <div className="p-4 border-t border-zinc-800 bg-zinc-900">
              {selectedFiles.length > 0 && (
                <div className="mb-2.5 flex flex-wrap gap-2">
                  {selectedFiles.map((file, i) => (
                    <div
                      key={i}
                      className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-purple-200 text-xs text-purple-900 shadow-xs"
                    >
                      <FileText className="w-3.5 h-3.5 text-purple-600" />
                      <span className="font-medium truncate max-w-[150px]">{file.name}</span>
                      <span className="text-[10px] text-zinc-500">({Math.round(file.size / 1024)}KB)</span>
                      <button
                        type="button"
                        onClick={() => setSelectedFiles(prev => prev.filter((_, idx) => idx !== i))}
                        className="hover:text-rose-600 text-zinc-500 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form
                onSubmit={e => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center space-x-2"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={e => {
                    if (e.target.files) setSelectedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                  }}
                  multiple
                  className="hidden"
                  accept=".csv,.txt,.json,.xlsx,.xls,.pdf,.png,.jpg,.jpeg"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-950 hover:bg-zinc-850 text-zinc-400 transition shadow-xs cursor-pointer"
                  title="Attach documents"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                <input
                  type="text"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder="Ask to find any point, member, team, department, or ID..."
                  className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 text-xs focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                  disabled={isLoading}
                />

                <button
                  type="submit"
                  disabled={isLoading || (!inputText.trim() && selectedFiles.length === 0)}
                  className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold text-xs flex items-center space-x-1.5 transition shadow-sm shadow-purple-200 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Ask</span>
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Point Details Inspector */}
          <div className="w-96 flex flex-col bg-zinc-950/70 p-5 space-y-4 overflow-y-auto border-l border-zinc-800">
            {activeFoundPoint ? (
              <div className="space-y-4">
                {/* Found Point Header */}
                <div className="p-4 rounded-xl border border-purple-200 bg-zinc-900 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                      {activeFoundPoint.level_name} (Depth {activeFoundPoint.depth})
                    </span>
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center space-x-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Located</span>
                    </span>
                  </div>

                  <div>
                    <h4 className="text-base font-extrabold text-zinc-100">
                      {activeFoundPoint.name}
                    </h4>
                  </div>

                  {/* Jump Action Button */}
                  <button
                    type="button"
                    onClick={() => handleJumpToPoint(activeFoundPoint)}
                    className="w-full py-2 bg-zinc-100 hover:bg-white text-zinc-950 font-bold border border-zinc-200 font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 transition shadow-xs cursor-pointer"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>View in Hierarchy Explorer</span>
                  </button>
                </div>

                {/* Hierarchy Location / Breadcrumb Card */}
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900 space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center space-x-1">
                    <FolderTree className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Hierarchy Location</span>
                  </div>
                  <div className="space-y-1 pt-1">
                    {activeFoundPoint.path && activeFoundPoint.path.map((nodeName: string, i: number) => (
                      <div key={i} className="flex items-center space-x-2 text-xs">
                        <span className="text-slate-300 font-mono text-[10px]">{i + 1}.</span>
                        <span
                          className={`font-medium ${
                            i === activeFoundPoint.path.length - 1
                              ? "font-extrabold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded"
                              : "text-zinc-300"
                          }`}
                        >
                          {nodeName}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Properties & Details Card */}
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900 space-y-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Record Attributes
                  </div>
                  <div className="space-y-2 pt-1 text-xs">
                    {activeFoundPoint.parent && (
                      <div className="border-b border-zinc-800 pb-1.5">
                        <span className="text-[10px] text-zinc-500 block">Parent</span>
                        <span className="font-semibold text-zinc-200">{activeFoundPoint.parent.name}</span>
                      </div>
                    )}
                    {Object.entries(activeFoundPoint.custom_data || {})
                      .filter(([k, v]) => v !== undefined && v !== null && v !== "" && k !== "name")
                      .map(([k, v]) => (
                        <div key={k} className="border-b border-slate-50 last:border-0 pb-1.5">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wider block font-medium">
                            {k}
                          </span>
                          <span className="font-bold text-zinc-200">{String(v)}</span>
                        </div>
                      ))}
                    {activeFoundPoint.children_count > 0 && (
                      <div className="pt-1">
                        <span className="text-[10px] text-zinc-500 block font-medium">
                          Subordinates ({activeFoundPoint.children_count})
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {activeFoundPoint.children.map((c: any) => (
                            <span
                              key={c.id}
                              className="px-2 py-0.5 bg-zinc-850 text-zinc-300 rounded text-[11px] font-medium"
                            >
                              {c.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Helpful Finder Guide when no point is selected yet */
              <div className="h-full flex flex-col justify-center items-center text-center p-4 text-zinc-500 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Search className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-zinc-200 text-sm">Quick Point Lookup</h4>
                  <p className="text-xs text-zinc-500 leading-relaxed max-w-xs">
                    Ask the chat to find any point across the hierarchy. The full hierarchy path, attributes, and jump link will appear here.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
