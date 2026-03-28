"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { projectsApi, messagesApi, type Project, type Message, type Reaction } from "@/lib/api";
import { useChat } from "@/hooks/useChat";

const EMOJIS = ["👍", "❤️", "🎉", "🔥", "😅", "🚀", "✅", "🙏", "👀", "💯"];
const ICONS  = ["💬", "🚀", "🎨", "🔧", "📱", "⚡", "🌟", "🔥", "🎯", "📊"];
const COLORS = ["#6366f1","#ec4899","#10b981","#f59e0b","#3b82f6","#8b5cf6","#ef4444","#06b6d4"];

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function ChatPage() {
  const router = useRouter();
  const [token, setToken]   = useState<string | null>(null);
  const [user, setUser]     = useState<any>(null);
  const [projects, setProjects]           = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [messages, setMessages]           = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [hoveredMsg, setHoveredMsg]   = useState<string | null>(null);
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [members, setMembers]   = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [showMemberPanel, setShowMemberPanel]     = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showAddMember, setShowAddMember]         = useState(false);
  const [showHuddle, setShowHuddle]               = useState(false);
  const [huddleActive, setHuddleActive]           = useState(false);
  const [newChannel, setNewChannel] = useState({ name: "", description: "", icon: "💬", color: "#6366f1" });
  const [createLoading, setCreateLoading] = useState(false);
  const [searchUser, setSearchUser] = useState("");
  const bottomRef   = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();

  // ── Auth ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = localStorage.getItem("chat_token");
    const u = localStorage.getItem("chat_user");
    if (!t || !u) { router.push("/login"); return; }
    setToken(t); setUser(JSON.parse(u)); setLoading(false);
  }, [router]);

  // ── Load projects ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    projectsApi.list().then(ps => { setProjects(ps); if (ps.length > 0) setActiveProject(ps[0]); });
  }, [token]);

  // ── Load messages & members when project changes ─────────────────────────
  useEffect(() => {
    if (!activeProject) return;
    setLoadingMsgs(true);
    messagesApi.list(activeProject.id).then(msgs => {
      const fixed = msgs.map(m => ({ ...m, reactions: typeof m.reactions === "string" ? JSON.parse(m.reactions) : (m.reactions || []) }));
      setMessages(fixed);
      setLoadingMsgs(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "instant" }), 50);
    });
    projectsApi.markRead(activeProject.id);
    setProjects(ps => ps.map(p => p.id === activeProject.id ? { ...p, unread_count: 0 } : p));
    projectsApi.getMembers(activeProject.id).then(setMembers);
  }, [activeProject?.id]);

  // ── Auto-scroll ──────────────────────────────────────────────────────────
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── Load all users for Add Member ────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/auth/all-users`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : []).then(setAllUsers).catch(() => {});
  }, [token]);

  // ── WebSocket handlers ───────────────────────────────────────────────────
  const handleNewMessage = useCallback((msg: Message) => {
    setMessages(prev => [...prev, { ...msg, reactions: msg.reactions || [] }]);
  }, []);

  const handleTyping = useCallback((userId: string, username: string, isTyping: boolean) => {
    setTypingUsers(prev => {
      if (isTyping) return { ...prev, [userId]: username };
      const next = { ...prev }; delete next[userId]; return next;
    });
  }, []);

  const handleReactionUpdate = useCallback((messageId: string, reactions: Reaction[]) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
  }, []);

  const handleUserOnline = useCallback((userId: string, online: boolean) => {
    setMembers(prev => prev.map(m => m.id === userId ? { ...m, is_online: online } : m));
  }, []);

  const { connected, sendMessage, sendTyping, sendReaction } = useChat({
    projectId: activeProject?.id ?? null, token,
    onMessage: handleNewMessage, onTyping: handleTyping,
    onReactionUpdate: handleReactionUpdate, onUserOnline: handleUserOnline,
  });

  // ── Send message ─────────────────────────────────────────────────────────
  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input.trim()); setInput(""); sendTyping(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value); sendTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => sendTyping(false), 2000);
  };

  const handleReaction = (messageId: string, emoji: string) => {
    sendReaction(messageId, emoji); setEmojiPickerFor(null);
  };

  const startEdit = (msg: Message) => { setEditingId(msg.id); setEditContent(msg.content); };

  const saveEdit = async () => {
    if (!editingId) return;
    const updated = await messagesApi.edit(editingId, editContent);
    setMessages(prev => prev.map(m => m.id === editingId ? { ...m, ...updated } : m));
    setEditingId(null);
  };

  const deleteMsg = async (id: string) => {
    if (!confirm("Delete this message?")) return;
    await messagesApi.delete(id);
    setMessages(prev => prev.filter(m => m.id !== id));
  };

  // ── Create channel ────────────────────────────────────────────────────────
  const createChannel = async () => {
    if (!newChannel.name.trim()) return;
    setCreateLoading(true);
    try {
      const project = await projectsApi.create(newChannel);
      setProjects(prev => [...prev, { ...project, unread_count: 0 }]);
      setActiveProject({ ...project, unread_count: 0 });
      setShowCreateChannel(false);
      setNewChannel({ name: "", description: "", icon: "💬", color: "#6366f1" });
    } catch (e: any) { alert(e.message); }
    setCreateLoading(false);
  };

  // ── Add member ────────────────────────────────────────────────────────────
  const addMemberToChannel = async (userId: string) => {
    if (!activeProject) return;
    try {
      const res = await fetch(`${API}/api/projects/${activeProject.id}/members/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: "{}",
      });
      if (!res.ok) throw new Error("Failed");
      const updatedMembers = await projectsApi.getMembers(activeProject.id);
      setMembers(updatedMembers);
    } catch { alert("Could not add member. Only owners/admins can add members!"); }
  };

  const logout = () => { localStorage.clear(); router.push("/login"); };

  if (loading) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f", color: "#6366f1", fontSize: 18 }}>
      Loading...
    </div>
  );

  const typingList    = Object.values(typingUsers);
  const nonMembers    = allUsers.filter(u => u.id !== user?.id && !members.find((m: any) => m.id === u.id) &&
    (u.full_name?.toLowerCase().includes(searchUser.toLowerCase()) || u.username?.toLowerCase().includes(searchUser.toLowerCase())));
  const filteredMembers = members.filter(m =>
    m.full_name?.toLowerCase().includes(searchUser.toLowerCase()) || m.username?.toLowerCase().includes(searchUser.toLowerCase()));

  const avatarColor = (id: string) => `hsl(${(id?.charCodeAt(0) ?? 0) * 37 % 360},55%,50%)`;

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0a0a0f", fontFamily: "'DM Sans','Segoe UI',sans-serif", color: "#e2e8f0", overflow: "hidden" }}>

      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <div style={{ width: sidebarOpen ? 260 : 0, minWidth: sidebarOpen ? 260 : 0, background: "#111118", borderRight: "1px solid #1e1e2e", display: "flex", flexDirection: "column", transition: "all 0.25s", overflow: "hidden" }}>
        <div style={{ padding: "16px 14px 12px", borderBottom: "1px solid #1e1e2e" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>💬</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#f1f5f9" }}>My Workspace</div>
              <div style={{ fontSize: 11, color: connected ? "#22c55e" : "#f59e0b" }}>● {connected ? "Connected" : "Reconnecting..."}</div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "10px 8px" }}>
          {/* Channels */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 8px 6px" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Channels</span>
            <button onClick={() => setShowCreateChannel(true)} title="Create channel"
              style={{ background: "none", border: "none", cursor: "pointer", color: "#6366f1", fontSize: 20, lineHeight: 1, padding: "0 2px", fontWeight: 300 }}>+</button>
          </div>

          {projects.map(p => (
            <button key={p.id} onClick={() => setActiveProject(p)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, border: "none", cursor: "pointer", background: activeProject?.id === p.id ? "#1e1e2e" : "transparent", color: activeProject?.id === p.id ? "#f1f5f9" : "#94a3b8", textAlign: "left", marginBottom: 2 }}>
              <span style={{ fontSize: 14 }}>{p.icon}</span>
              <span style={{ fontSize: 13.5, fontWeight: activeProject?.id === p.id ? 600 : 400, flex: 1 }}>#{p.name}</span>
              {p.unread_count > 0 && <span style={{ background: "#6366f1", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "1px 7px" }}>{p.unread_count}</span>}
            </button>
          ))}

          {/* Direct Messages */}
          <div style={{ padding: "14px 8px 6px" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Direct Messages</span>
          </div>

          {members.filter(m => m.id !== user?.id).map(m => (
            <div key={m.id}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 7, marginBottom: 2, cursor: "pointer", color: "#94a3b8" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#16161f")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <div style={{ position: "relative" }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: avatarColor(m.id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" }}>
                  {m.full_name?.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ position: "absolute", bottom: -1, right: -1, width: 8, height: 8, borderRadius: "50%", background: m.is_online ? "#22c55e" : "#475569", border: "1.5px solid #111118" }} />
              </div>
              <span style={{ fontSize: 13 }}>{m.full_name}</span>
            </div>
          ))}
        </div>

        {/* Current user */}
        <div style={{ padding: "10px 14px", borderTop: "1px solid #1e1e2e", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>
            {user?.full_name?.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{user?.full_name}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>@{user?.username}</div>
          </div>
          <button onClick={logout} title="Logout" style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", fontSize: 16 }}>⏏</button>
        </div>
      </div>

      {/* ── MAIN ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Header */}
        <div style={{ padding: "0 16px", height: 56, display: "flex", alignItems: "center", borderBottom: "1px solid #1e1e2e", background: "#111118", gap: 10, flexShrink: 0 }}>
          <button onClick={() => setSidebarOpen(s => !s)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 20, padding: 4 }}>☰</button>
          <div style={{ width: 1, height: 24, background: "#1e1e2e" }} />
          <span style={{ fontSize: 16 }}>{activeProject?.icon}</span>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9" }}>#{activeProject?.name}</span>
          {activeProject?.description && <span style={{ fontSize: 12, color: "#475569" }}>— {activeProject.description}</span>}
          <div style={{ flex: 1 }} />
          <button onClick={() => setShowHuddle(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: huddleActive ? "#10b981" : "#1e1e2e", border: "none", cursor: "pointer", color: huddleActive ? "#fff" : "#94a3b8", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 600 }}>
            🎙️ {huddleActive ? "In Huddle" : "Huddle"}
          </button>
          <button onClick={() => { setShowAddMember(true); setSearchUser(""); }}
            style={{ background: "#1e1e2e", border: "none", cursor: "pointer", color: "#94a3b8", borderRadius: 8, padding: "6px 12px", fontSize: 13 }}>
            ➕ Add
          </button>
          <button onClick={() => setShowMemberPanel(s => !s)}
            style={{ background: showMemberPanel ? "#1e1e2e" : "none", border: "none", cursor: "pointer", color: "#94a3b8", borderRadius: 8, padding: "6px 10px", fontSize: 13 }}>
            👥 {members.length}
          </button>
        </div>

        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 2 }}>
            {loadingMsgs ? (
              <div style={{ color: "#475569", textAlign: "center", marginTop: 60 }}>Loading messages...</div>
            ) : messages.length === 0 ? (
              <div style={{ color: "#475569", textAlign: "center", marginTop: 80 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>{activeProject?.icon}</div>
                <div style={{ fontWeight: 600, color: "#94a3b8", fontSize: 16 }}>Welcome to #{activeProject?.name}!</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>Be the first to send a message 👋</div>
              </div>
            ) : messages.map((msg, i) => {
              const isMe       = msg.user_id === user?.id;
              const showAvatar = i === 0 || messages[i - 1].user_id !== msg.user_id;
              const initials   = msg.full_name?.slice(0, 2).toUpperCase() ?? "??";

              return (
                <div key={msg.id}
                  onMouseEnter={() => setHoveredMsg(msg.id)}
                  onMouseLeave={() => { setHoveredMsg(null); if (emojiPickerFor === msg.id) setEmojiPickerFor(null); }}
                  style={{ display: "flex", gap: 10, padding: "3px 8px", borderRadius: 8, background: hoveredMsg === msg.id ? "#16161f" : "transparent", transition: "background 0.1s", position: "relative", marginTop: showAvatar ? 12 : 0 }}>
                  <div style={{ width: 36, flexShrink: 0 }}>
                    {showAvatar && (
                      <div style={{ width: 34, height: 34, borderRadius: 9, background: avatarColor(msg.user_id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>{initials}</div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {showAvatar && (
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: isMe ? "#10b981" : avatarColor(msg.user_id) }}>{msg.full_name}</span>
                        <span style={{ fontSize: 11, color: "#475569" }}>{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        {msg.edited && <span style={{ fontSize: 10, color: "#475569", fontStyle: "italic" }}>(edited)</span>}
                      </div>
                    )}
                    {editingId === msg.id ? (
                      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                        <input value={editContent} onChange={e => setEditContent(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingId(null); }}
                          style={{ flex: 1, background: "#1e1e2e", border: "1px solid #6366f1", borderRadius: 7, padding: "5px 10px", color: "#f1f5f9", fontSize: 14, outline: "none" }} autoFocus />
                        <button onClick={saveEdit} style={{ background: "#6366f1", border: "none", borderRadius: 7, color: "#fff", padding: "4px 12px", cursor: "pointer", fontSize: 12 }}>Save</button>
                        <button onClick={() => setEditingId(null)} style={{ background: "#1e1e2e", border: "none", borderRadius: 7, color: "#94a3b8", padding: "4px 12px", cursor: "pointer", fontSize: 12 }}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 1.6 }}>{msg.content}</div>
                    )}
                    {(msg.reactions || []).length > 0 && (
                      <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                        {(msg.reactions || []).map((r: any) => (
                          <button key={r.emoji} onClick={() => handleReaction(msg.id, r.emoji)}
                            style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: 12, border: `1px solid ${r.users?.includes(user?.id) ? "#6366f1" : "#2e2e3e"}`, background: r.users?.includes(user?.id) ? "#1e1e3a" : "#1a1a27", cursor: "pointer", fontSize: 13, color: "#94a3b8" }}>
                            {r.emoji} <span style={{ fontWeight: 600 }}>{r.count}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {hoveredMsg === msg.id && (
                    <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", display: "flex", gap: 4, background: "#1e1e2e", borderRadius: 9, padding: "3px 7px", border: "1px solid #2e2e3e" }}>
                      <button onClick={() => setEmojiPickerFor(emojiPickerFor === msg.id ? null : msg.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: "2px 5px", color: "#94a3b8" }}>😊</button>
                      {isMe && <>
                        <button onClick={() => startEdit(msg)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: "2px 5px", color: "#94a3b8" }}>✏️</button>
                        <button onClick={() => deleteMsg(msg.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: "2px 5px", color: "#f87171" }}>🗑</button>
                      </>}
                    </div>
                  )}
                  {emojiPickerFor === msg.id && (
                    <div style={{ position: "absolute", right: 12, top: -52, zIndex: 100, background: "#1e1e2e", border: "1px solid #2e2e3e", borderRadius: 14, padding: "8px 12px", display: "flex", gap: 6, boxShadow: "0 8px 30px rgba(0,0,0,0.6)" }}>
                      {EMOJIS.map(emoji => (
                        <button key={emoji} onClick={() => handleReaction(msg.id, emoji)}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, padding: 3, borderRadius: 6 }}
                          onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.3)")}
                          onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {typingList.length > 0 && (
              <div style={{ padding: "4px 54px", fontSize: 12, color: "#818cf8", fontStyle: "italic" }}>
                {typingList.join(", ")} {typingList.length === 1 ? "is" : "are"} typing...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Members panel */}
          {showMemberPanel && (
            <div style={{ width: 220, borderLeft: "1px solid #1e1e2e", background: "#111118", padding: "16px 12px", overflowY: "auto", flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Members — {members.length}</div>
              {members.map(m => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, marginBottom: 4 }}>
                  <div style={{ position: "relative" }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: avatarColor(m.id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>
                      {m.full_name?.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ position: "absolute", bottom: -1, right: -1, width: 8, height: 8, borderRadius: "50%", background: m.is_online ? "#22c55e" : "#475569", border: "1.5px solid #111118" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{m.full_name}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{m.role}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{ padding: "12px 24px 20px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#1a1a27", border: "1px solid #2e2e3e", borderRadius: 14, padding: "9px 14px" }}>
            <input value={input} onChange={handleInputChange} onKeyDown={handleKey}
              placeholder={activeProject ? `Message #${activeProject.name}...` : "Select a channel"}
              disabled={!activeProject || !connected}
              style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#f1f5f9", fontSize: 14, caretColor: "#6366f1", fontFamily: "inherit" }} />
            <button onClick={handleSend} disabled={!input.trim() || !connected}
              style={{ background: input.trim() && connected ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "#1e1e2e", border: "none", cursor: input.trim() && connected ? "pointer" : "default", color: input.trim() && connected ? "#fff" : "#475569", borderRadius: 9, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>↑</button>
          </div>
          <div style={{ fontSize: 11, color: "#334155", marginTop: 6, textAlign: "center" }}>Enter to send · Shift+Enter for new line</div>
        </div>
      </div>

      {/* ── CREATE CHANNEL MODAL ─────────────────────────────────────────── */}
      {showCreateChannel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#111118", border: "1px solid #2e2e3e", borderRadius: 16, padding: 32, width: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.8)" }}>
            <h2 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 700, color: "#f1f5f9" }}>✨ Create Channel</h2>

            <label style={{ fontSize: 12, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 6 }}>CHANNEL NAME</label>
            <input value={newChannel.name}
              onChange={e => setNewChannel(n => ({ ...n, name: e.target.value.toLowerCase().replace(/\s+/g, "-") }))}
              placeholder="e.g. design-team"
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #2e2e3e", background: "#0a0a0f", color: "#f1f5f9", fontSize: 14, outline: "none", marginBottom: 14 }} autoFocus />

            <label style={{ fontSize: 12, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 6 }}>DESCRIPTION (optional)</label>
            <input value={newChannel.description}
              onChange={e => setNewChannel(n => ({ ...n, description: e.target.value }))}
              placeholder="What is this channel about?"
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #2e2e3e", background: "#0a0a0f", color: "#f1f5f9", fontSize: 14, outline: "none", marginBottom: 14 }} />

            <label style={{ fontSize: 12, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 8 }}>ICON</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {ICONS.map(icon => (
                <button key={icon} onClick={() => setNewChannel(n => ({ ...n, icon }))}
                  style={{ width: 38, height: 38, borderRadius: 9, border: `2px solid ${newChannel.icon === icon ? "#6366f1" : "#2e2e3e"}`, background: newChannel.icon === icon ? "#1e1e3a" : "#0a0a0f", cursor: "pointer", fontSize: 18 }}>
                  {icon}
                </button>
              ))}
            </div>

            <label style={{ fontSize: 12, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 8 }}>COLOR</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
              {COLORS.map(color => (
                <button key={color} onClick={() => setNewChannel(n => ({ ...n, color }))}
                  style={{ width: 28, height: 28, borderRadius: "50%", background: color, border: `3px solid ${newChannel.color === color ? "#fff" : "transparent"}`, cursor: "pointer" }} />
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowCreateChannel(false)}
                style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "1px solid #2e2e3e", background: "none", color: "#94a3b8", cursor: "pointer", fontSize: 14 }}>
                Cancel
              </button>
              <button onClick={createChannel} disabled={!newChannel.name.trim() || createLoading}
                style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14, opacity: createLoading ? 0.7 : 1 }}>
                {createLoading ? "Creating..." : "Create Channel 🚀"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD MEMBER MODAL ─────────────────────────────────────────────── */}
      {showAddMember && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#111118", border: "1px solid #2e2e3e", borderRadius: 16, padding: 28, width: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.8)" }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>➕ Add Member to #{activeProject?.name}</h2>
            <input value={searchUser} onChange={e => setSearchUser(e.target.value)} placeholder="Search by name or username..."
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #2e2e3e", background: "#0a0a0f", color: "#f1f5f9", fontSize: 14, outline: "none", marginBottom: 14 }} autoFocus />

            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {/* Already members */}
              {filteredMembers.length > 0 && (
                <div style={{ fontSize: 11, color: "#475569", padding: "4px 4px 6px", fontWeight: 600, textTransform: "uppercase" }}>Already in channel</div>
              )}
              {filteredMembers.map(m => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 9, marginBottom: 4, background: "#0a0a0f" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: avatarColor(m.id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>
                    {m.full_name?.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>{m.full_name}</div>
                    <div style={{ fontSize: 11, color: "#475569" }}>@{m.username}</div>
                  </div>
                  <span style={{ fontSize: 11, color: "#22c55e", background: "#0d2d1a", padding: "2px 8px", borderRadius: 6 }}>✓ Member</span>
                </div>
              ))}

              {/* Not members */}
              {nonMembers.length > 0 && (
                <div style={{ fontSize: 11, color: "#475569", padding: "12px 4px 6px", fontWeight: 600, textTransform: "uppercase" }}>Add to channel</div>
              )}
              {nonMembers.map(u => (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 9, marginBottom: 4, background: "#16161f" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: avatarColor(u.id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>
                    {u.full_name?.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{u.full_name}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>@{u.username}</div>
                  </div>
                  <button onClick={() => addMemberToChannel(u.id)}
                    style={{ background: "#6366f1", border: "none", borderRadius: 7, color: "#fff", padding: "5px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                    Add
                  </button>
                </div>
              ))}

              {nonMembers.length === 0 && allUsers.length === 0 && (
                <div style={{ color: "#475569", textAlign: "center", padding: "20px 0", fontSize: 13 }}>
                  No other users found. Ask them to register first!
                </div>
              )}
            </div>

            <button onClick={() => setShowAddMember(false)}
              style={{ width: "100%", marginTop: 16, padding: "10px 0", borderRadius: 9, border: "1px solid #2e2e3e", background: "none", color: "#94a3b8", cursor: "pointer", fontSize: 14 }}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── HUDDLE MODAL ─────────────────────────────────────────────────── */}
      {showHuddle && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#111118", border: "1px solid #2e2e3e", borderRadius: 16, padding: 32, width: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.8)", textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>{huddleActive ? "🔴" : "🎙️"}</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: "#f1f5f9" }}>
              {huddleActive ? "Huddle Active" : "Start a Huddle"}
            </h2>
            <p style={{ margin: "0 0 24px", fontSize: 14, color: "#64748b" }}>
              {huddleActive
                ? `You are currently in a huddle in #${activeProject?.name}`
                : `Start a quick voice chat with everyone in #${activeProject?.name}`}
            </p>

            {huddleActive && members.length > 0 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 24 }}>
                {members.slice(0, 5).map(m => (
                  <div key={m.id} style={{ textAlign: "center" }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: avatarColor(m.id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", border: "2px solid #22c55e", margin: "0 auto 4px" }}>
                      {m.full_name?.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{m.full_name?.split(" ")[0]}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowHuddle(false)}
                style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "1px solid #2e2e3e", background: "none", color: "#94a3b8", cursor: "pointer", fontSize: 14 }}>
                {huddleActive ? "Keep Huddle" : "Cancel"}
              </button>
              <button onClick={() => { setHuddleActive(!huddleActive); setShowHuddle(false); }}
                style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "none", background: huddleActive ? "#dc2626" : "linear-gradient(135deg,#10b981,#059669)", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
                {huddleActive ? "🔴 End Huddle" : "🎙️ Start Huddle"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}