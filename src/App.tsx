import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Search, MessageCircle, Users, Settings, Plus, Send, Paperclip, Smile, Mic,
  ArrowLeft, MoreVertical, LogOut, Sun, Moon, Pencil, Trash2, Check, X,
  Bell, BellOff, Download, Wifi, WifiOff, Circle, UserX, Ban, ShieldBan, UserRoundPen, Reply, Copy, Heart, ThumbsUp, Laugh, Eye, CheckCheck, Palette, Lock, UserRound, XCircle, SlidersHorizontal, BarChart3, Image as ImageIcon, Video, FileText, Link as LinkIcon, UserPlus, SearchX, VolumeX, Volume2, ChevronDown, Play, Pause, Trash, LockKeyhole, Square
} from "lucide-react";
import { supabase, configured } from "./lib/supabase";

type Profile = {
  id: string; username: string; display_name: string;
  avatar_url?: string | null; bio?: string | null;
  online?: boolean | null; last_seen?: string | null;
};
type Chat = {
  id: string; name: string; username?: string; avatar_url?: string | null; otherId?: string;
  other?: Profile | null; created_by?: string | null; last?: string; time?: string; unread?: number; sortAt?: string;
  type?: "direct" | "group" | string; title?: string; memberCount?: number;
};
type Message = {
  id: string; chat_id: string; sender_id: string; content: string;
  message_type?: "text" | "image" | "file" | "poll" | string; media_url?: string | null; media_type?: string | null;
  created_at: string; updated_at?: string; edited?: boolean; deleted_at?: string | null; reply_to_id?: string | null; delivered_at?: string | null; read_at?: string | null; media_duration?: number | null;
};

type Tab = "chats" | "people" | "settings";

const initials = (name = "?") => name.trim().split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase() || "?";
const timeOf = (iso?: string) => iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
const dateOf = (iso?: string) => iso ? new Date(iso).toLocaleDateString([], { day: "2-digit", month: "2-digit" }) : "";

const storagePathFromPublicUrl = (url?: string | null) => {
  if (!url) return null;
  try {
    const marker = "/storage/v1/object/public/chat-media/";
    const i = url.indexOf(marker);
    if (i < 0) return null;
    return decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
  } catch { return null; }
};

function svgAvatar(name: string, seed: string, size = 42) {
  const hue = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 17);
  const bg = `hsl(${hue} 28% 28%)`;
  const bg2 = `hsl(${(hue + 45) % 360} 30% 22%)`;
  const text = initials(name);
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${bg}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="url(#g)"/><circle cx="${size/2}" cy="${size*.38}" r="${size*.13}" fill="rgba(255,255,255,.86)"/><path d="M${size*.25} ${size*.77}c${size*.05}-${size*.18} ${size*.17}-${size*.27} ${size*.25}-${size*.27}s${size*.2} ${size*.09} ${size*.25} ${size*.27}" fill="rgba(255,255,255,.86)"/><text x="${size/2}" y="${size*.93}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${Math.max(7,size*.18)}" fill="rgba(255,255,255,.68)">${text}</text></svg>`)}`;
}

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(localStorage.getItem("groza-theme") !== "light");
  const [section, setSection] = useState<Tab>("chats");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Chat | null>(null);
  const [text, setText] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [groupCreatorOpen, setGroupCreatorOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupAvatar, setGroupAvatar] = useState<File | null>(null);
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [groupMemberQuery, setGroupMemberQuery] = useState("");
  const [groupCandidates, setGroupCandidates] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [senderProfiles, setSenderProfiles] = useState<Record<string, Profile>>({});
  const [chats, setChats] = useState<Chat[]>([]);
  // Не показываем «Нет чатов», пока первый список реально не загрузился.
  const [chatsReady, setChatsReady] = useState(false);
  const [people, setPeople] = useState<Profile[]>([]);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [peopleSearched, setPeopleSearched] = useState(false);
  const [photoViewer, setPhotoViewer] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [notifications, setNotifications] = useState(() => localStorage.getItem("groza-notifications") !== "off");
  const [installEvent, setInstallEvent] = useState<any>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactions, setReactions] = useState<Record<string, {emoji:string; user_id:string}[]>>({});
  const [typing, setTyping] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [pinned, setPinned] = useState<Message[]>([]);
  const chatIdsRef = useRef<Set<string>>(new Set());
  const selectedChatIdRef = useRef<string | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.documentElement.dataset.chatBg = localStorage.getItem("groza-chat-bg") || "default";
    document.documentElement.dataset.theme = localStorage.getItem("groza-theme") || (dark ? "dark" : "light");
    localStorage.setItem("groza-theme", localStorage.getItem("groza-theme") || (dark ? "dark" : "light"));
  }, [dark]);

  useEffect(() => {
    const onInstall = (e: any) => { e.preventDefault(); setInstallEvent(e); };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, []);

  // Keep the PWA service worker installed. Browser Push can wake it even when
  // the page itself is closed (after the user has granted notification permission).
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(err => console.warn("SW registration failed", err));
  }, []);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => { setSession(s); setLoading(false); });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    setChatsReady(false);
    loadChats();
    setOnline(true);
    return () => { setOnline(false); };
  }, [session?.user?.id]);


  useEffect(() => {
    selectedChatIdRef.current = selected?.id ?? null;
    if (selected) { loadMessages(selected.id); loadReactions(selected.id); loadPinned(selected.id); markRead(selected.id); }
  }, [selected?.id]);

  useEffect(() => {
    if (!selected || !messagesRef.current) return;
    requestAnimationFrame(() => { messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" }); });
  }, [messages.length, selected?.id]);

  useEffect(() => {
    const client = supabase;
    if (!client || !session?.user?.id) return;
    const userId = session.user.id;
    const channel = client.channel(`groza-live-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, async payload => {
        const row = (payload.new || payload.old) as Message;
        if (!row?.id) return;
        if (!chatIdsRef.current.has(row.chat_id)) {
          await loadChats();
          return;
        }
        if (payload.eventType === "INSERT") {
          setMessages(prev => selectedChatIdRef.current === row.chat_id && !prev.some(m => m.id === row.id) ? [...prev, row] : prev);
          updateChatPreview(row.chat_id, previewOf(row), row.created_at);
          // If the recipient is already looking at this chat, mark the new message read immediately.
          // Without this, read_at stayed NULL until the user left and reopened the chat.
          if (row.sender_id !== userId && selectedChatIdRef.current === row.chat_id) {
            await markRead(row.chat_id);
          }
          if (row.sender_id !== userId && selectedChatIdRef.current !== row.chat_id) {
            setChats(prev => prev.map(c => c.id === row.chat_id ? { ...c, unread: (c.unread || 0) + 1 } : c));
            if (notifications) notifyNewMessage(row);
          }
        } else if (payload.eventType === "UPDATE") {
          setMessages(prev => prev.map(m => m.id === row.id ? { ...m, ...row } : m));
          if (row.deleted_at) updateChatPreview(row.chat_id, "Сообщение удалено", row.updated_at || row.created_at);
          else updateChatPreview(row.chat_id, previewOf(row), row.updated_at || row.created_at);
        } else if (payload.eventType === "DELETE") {
          setMessages(prev => prev.filter(m => m.id !== row.id));
          loadChats();
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_members", filter: `user_id=eq.${userId}` }, () => loadChats())
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () => { if (selectedChatIdRef.current) loadReactions(selectedChatIdRef.current); })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_pins" }, () => { if (selectedChatIdRef.current) loadPinned(selectedChatIdRef.current); })
      .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes" }, () => { window.dispatchEvent(new Event("groza-poll-update")); })
      .on("postgres_changes", { event: "*", schema: "public", table: "typing_status" }, payload => { const row:any=payload.new; if (row && row.chat_id===selectedChatIdRef.current && row.user_id!==userId) setOtherTyping(!!row.is_typing); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, payload => {
        const p = payload.new as Profile;
        setPeople(prev => prev.map(x => x.id === p.id ? { ...x, ...p } : x));
        setChats(prev => prev.map(c => c.otherId === p.id ? { ...c, other: p, name: p.display_name, avatar_url: p.avatar_url } : c));
        setSelected(prev => prev?.otherId === p.id ? { ...prev, other: p, name: p.display_name, avatar_url: p.avatar_url } : prev);
      })
      .subscribe(status => {
        console.log("ГРОЗА REALTIME:", status);
        // If the socket drops on mobile Safari/Android, Supabase reconnects automatically.
      });

    // Mobile fallback: some networks suspend WebSocket connections in the background.
    // This keeps new messages appearing without a manual page refresh.
    const refreshTimer = window.setInterval(async () => {
      if (document.visibilityState === "hidden") return;
      await loadChats();
      const active = selectedChatIdRef.current;
      if (active) await loadMessages(active);
    }, 5000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        loadChats();
        const active = selectedChatIdRef.current;
        if (active) loadMessages(active);
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(refreshTimer);
      document.removeEventListener("visibilitychange", onVisible);
      client.removeChannel(channel);
    };
  }, [session?.user?.id, notifications]);

  // Restore the real Push subscription after every app update/reload when permission
  // has already been granted. This is what allows Push to work while the PWA is closed.
  useEffect(() => {
    if (!session?.user?.id || Notification.permission !== "granted") return;
    savePushSubscription().catch(err => console.warn("Push subscription refresh failed", err));
  }, [session?.user?.id]);

  async function savePushSubscription() {
    if (!supabase || !session?.user?.id || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
    if (!publicKey) throw new Error("Не настроен VITE_VAPID_PUBLIC_KEY");

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const padding = "=".repeat((4 - publicKey.length % 4) % 4);
      const base64 = (publicKey + padding).replace(/-/g, "+").replace(/_/g, "/");
      const raw = atob(base64);
      const key = new Uint8Array([...raw].map(c => c.charCodeAt(0)));
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key
      });
    }

    const json = subscription.toJSON();

    // One active subscription per account in this app.
    // Delete the old row first instead of relying on a partial-index upsert conflict.
    const { error: deleteError } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", session.user.id);

    if (deleteError) throw deleteError;

    const { error: insertError } = await supabase
      .from("push_subscriptions")
      .insert({
        user_id: session.user.id,
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh || "",
        auth: json.keys?.auth || "",
        subscription: json,
        updated_at: new Date().toISOString()
      });

    if (insertError) throw insertError;
  }

  async function notifyNewMessage(m: Message) {
    if (!notifications || !("Notification" in window) || Notification.permission !== "granted") return;
    const chat = chats.find(c => c.id === m.chat_id);
    try {
      const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.ready : null;
      if (registration) await registration.showNotification(chat?.name || "Новое сообщение", { body: previewOf(m), icon: "/icon-192.png", badge: "/icon-192.png", tag: `groza-${m.chat_id}`, data: { chatId: m.chat_id, url: "/" } });
      else new Notification(chat?.name || "Новое сообщение", { body: previewOf(m), icon: "/icon-192.png", tag: `groza-${m.chat_id}` });
    } catch { /* ignore */ }
  }

  async function requestNotifications() {
    if (!("Notification" in window)) { setError("Этот браузер не поддерживает уведомления."); return; }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      try { await savePushSubscription(); } catch (e: any) { setError(`Уведомления разрешены, но Push не настроен: ${e?.message || "ошибка"}`); return; }
      setNotifications(true); localStorage.setItem("groza-notifications", "on");
    } else setError("Разрешение на уведомления не выдано.");
  }

  async function sendPush(chatId: string, message: Message) {
    if (!supabase) return;
    try { await supabase.functions.invoke("send-push", { body: { chat_id: chatId, content: previewOf(message), message_type: message.message_type || "text" } }); }
    catch (e) { console.warn("Push send failed", e); }
  }
  async function setOnline(value: boolean) {
    if (!supabase || !session?.user?.id) return;
    await supabase.from("profiles").update({ online: value, last_seen: new Date().toISOString() }).eq("id", session.user.id);
  }

  useEffect(() => {
    if (!session?.user?.id) return;
    const heartbeat = window.setInterval(() => setOnline(true), 30000);
    const away = () => { if (document.visibilityState === "hidden") setOnline(false); else setOnline(true); };
    document.addEventListener("visibilitychange", away);
    return () => { clearInterval(heartbeat); document.removeEventListener("visibilitychange", away); };
  }, [session?.user?.id]);

  function previewOf(m: Partial<Message>) { return m.message_type === "image" ? "📷 Фото" : String(m.media_type || "").startsWith("audio/") ? "🎤 Голосовое сообщение" : m.message_type === "file" ? `📎 ${m.content || "Файл"}` : (m.content || "Сообщений пока нет"); }

  function updateChatPreview(chatId: string, last: string, at: string) {
    setChats(prev => {
      const found = prev.find(c => c.id === chatId);
      if (!found) { loadChats(); return prev; }
      const updated = { ...found, last, time: timeOf(at), sortAt: at };
      return [updated, ...prev.filter(c => c.id !== chatId)];
    });
  }

  async function loadPeople(query = peopleQuery) {
    if (!supabase || !session) return;
    const clean = query.trim().replace(/^@+/, "").toLowerCase();
    setPeopleSearched(true);
    if (!clean) { setPeople([]); return; }
    // Exact username search only: registered users are never listed automatically.
    const { data, error: e } = await supabase
      .from("profiles")
      .select("id,username,display_name,avatar_url,bio,online,last_seen")
      .neq("id", session.user.id)
      .eq("username", clean)
      .limit(1);
    if (e) { console.error(e); setError(e.message); return; }
    setPeople((data || []) as Profile[]);
  }

  async function loadChats() {
    if (!supabase || !session?.user?.id) return;

    // Важно: не очищаем старый список во время фонового обновления — тогда
    // мобильный интерфейс не будет на несколько секунд выглядеть пустым.
    try {
      const userId = session.user.id;
      const { data: hiddenRows, error: hiddenError } = await supabase
        .from("hidden_chats")
        .select("chat_id")
        .eq("user_id", userId);
      if (hiddenError) throw hiddenError;
      const hiddenIds = new Set((hiddenRows || []).map((x: any) => x.chat_id));

      const { data: memberships, error: me } = await supabase
        .from("chat_members")
        .select("chat_id, chats(id,type,title,created_at,created_by)")
        .eq("user_id", userId);
      if (me) throw me;

      const rows = ((memberships || []) as any[]).filter(r => !hiddenIds.has(r.chat_id));
      const allIds = ((memberships || []) as any[]).map(r => r.chat_id).filter(Boolean);
      chatIdsRef.current = new Set(allIds);

      if (!rows.length) { setChats([]); return; }
      const ids = rows.map(r => r.chat_id);

      // Загружаем данные параллельно, чтобы список чатов появлялся быстрее.
      const [membersResult, lastMessagesResult, unreadResult] = await Promise.all([
        supabase.from("chat_members").select("chat_id,user_id,role").in("chat_id", ids),
        supabase.from("messages").select("chat_id,content,message_type,media_url,created_at,updated_at,deleted_at").in("chat_id", ids).order("created_at", { ascending: false }),
        // Счётчик хранится не только в памяти: после перезагрузки страницы
        // непрочитанные сообщения снова получают правильный бейдж.
        supabase.from("messages").select("chat_id").in("chat_id", ids).neq("sender_id", userId).is("read_at", null).is("deleted_at", null)
      ]);

      if (membersResult.error) throw membersResult.error;
      if (lastMessagesResult.error) throw lastMessagesResult.error;
      if (unreadResult.error) throw unreadResult.error;

      const allMembers = membersResult.data || [];
      const otherIds = [...new Set(
        allMembers.filter((m: any) => m.user_id !== userId).map((m: any) => m.user_id)
      )];

      let profileMap: Record<string, Profile> = {};
      if (otherIds.length) {
        const { data: ps, error: pe } = await supabase
          .from("profiles")
          .select("id,username,display_name,avatar_url,bio,online,last_seen")
          .in("id", otherIds);
        if (pe) throw pe;
        for (const p of (ps || []) as Profile[]) profileMap[p.id] = p;
      }

      const lastByChat: Record<string, any> = {};
      for (const m of (lastMessagesResult.data || []) as any[]) {
        if (!lastByChat[m.chat_id]) lastByChat[m.chat_id] = m;
      }

      const unreadByChat: Record<string, number> = {};
      for (const m of (unreadResult.data || []) as any[]) {
        unreadByChat[m.chat_id] = (unreadByChat[m.chat_id] || 0) + 1;
      }

      const memberCountByChat: Record<string, number> = {};
      for (const member of allMembers as any[]) {
        memberCountByChat[member.chat_id] = (memberCountByChat[member.chat_id] || 0) + 1;
      }

      const result: Chat[] = rows.map((row: any) => {
        const chatInfo = row.chats || {};
        const other = allMembers.find((m: any) => m.chat_id === row.chat_id && m.user_id !== userId);
        const p = other ? profileMap[other.user_id] : null;
        const isDirect = (chatInfo.type || "direct") === "direct";
        const name = isDirect
          ? (p?.display_name || p?.username || "Пользователь")
          : (chatInfo.title || "Группа");
        const last = lastByChat[row.chat_id];

        return {
          id: row.chat_id,
          name,
          username: p?.username,
          avatar_url: p?.avatar_url || chatInfo.avatar_url || null,
          otherId: p?.id,
          other: p,
          last: last?.deleted_at ? "Сообщение удалено" : (last ? previewOf(last) : "Сообщений пока нет"),
          time: timeOf(last?.created_at),
          sortAt: last?.created_at || chatInfo.created_at,
          unread: unreadByChat[row.chat_id] || 0,
          type: chatInfo.type || "direct",
          title: chatInfo.title || null,
          created_by: chatInfo.created_by || null,
          memberCount: memberCountByChat[row.chat_id] || (isDirect ? 2 : 1)
        };
      }).sort((a, b) => new Date(b.sortAt || 0).getTime() - new Date(a.sortAt || 0).getTime());

      setChats(result);
    } catch (e: any) {
      console.error("Не удалось загрузить чаты:", e);
      setError(e?.message || "Не удалось загрузить чаты");
    } finally {
      setChatsReady(true);
    }
  }

  async function loadMessages(chatId: string) {
    if (!supabase) return;
    const { data, error: e } = await supabase.from("messages").select("id,chat_id,sender_id,content,message_type,media_url,media_type,media_duration,created_at,updated_at,edited,deleted_at,reply_to_id,delivered_at,read_at").eq("chat_id", chatId).order("created_at", { ascending: true }).limit(300);
    if (e) { setError(e.message); return; }
    const rows = (data || []) as Message[];
    setMessages(rows);
    const ids = [...new Set(rows.map(m => m.sender_id).filter(Boolean))];
    if (ids.length) {
      const { data: ps } = await supabase.from("profiles").select("id,username,display_name,avatar_url,bio,online,last_seen").in("id", ids);
      setSenderProfiles(prev => {
        const next = { ...prev };
        for (const profile of (ps || []) as Profile[]) next[profile.id] = profile;
        return next;
      });
    }
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, unread: 0 } : c));
  }

  async function auth() {
    setAuthError("");
    if (!supabase) { setAuthError("Сначала настройте Supabase. См. README.md."); return; }
    if (!username || !password || (authMode === "signup" && !displayName)) { setAuthError("Заполните все обязательные поля."); return; }
    const email = `${username.toLowerCase()}@groza.app`;
    if (authMode === "signup") {
      const { data, error: e } = await supabase.auth.signUp({ email, password, options: { data: { username: username.toLowerCase(), display_name: displayName } } });
      if (e) setAuthError(e.message); else if (data.user) await ensureProfile(data.user.id);
    } else {
      const { error: e } = await supabase.auth.signInWithPassword({ email, password }); if (e) setAuthError("Неверный username или пароль.");
    }
  }
  async function ensureProfile(id: string) {
    if (!supabase) return;
    await supabase.from("profiles").upsert({ id, username: username.toLowerCase(), display_name: displayName || username });
  }
  async function startChat(p: Profile) {
    if (!supabase || !session?.user?.id) return;
    const { data: chatId, error: e } = await supabase.rpc("create_direct_chat", { other_user_id: p.id });
    if (e || !chatId) { setError(e?.message || "Не удалось создать чат."); return; }
    const chat: Chat = { id: chatId, name: p.display_name || p.username, username: p.username, avatar_url: p.avatar_url, otherId: p.id, other: p, last: "Сообщений пока нет" };
    chatIdsRef.current.add(chat.id); setChats(prev => [chat, ...prev.filter(c => c.id !== chat.id)]); setSelected(chat); setSection("chats"); await loadChats();
  }
  async function markRead(chatId?: string) {
    if (!supabase || !session?.user?.id) return;
    const id = chatId || selectedChatIdRef.current;
    if (!id) return;
    const { error } = await supabase.rpc("mark_chat_read", { p_chat_id: id });
    if (error) console.warn("Не удалось отметить сообщения прочитанными:", error.message);
  }

  async function loadReactions(chatId: string) {
    if (!supabase) return;
    const { data } = await supabase.from("message_reactions").select("message_id,emoji,user_id").eq("chat_id", chatId);
    const grouped: Record<string, any[]> = {};
    (data || []).forEach((r:any) => (grouped[r.message_id] ||= []).push(r));
    setReactions(grouped);
  }

  async function loadPinned(chatId: string) {
    if (!supabase) return;
    // Загружаем закрепления двумя запросами. Это надёжнее, чем вложенный
    // messages(*) запрос, который на некоторых схемах/RLS возвращал пустой результат.
    const { data: pins, error: pinsError } = await supabase
      .from("chat_pins")
      .select("message_id,created_at")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false });

    if (pinsError) {
      console.warn("Не удалось загрузить закрепления:", pinsError.message);
      setPinned([]);
      return;
    }

    const ids = (pins || []).map((x:any) => x.message_id).filter(Boolean);
    if (!ids.length) { setPinned([]); return; }

    const { data: rows, error: messagesError } = await supabase
      .from("messages")
      .select("*")
      .in("id", ids)
      .is("deleted_at", null);

    if (messagesError) {
      console.warn("Не удалось загрузить закреплённые сообщения:", messagesError.message);
      setPinned([]);
      return;
    }

    const byId = new Map((rows || []).map((m:any) => [m.id, m]));
    setPinned(ids.map(id => byId.get(id)).filter(Boolean) as Message[]);
  }

  async function togglePin(message: Message) {
    if (!supabase || !selected || !session?.user?.id) return;
    const exists = pinned.some(x=>x.id===message.id);

    if (exists) {
      const { error: unpinError } = await supabase
        .from("chat_pins")
        .delete()
        .eq("chat_id", selected.id)
        .eq("message_id", message.id);
      if (unpinError) { setError(`Не удалось открепить: ${unpinError.message}`); return; }
    } else {
      const { error: pinError } = await supabase
        .from("chat_pins")
        .insert({ chat_id:selected.id, message_id:message.id, pinned_by:session.user.id });
      if (pinError && pinError.code !== "23505") { setError(`Не удалось закрепить: ${pinError.message}`); return; }
    }

    await loadPinned(selected.id);
  }

  async function createPoll(question:string, options:string[]) {
    if (!supabase || !selected || selected.type !== "group" || !session?.user?.id) {
      setError("Опросы можно создавать только в группах.");
      return false;
    }
    const cleanQuestion = question.trim();
    const cleanOptions = options.map(x=>x.trim()).filter(Boolean);
    if (!cleanQuestion || cleanOptions.length < 2) {
      setError("Укажите вопрос и минимум 2 варианта.");
      return false;
    }
    const payload = JSON.stringify({question:cleanQuestion, options:cleanOptions});
    const {data,error:e}=await supabase.from("messages").insert({
      chat_id:selected.id,
      sender_id:session.user.id,
      content:payload,
      message_type:"poll"
    }).select().single();
    if(e){setError(`Не удалось создать опрос: ${e.message}`);return false;}
    if(data){
      const m=data as Message;
      setMessages(prev=>prev.some(x=>x.id===m.id)?prev:[...prev,m]);
      updateChatPreview(m.chat_id,"📊 Опрос",m.created_at);
      await sendPush(m.chat_id,m);
    }
    return !!data;
  }

  async function toggleReaction(messageId: string, emoji: string) {
    if (!supabase || !session?.user?.id || !selected) return;
    const mine = reactions[messageId]?.find(r => r.user_id === session.user.id && r.emoji === emoji);
    if (mine) await supabase.from("message_reactions").delete().eq("message_id", messageId).eq("user_id", session.user.id).eq("emoji", emoji);
    else await supabase.from("message_reactions").upsert({ message_id: messageId, chat_id: selected.id, user_id: session.user.id, emoji }, { onConflict:"message_id,user_id,emoji" });
    await loadReactions(selected.id);
  }

  async function copyText(value: string) {
    try { await navigator.clipboard.writeText(value); } catch { const ta=document.createElement("textarea"); ta.value=value; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
  }

  async function sendTyping(value: boolean) {
    if (!supabase || !selected || !session?.user?.id) return;
    setTyping(value);
    await supabase.from("typing_status").upsert({ chat_id:selected.id, user_id:session.user.id, is_typing:value, updated_at:new Date().toISOString() }, { onConflict:"chat_id,user_id" });
  }

  async function send() {
    const value = text.trim(); if (!value || !selected || !supabase || !session?.user?.id || uploadingPhoto) return;
    const { data, error: e } = await supabase.from("messages").insert({ chat_id: selected.id, sender_id: session.user.id, content: value, message_type: "text", reply_to_id: replyTo?.id || null }).select().single();
    if (e) { setError(e.message); return; }
    if (data) { const m = data as Message; setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]); updateChatPreview(m.chat_id, previewOf(m), m.created_at); await sendPush(m.chat_id, m); }
    setText(""); setReplyTo(null); sendTyping(false);
  }

  async function sendPhoto(file: File) {
    if (!selected || !supabase || !session?.user?.id || uploadingPhoto) return;
    // iPhone Safari can provide an empty MIME type for some photos (especially HEIC).
    const guessedByName = /\.(heic|heif)$/i.test(file.name) ? "image/heic" : /\.png$/i.test(file.name) ? "image/png" : /\.webp$/i.test(file.name) ? "image/webp" : /\.gif$/i.test(file.name) ? "image/gif" : "image/jpeg";
    const mime = file.type && file.type.startsWith("image/") ? file.type : guessedByName;
    if (!mime.startsWith("image/")) { setError("Можно отправлять только изображения."); return; }
    if (file.size > 10 * 1024 * 1024) { setError("Фотография слишком большая. Максимум 10 МБ."); return; }
    setUploadingPhoto(true);
    try {
      const ext = (file.name.split(".").pop() || mime.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
      const uuid = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const path = `${selected.id}/${session.user.id}/${uuid}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("chat-media").upload(path, file, { contentType: mime, upsert: false });
      if (uploadError) throw uploadError;
      const { data: publicUrl } = supabase.storage.from("chat-media").getPublicUrl(path);
      const { data, error: messageError } = await supabase.from("messages").insert({
        chat_id: selected.id, sender_id: session.user.id, content: "Фото", message_type: "image",
        media_url: publicUrl.publicUrl, media_type: mime
      }).select().single();
      if (messageError) throw messageError;
      if (data) { const m = data as Message; setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]); updateChatPreview(m.chat_id, previewOf(m), m.created_at); await sendPush(m.chat_id, m); }
    } catch (e: any) {
      console.error("PHOTO UPLOAD:", e);
      setError(`Не удалось отправить фото: ${e?.message || "неизвестная ошибка"}`);
    } finally {
      setUploadingPhoto(false);
    }
  }
  async function sendFile(file: File) {
    if (!selected || !supabase || !session?.user?.id || uploadingFile) return;
    if (file.size > 50 * 1024 * 1024) { setError("Файл слишком большой. Максимум 50 МБ."); return; }
    setUploadingFile(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
      const uuid = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const path = `${selected.id}/${session.user.id}/files/${uuid}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("chat-media").upload(path, file, { contentType: file.type || "application/octet-stream", upsert:false });
      if (uploadError) throw uploadError;
      const { data: publicUrl } = supabase.storage.from("chat-media").getPublicUrl(path);
      const { data, error: messageError } = await supabase.from("messages").insert({ chat_id:selected.id, sender_id:session.user.id, content:file.name, message_type:"file", media_url:publicUrl.publicUrl, media_type:file.type || "application/octet-stream" }).select().single();
      if (messageError) throw messageError;
      if (data) { const m=data as Message; setMessages(prev=>prev.some(x=>x.id===m.id)?prev:[...prev,m]); updateChatPreview(m.chat_id, previewOf(m), m.created_at); await sendPush(m.chat_id, m); }
    } catch(e:any) { setError(`Не удалось отправить файл: ${e?.message || "неизвестная ошибка"}`); }
    finally { setUploadingFile(false); }
  }

  async function sendVoice(blob: Blob, durationSec: number) {
    if (!selected || !supabase || !session?.user?.id) return;
    try {
      const mime = blob.type || "audio/webm";
      const ext = mime.includes("mp4") || mime.includes("aac") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
      const uuid = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const path = `${selected.id}/${session.user.id}/voice/${uuid}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("chat-media").upload(path, blob, { contentType: mime, upsert:false });
      if (uploadError) throw uploadError;
      const { data: publicUrl } = supabase.storage.from("chat-media").getPublicUrl(path);
      const label = `🎤 Голосовое сообщение · ${Math.max(1, Math.round(durationSec))} сек.`;
      // Используем существующий тип file, чтобы не требовать изменения CHECK constraint в БД.
      const { data, error: messageError } = await supabase.from("messages").insert({
        chat_id:selected.id, sender_id:session.user.id, content:label, message_type:"file",
        media_url:publicUrl.publicUrl, media_type:mime, media_duration:Math.max(1, Math.round(durationSec))
      }).select().single();
      if (messageError) throw messageError;
      if (data) { const m=data as Message; setMessages(prev=>prev.some(x=>x.id===m.id)?prev:[...prev,m]); updateChatPreview(m.chat_id, "🎤 Голосовое сообщение", m.created_at); await sendPush(m.chat_id,m); }
    } catch(e:any) { console.error("VOICE:",e); setError(`Не удалось отправить голосовое: ${e?.message || "неизвестная ошибка"}`); }
  }

  async function loadGroupCandidates(query = groupMemberQuery) {
    if (!supabase || !session?.user?.id) return;
    // Only people with whom the current account already has a direct chat.
    const { data: myMemberships, error: me } = await supabase
      .from("chat_members")
      .select("chat_id,chats(type)")
      .eq("user_id", session.user.id);
    if (me) { setError(me.message); return; }
    const directIds = (myMemberships || []).filter((r:any) => (r.chats?.type || "direct") === "direct").map((r:any)=>r.chat_id);
    if (!directIds.length) { setGroupCandidates([]); return; }
    const { data: members, error: ce } = await supabase.from("chat_members").select("user_id,chat_id").in("chat_id", directIds).neq("user_id", session.user.id);
    if (ce) { setError(ce.message); return; }
    const ids = [...new Set((members || []).map((m:any)=>m.user_id))];
    if (!ids.length) { setGroupCandidates([]); return; }
    let request = supabase.from("profiles").select("id,username,display_name,avatar_url,bio,online,last_seen").in("id", ids).order("display_name").limit(50);
    const q=query.trim(); if(q) request=request.or(`username.ilike.%${q}%,display_name.ilike.%${q}%`);
    const { data, error:e }=await request;
    if(e){setError(e.message);return;}
    setGroupCandidates((data||[]) as Profile[]);
  }

  async function createGroup() {
    if (!supabase || !session?.user?.id) return;
    const title=groupName.trim(); if(!title){setError("Введите название группы.");return;}
    const { data: chatId, error:e }=await supabase.rpc("create_group_chat",{ p_title:title, p_member_ids: groupMemberIds });
    if(e||!chatId){setError(e?.message||"Не удалось создать группу.");return;}
    let avatar_url:string|null=null;
    if(groupAvatar){try{const ext=(groupAvatar.name.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,''); const path=`groups/${chatId}/${crypto.randomUUID()}.${ext}`; const up=await supabase.storage.from('chat-media').upload(path,groupAvatar,{contentType:groupAvatar.type||'image/jpeg'}); if(!up.error){avatar_url=supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl; await supabase.from('chats').update({avatar_url}).eq('id',chatId)}}catch{}}
    setGroupCreatorOpen(false);setGroupName("");setGroupAvatar(null);setGroupMemberIds([]);setGroupMemberQuery("");setGroupCandidates([]);await loadChats();
  }
  async function saveEdit(id: string) {
    const value = editingText.trim(); if (!value || !supabase) return;
    const { error: e } = await supabase.from("messages").update({ content: value, edited: true, updated_at: new Date().toISOString() }).eq("id", id).eq("sender_id", session.user.id);
    if (e) setError(e.message); else { setEditingId(null); setEditingText(""); }
  }
  async function deleteMessage(id: string) {
    if (!supabase || !session?.user?.id) return;
    const message = messages.find(m => m.id === id);
    if (!message) return;

    // Сразу убираем сообщение из интерфейса — оно должно полностью исчезнуть.
    setMessages(prev => prev.filter(m => m.id !== id));

    // Фото, голосовые и файлы удаляем также из Storage.
    const path = storagePathFromPublicUrl(message.media_url);
    if (path) {
      const { error: storageError } = await supabase.storage.from("chat-media").remove([path]);
      if (storageError) {
        console.warn("MEDIA DELETE:", storageError);
        setError(`Сообщение исчезло из чата, но файл в Storage не удалился: ${storageError.message}`);
      }
    }

    const { error: e } = await supabase.from("messages").delete().eq("id", id).eq("sender_id", session.user.id);
    if (e) {
      setMessages(prev => prev.some(m => m.id === message.id) ? prev : [...prev, message]);
      setError(e.message);
      return;
    }
    await loadChats();
  }

  async function deleteCurrentChat(chat: Chat, ask = true) {
    if (!supabase || !session?.user?.id) return;
    const ok = !ask || window.confirm(`Удалить чат с ${chat.name} из вашего списка?`);
    if (!ok) return;

    // ВАЖНО: не удаляем membership. Удаление membership лишало пользователя
    // права получать следующие сообщения.
    const { error: e } = await supabase
      .from("hidden_chats")
      .upsert({ user_id: session.user.id, chat_id: chat.id }, { onConflict: "user_id,chat_id" });

    if (e) { setError(e.message); return; }
    if (selectedChatIdRef.current === chat.id) { setSelected(null); setMessages([]); }
    setChats(prev => prev.filter(c => c.id !== chat.id));
  }

  async function blockCurrentUser(chat: Chat) {
    if (!supabase || !session?.user?.id || !chat.otherId) return;
    const ok = window.confirm(`Заблокировать ${chat.name}? Он больше не сможет писать вам.`);
    if (!ok) return;
    const { error: e } = await supabase.from("blocked_users").upsert({ blocker_id: session.user.id, blocked_id: chat.otherId }, { onConflict: "blocker_id,blocked_id" });
    if (e) { setError(e.message); return; }
    await deleteCurrentChat(chat, false);
  }

  async function logout() {
    await setOnline(false); if (supabase) await supabase.auth.signOut();
    setSelected(null); setMessages([]); setChats([]); setPeople([]); chatIdsRef.current = new Set(); selectedChatIdRef.current = null;
  }

  const visiblePeople = useMemo(() => people, [people]);
  const unreadTotal = chats.reduce((n, c) => n + (c.unread || 0), 0);
  if (loading) return <div className="splash">ГРОЗА</div>;
  if (!session) return <Auth mode={authMode} setMode={setAuthMode} username={username} setUsername={setUsername} password={password} setPassword={setPassword} displayName={displayName} setDisplayName={setDisplayName} error={authError} onSubmit={auth} />;

  return <div className="app">
    <aside className={`sidebar ${selected ? "mobile-hidden" : ""}`}>
      <header className="brand"><div className="logo">ϟ</div><div><b>ГРОЗА <em className="version-tag">v22</em></b><span>мессенджер</span></div><div className="connection"><Wifi size={14}/></div><div className="create-menu-wrap"><button className="create-plus" aria-label="Создать" onClick={() => setCreateMenuOpen(v => !v)}><Plus size={24}/></button>{createMenuOpen && <div className="create-menu"><button onClick={() => { setCreateMenuOpen(false); setSection("people"); setPeople([]); setPeopleQuery(""); setPeopleSearched(false); }}><MessageCircle size={18}/>Новый чат</button><button onClick={() => { setCreateMenuOpen(false); setGroupCreatorOpen(true); loadGroupCandidates(""); }}><Users size={18}/>Создать группу</button></div>}</div></header>
      <div className="search"><Search size={18}/><input placeholder="Поиск" value={search} onChange={e => setSearch(e.target.value)}/>{unreadTotal > 0 && <span className="total-badge">{unreadTotal}</span>}</div>
      <nav><button className={section === "chats" ? "active" : ""} onClick={() => setSection("chats")}><MessageCircle/>Чаты{unreadTotal > 0 && <em>{unreadTotal}</em>}</button><button className={section === "people" ? "active" : ""} onClick={() => { setSection("people"); setPeople([]); setPeopleQuery(""); setPeopleSearched(false); }}><Users/>Люди</button><button className={section === "settings" ? "active" : ""} onClick={() => setSection("settings")}><Settings/>Настройки</button></nav>
      <div className="side-list">
        {section === "people" && <div className="people-search-panel">
          <div className="people-search-row"><Search size={18}/><input placeholder="Введите @username" value={peopleQuery} onChange={e => { setPeopleQuery(e.target.value); setPeopleSearched(false); }} onKeyDown={e => { if (e.key === "Enter") loadPeople(); }}/><button className="people-find" onClick={() => loadPeople()}><Search size={17}/>Найти</button></div>
          {!peopleSearched && <div className="people-search-hint"><Users size={28}/><b>Найдите человека по username</b><span>Введите точный @username. Список зарегистрированных пользователей не показывается.</span></div>}
          {peopleSearched && !visiblePeople.length && <div className="people-search-hint"><Search size={28}/><b>Пользователь не найден</b><span>Проверьте username и попробуйте ещё раз.</span></div>}
          {visiblePeople.map(p => <button className="person" key={p.id} onClick={() => startChat(p)}><Avatar p={p}/><span><b>{p.display_name}</b><small>@{p.username}</small><small className={p.online ? "online-text" : ""}>{p.online ? "● В сети" : p.last_seen ? `Был(а) ${dateOf(p.last_seen)} в ${timeOf(p.last_seen)}` : "Не в сети"}</small></span><Plus size={17}/></button>)}
        </div>}
        {section === "chats" && !chatsReady && <div className="chat-list-loading"><i/><i/><i/><span>Загружаем чаты…</span></div>}
        {section === "chats" && chatsReady && chats.map(chat => <button className={`person chat-row ${selected?.id === chat.id ? "chat-selected" : ""}`} key={chat.id} onClick={() => { setSelected(chat); setSection("chats"); }}><Avatar p={chat.other || { id: chat.otherId || chat.id, username: "", display_name: chat.name, avatar_url: chat.avatar_url }}/><span><b>{chat.name}</b>{chat.username && <small>@{chat.username}</small>}<small>{chat.last}</small></span>{chat.unread ? <strong className="unread-badge">{chat.unread}</strong> : chat.time && <small className="row-time">{chat.time}</small>}</button>)}
        {section === "chats" && chatsReady && chats.length === 0 && <div className="empty"><MessageCircle size={35}/><b>Нет открытых чатов</b><span>Найдите пользователя и начните разговор</span><button className="primary compact" onClick={() => setSection("people")}>Найти людей</button></div>}
        {section === "settings" && <SettingsPanel dark={dark} setDark={setDark} notifications={notifications} requestNotifications={requestNotifications} setNotifications={(v: boolean) => { setNotifications(v); localStorage.setItem("groza-notifications", v ? "on" : "off"); }} installEvent={installEvent} logout={logout} userId={session.user.id}/>}      
      </div>

    </aside>
    <main className="main">
      {selected ? <ChatView selected={selected} messages={messages} text={text} setText={setText} send={send} back={() => { setSelected(null); setMessages([]); setReplyTo(null); }} sessionId={session.user.id} editingId={editingId} setEditingId={setEditingId} editingText={editingText} setEditingText={setEditingText} saveEdit={saveEdit} deleteMessage={deleteMessage} sendPhoto={sendPhoto} sendFile={sendFile} uploadingFile={uploadingFile} deleteChat={deleteCurrentChat} blockUser={blockCurrentUser} uploadingPhoto={uploadingPhoto} onOpenPhoto={setPhotoViewer} replyTo={replyTo} setReplyTo={setReplyTo} reactions={reactions} toggleReaction={toggleReaction} copyText={copyText} sendTyping={sendTyping} otherTyping={otherTyping} senderProfiles={senderProfiles} pinned={pinned} pinnedIds={new Set(pinned.map(p=>p.id))} togglePin={togglePin} createPoll={createPoll} sendVoice={sendVoice} /> : <Welcome onPeople={() => { setSection("people"); setPeople([]); setPeopleQuery(""); setPeopleSearched(false); }} />}
    </main>
    {photoViewer && <div className="photo-viewer" role="dialog" aria-modal="true" onClick={() => setPhotoViewer(null)}><button className="photo-viewer-close" onClick={() => setPhotoViewer(null)} aria-label="Закрыть"><X/></button><img src={photoViewer} alt="Фотография" onClick={e => e.stopPropagation()}/></div>}
    {groupCreatorOpen && <div className="modal-backdrop" onClick={()=>setGroupCreatorOpen(false)}><div className="group-modal" onClick={e=>e.stopPropagation()}><button className="modal-x" onClick={()=>setGroupCreatorOpen(false)}><X/></button><h2>Новая группа</h2><input value={groupName} onChange={e=>setGroupName(e.target.value)} placeholder="Название группы" maxLength={80}/><label className="group-avatar-picker">🖼️ Аватар группы<input type="file" accept="image/*" onChange={e=>setGroupAvatar(e.target.files?.[0]||null)}/></label><div className="group-step"><b>Участники</b><small>Выберите людей, которых хотите добавить в группу</small><div className="group-search"><Search size={16}/><input value={groupMemberQuery} onChange={e=>{setGroupMemberQuery(e.target.value);loadGroupCandidates(e.target.value)}} placeholder="Поиск участников"/></div><div className="group-picked">{groupMemberIds.length ? `Выбрано: ${groupMemberIds.length}` : "Пока никто не выбран"}</div><div className="group-candidates">{groupCandidates.map(p=>{const on=groupMemberIds.includes(p.id);return <button type="button" className={on?"chosen":""} key={p.id} onClick={()=>setGroupMemberIds(prev=>on?prev.filter(id=>id!==p.id):[...prev,p.id])}><Avatar p={p}/><span><b>{p.display_name}</b><small>@{p.username}</small></span>{on?<Check size={18}/>:<Plus size={18}/>}</button>})}</div></div><button className="primary" onClick={createGroup}>Создать группу</button></div></div>}
    {error && <div className="toast">{error}<button onClick={() => setError("")}>×</button></div>}
  </div>;
}

function Avatar({ p }: { p: Profile }) {
  const src = p.avatar_url || svgAvatar(p.display_name, p.id);
  return <div className="avatar"><img src={src} alt=""/><span className={`status-dot ${p.online ? "online" : ""}`}/></div>;
}

function Auth({ mode, setMode, username, setUsername, password, setPassword, displayName, setDisplayName, error, onSubmit }: any) {
  return <div className="auth"><div className="auth-card"><div className="big-logo">ϟ</div><h1>ГРОЗА</h1><p>Современный мессенджер</p><div className="tabs"><button className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>Войти</button><button className={mode === "signup" ? "on" : ""} onClick={() => setMode("signup")}>Создать аккаунт</button></div>{mode === "signup" && <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Отображаемое имя"/>}<input value={username} onChange={e => setUsername(e.target.value.replace(/\s/g, ""))} placeholder="Username"/><input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Пароль"/>{error && <div className="auth-error">{error}</div>}<button className="primary" onClick={onSubmit}>{mode === "login" ? "Войти" : "Зарегистрироваться"}</button>{!configured && <div className="hint">Для реальной регистрации подключите Supabase по инструкции в README.</div>}</div></div>;
}

function Welcome({ onPeople }: { onPeople: () => void }) {
  return <div className="welcome"><div className="welcome-logo">ϟ</div><h2>Добро пожаловать в ГРОЗА</h2><p>Личные сообщения в реальном времени.</p><button className="primary compact" onClick={onPeople}><Users size={18}/>Найти людей</button></div>;
}

function ChatView({ selected, messages, text, setText, send, sendPhoto, sendFile, uploadingPhoto, uploadingFile, onOpenPhoto, back, sessionId, editingId, setEditingId, editingText, setEditingText, saveEdit, deleteMessage, deleteChat, blockUser, replyTo, setReplyTo, reactions, toggleReaction, copyText, sendTyping, otherTyping, senderProfiles, pinned, pinnedIds, togglePin, createPoll, sendVoice }: any) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [groupManageOpen, setGroupManageOpen] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [messageQuery, setMessageQuery] = useState("");
  const [muted, setMuted] = useState(() => localStorage.getItem(`groza-muted-${selected.id}`) === "1");
  const [showJump, setShowJump] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordLocked, setRecordLocked] = useState(false);
  const [voicePreview, setVoicePreview] = useState<{blob:Blob,url:string,duration:number}|null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordStartedRef = useRef(0);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const isCreator = selected.type === "group" && selected.created_by === sessionId;
  // Черновики сохраняются отдельно для каждого чата и не теряются при выходе.
  useEffect(() => { setText(localStorage.getItem(`groza-draft-${selected.id}`) || ""); }, [selected.id]);
  useEffect(() => {
    // После добавления/удаления сообщения DOM и высота списка могут меняться несколько кадров.
    // Ставим прокрутку в самый низ после layout и повторяем после следующего кадра.
    let raf1 = 0, raf2 = 0;
    const scrollToRealBottom = () => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      raf2 = requestAnimationFrame(() => {
        const current = scrollRef.current;
        if (current) current.scrollTop = Math.max(0, current.scrollHeight - current.clientHeight);
      });
    };
    raf1 = requestAnimationFrame(scrollToRealBottom);
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [messages, messageQuery]);
  const updateDraft = (value:string) => { setText(value); const key=`groza-draft-${selected.id}`; if(value.trim()) localStorage.setItem(key,value); else localStorage.removeItem(key); };
  const sendWithDraft = async () => { const key=`groza-draft-${selected.id}`; await send(); localStorage.removeItem(key); };
  const onMessagesScroll = () => { const el=scrollRef.current; if(!el)return; setShowJump(el.scrollHeight-el.scrollTop-el.clientHeight>220); };
  const jumpToLatest = () => scrollRef.current?.scrollTo({top:scrollRef.current.scrollHeight,behavior:"smooth"});
  const jumpToMessage = (messageId:string) => {
    const el = document.getElementById(`groza-message-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior:"smooth", block:"center" });
      el.classList.add("pinned-message-highlight");
      window.setTimeout(() => el.classList.remove("pinned-message-highlight"), 1800);
    }
  };
  const replyMessage = replyTo ? messages.find((x:Message)=>x.id===replyTo.reply_to_id) : null;
  const visibleMessages = messages.filter((m:Message)=>!m.deleted_at);
  const filteredMessages = messageQuery.trim() ? visibleMessages.filter((m:Message)=>String(m.content||"").toLowerCase().includes(messageQuery.trim().toLowerCase())) : visibleMessages;
  const toggleMute = () => { const next=!muted; setMuted(next); localStorage.setItem(`groza-muted-${selected.id}`, next?"1":"0"); setMenuOpen(false); };
  const formatVoiceTime = (sec:number) => `${Math.floor(sec/60)}:${String(sec%60).padStart(2,"0")}`;
  const cleanupPreview = () => {
    setVoicePreview(prev => { if (prev?.url) URL.revokeObjectURL(prev.url); return null; });
    setPreviewPlaying(false);
  };
  const startVoice = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { alert("Голосовые сообщения не поддерживаются этим браузером."); return; }
    cleanupPreview();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true, channelCount:1, sampleRate:48000, sampleSize:16 } });
      recordStreamRef.current = stream;
      const supports=(type:string)=>typeof MediaRecorder.isTypeSupported==="function"&&MediaRecorder.isTypeSupported(type);
      const preferred=["audio/mp4;codecs=mp4a.40.2","audio/mp4","audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus"].find(supports);
      const options:MediaRecorderOptions={audioBitsPerSecond:192000}; if(preferred) options.mimeType=preferred;
      const rec=new MediaRecorder(stream,options);
      recordChunksRef.current=[]; recordStartedRef.current=Date.now(); setRecordSeconds(0); setRecordLocked(false);
      rec.ondataavailable=(e)=>{if(e.data.size)recordChunksRef.current.push(e.data)};
      rec.onerror=(e:any)=>{console.error("VOICE RECORDER:",e);setRecording(false);recordStreamRef.current?.getTracks().forEach(t=>t.stop());recordStreamRef.current=null};
      rec.onstop=()=>{
        recordStreamRef.current?.getTracks().forEach(t=>t.stop()); recordStreamRef.current=null;
        const duration=Math.max(1,Math.round((Date.now()-recordStartedRef.current)/1000));
        const fallback=preferred?.includes("mp4")?"audio/mp4":"audio/webm";
        const blob=new Blob(recordChunksRef.current,{type:rec.mimeType||preferred||fallback});
        setRecording(false); setRecordLocked(false); setRecordSeconds(duration);
        if(blob.size>500) setVoicePreview({blob,url:URL.createObjectURL(blob),duration});
      };
      recorderRef.current=rec; rec.start(250); setRecording(true);
    } catch(e){console.error(e);alert("Не удалось получить доступ к микрофону. Разрешите доступ к микрофону в браузере.")}
  };
  const finishVoice = () => { if(recorderRef.current?.state==="recording") recorderRef.current.stop(); };
  const cancelVoice = () => {
    if(recorderRef.current?.state==="recording"){ recorderRef.current.onstop=null; recorderRef.current.stop(); }
    recordStreamRef.current?.getTracks().forEach(t=>t.stop()); recordStreamRef.current=null;
    recordChunksRef.current=[]; setRecording(false); setRecordLocked(false); setRecordSeconds(0); cleanupPreview();
  };
  const togglePreview = async () => {
    const a=previewAudioRef.current; if(!a)return;
    if(a.paused){ await a.play(); setPreviewPlaying(true); } else { a.pause(); setPreviewPlaying(false); }
  };
  const sendPreviewVoice = async () => {
    if(!voicePreview)return;
    const {blob,duration}=voicePreview; cleanupPreview(); await sendVoice(blob,duration); setRecordSeconds(0);
  };
  useEffect(()=>{ if(!recording)return; const id=window.setInterval(()=>setRecordSeconds(Math.max(1,Math.floor((Date.now()-recordStartedRef.current)/1000))),500); return()=>window.clearInterval(id); },[recording]);
  useEffect(()=>()=>{ if(voicePreview?.url) URL.revokeObjectURL(voicePreview.url); },[]);
  return <section className="chat">
    <header className="chat-head">
      <button className="icon-btn back" onClick={back}><ArrowLeft/></button>
      <button className="profile-hit" onClick={()=>selected.type==="group"?setGroupInfoOpen(true):setProfileOpen(true)}><Avatar p={selected.other || { id:selected.otherId||selected.id, display_name:selected.name, avatar_url:selected.avatar_url }}/><div className="chat-title"><b>{selected.name}</b><small className={selected.other?.online ? "online-text" : ""}>{selected.type === "group" ? `${selected.memberCount || 1} участников` : (otherTyping ? "печатает..." : selected.other?.online ? "В сети" : "был(а) недавно")}</small></div></button>
      <div className="chat-menu-wrap"><button className="icon-btn" onClick={()=>setMenuOpen(v=>!v)}><MoreVertical/></button>{menuOpen&&<div className="chat-menu">{selected.type==="group"&&isCreator&&<button onClick={()=>{setMenuOpen(false);setGroupManageOpen(true)}}><Users size={17}/>Управление группой</button>}{selected.type==="group"&&<button onClick={()=>{setMenuOpen(false);setPollOpen(true)}}><BarChart3 size={17}/>Создать опрос</button>}<button onClick={()=>{setMenuOpen(false);setMessageSearchOpen(true)}}><Search size={17}/>Поиск сообщений</button><button onClick={toggleMute}>{muted?<><Volume2 size={17}/>Включить звук</>:<><VolumeX size={17}/>Без звука</>}</button><button onClick={()=>{setMenuOpen(false);deleteChat(selected)}}><Trash2 size={17}/>Удалить чат</button>{selected.type!=="group"&&<button className="danger-item" onClick={()=>{setMenuOpen(false);blockUser(selected)}}><Ban size={17}/>Заблокировать</button>}</div>}</div>
    </header>
    {pinned?.length>0&&<div className="pinned-bar" onClick={()=>jumpToMessage(pinned[0].id)} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==="Enter"||e.key===" ")jumpToMessage(pinned[0].id)}}><span>📌</span><div><b>Закреплённое сообщение{pinned.length>1?` (${pinned.length})`:""}</b><small>{pinned[0]?.message_type==="poll"?"📊 Опрос":pinned[0]?.content}</small></div><button className="pinned-unpin" onClick={e=>{e.stopPropagation();togglePin(pinned[0])}} title="Открепить сообщение">✕</button></div>}
    {messageSearchOpen&&<div className="message-search-bar"><Search size={18}/><input autoFocus value={messageQuery} onChange={e=>setMessageQuery(e.target.value)} placeholder="Поиск по сообщениям"/><button onClick={()=>{setMessageSearchOpen(false);setMessageQuery("")}}><X size={18}/></button></div>}
    <div className="messages" ref={scrollRef} onScroll={onMessagesScroll}>{filteredMessages.length ? filteredMessages.map((m:Message)=><MessageBubble key={m.id} m={m} mine={m.sender_id===sessionId} messages={messages} onOpenPhoto={onOpenPhoto} editingId={editingId} setEditingId={setEditingId} editingText={editingText} setEditingText={setEditingText} saveEdit={saveEdit} deleteMessage={deleteMessage} onReply={setReplyTo} reactions={reactions[m.id]||[]} toggleReaction={toggleReaction} copyText={copyText} senderProfile={senderProfiles?.[m.sender_id]} isGroup={selected.type==="group"} togglePin={togglePin} isPinned={pinnedIds?.has(m.id)}/>) : <div className="chat-empty">{messageQuery?"Ничего не найдено":"Сообщений пока нет"}</div>}</div>
    {replyTo&&<div className="reply-bar"><Reply size={17}/><span><b>Ответ</b><small>{replyTo.content}</small></span><button onClick={()=>setReplyTo(null)}><X size={18}/></button></div>}
    {showJump&&<button className="jump-latest" onClick={jumpToLatest} title="К последним сообщениям"><ChevronDown size={22}/><span>Новые сообщения</span></button>}
    {recording ? <div className={`voice-recording ${recordLocked?"locked":""}`}>
      <button className="voice-trash" onClick={cancelVoice} title="Удалить запись"><Trash2 size={23}/></button>
      <div className="voice-record-status"><span className="record-dot"/><b>{formatVoiceTime(recordSeconds)}</b><small>{recordLocked?"Запись зафиксирована":"Запись голосового сообщения"}</small></div>
      <button className={`voice-lock ${recordLocked?"on":""}`} onClick={()=>setRecordLocked(v=>!v)} title="Зафиксировать запись"><LockKeyhole size={22}/></button>
      <button className="voice-finish" onClick={finishVoice} title="Остановить и прослушать"><Square size={19}/></button>
    </div> : voicePreview ? <div className="voice-preview">
      <button className="voice-trash" onClick={cleanupPreview} title="Удалить"><Trash2 size={23}/></button>
      <button className="voice-play" onClick={togglePreview}>{previewPlaying?<Pause size={22}/>:<Play size={22}/>}</button>
      <div className="voice-wave"><div className="voice-wave-line"/><b>{formatVoiceTime(voicePreview.duration)}</b><small>Прослушайте перед отправкой</small></div>
      <audio ref={previewAudioRef} src={voicePreview.url} onEnded={()=>setPreviewPlaying(false)} onPause={()=>setPreviewPlaying(false)} onPlay={()=>setPreviewPlaying(true)} preload="metadata"/>
      <button className="voice-send" onClick={sendPreviewVoice} title="Отправить"><Send size={24}/></button>
    </div> : <div className="composer"><input id="groza-photo-input" className="photo-input" type="file" accept="image/*" onChange={e=>{const file=e.target.files?.[0];if(file)sendPhoto(file);e.currentTarget.value=""}}/><input id="groza-file-input" className="photo-input" type="file" onChange={e=>{const file=e.target.files?.[0];if(file)sendFile(file);e.currentTarget.value=""}}/><div className="attach-wrap"><button type="button" className={`icon-btn photo-label ${(uploadingPhoto||uploadingFile)?"disabled":""}`} onClick={()=>{const menu=document.getElementById("groza-attach-menu");menu?.classList.toggle("open")}}><Paperclip/></button><div id="groza-attach-menu" className="attach-menu"><label htmlFor="groza-photo-input">Фото</label><label htmlFor="groza-file-input">Файл</label></div></div><input value={text} onChange={e=>{updateDraft(e.target.value);sendTyping(!!e.target.value)}} onBlur={()=>sendTyping(false)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendWithDraft()}}} placeholder={uploadingPhoto?"Отправляем фото...":"Сообщение"} disabled={uploadingPhoto}/>{text.trim()?<button className="send" onClick={sendWithDraft}><Send/></button>:<button className="icon-btn mic-btn" onClick={startVoice} title="Записать голосовое"><Mic/></button>}</div>}
    {pollOpen&&<PollCreator onClose={()=>setPollOpen(false)} onCreate={async(q:string,o:string[])=>{await createPoll(q,o);setPollOpen(false)}}/>}
    {groupManageOpen&&isCreator&&<GroupManager chat={selected} userId={sessionId} onClose={()=>setGroupManageOpen(false)}/>}
    {groupInfoOpen&&<GroupInfo chat={selected} onClose={()=>setGroupInfoOpen(false)}/>}
    {profileOpen&&<div className="modal-backdrop" onClick={()=>setProfileOpen(false)}><div className="user-profile-modal" onClick={e=>e.stopPropagation()}><button className="modal-x" onClick={()=>setProfileOpen(false)}><X/></button><Avatar p={selected.other || {id:selected.otherId||selected.id,display_name:selected.name,avatar_url:selected.avatar_url}}/><h2>{selected.name}</h2><b>@{selected.other?.username||"user"}</b><p>{selected.other?.bio||"Пользователь ГРОЗЫ"}</p><span className="online-text">{selected.other?.online?"● В сети":"Был(а) недавно"}</span></div></div>}
  </section>;
}

function GroupInfo({chat,onClose}:any){
 const [members,setMembers]=useState<any[]>([]);
 const [stats,setStats]=useState({photos:0,videos:0,files:0,links:0,voice:0}); const [gallery,setGallery]=useState<any>(null);
 useEffect(()=>{(async()=>{
   if(!supabase)return;
   const [memRes,msgRes]=await Promise.all([
     supabase.from("chat_members").select("user_id,role,profiles(id,username,display_name,avatar_url,online,last_seen)").eq("chat_id",chat.id).order("joined_at"),
     supabase.from("messages").select("message_type,content,media_type").eq("chat_id",chat.id)
   ]);
   setMembers(memRes.data||[]);
   const rows:any[]=msgRes.data||[];
   setStats({
     photos:rows.filter((m:any)=>m.message_type==="image"||String(m.media_type||"").startsWith("image/")).length,
     videos:rows.filter((m:any)=>m.message_type==="video"||String(m.media_type||"").startsWith("video/")).length,
     files:rows.filter((m:any)=>m.message_type==="file").length,
     links:rows.filter((m:any)=>/https?:\/\//i.test(m.content||"")).length,
     voice:rows.filter((m:any)=>m.message_type==="voice"||String(m.media_type||"").startsWith("audio/")).length
   });
 })()},[chat.id]);
 const roleName=(r:string)=>r==="owner"?"Создатель":r==="admin"?"Администратор":r==="moderator"?"Модератор":"Участник";
 const avatar={id:chat.id,display_name:chat.name,avatar_url:chat.avatar_url};
 const mediaRows:any[]=[[ImageIcon,stats.photos,"фотографий"],[Video,stats.videos,"видео"],[FileText,stats.files,"файлов"],[LinkIcon,stats.links,"ссылок"],[Mic,stats.voice,"голосовых сообщений"]];
 return <div className="modal-backdrop group-profile-backdrop" onClick={onClose}><div className="group-profile-sheet" onClick={e=>e.stopPropagation()}>
   <button className="modal-x" onClick={onClose}><X/></button>
   <div className="group-profile-hero"><Avatar p={avatar}/><div><h2>{chat.name}</h2><small>{members.length} участников</small></div></div>
   <div className="group-profile-actions"><button><Bell size={19}/><span>Звук</span></button><button><SlidersHorizontal size={19}/><span>Управление</span></button><button><BarChart3 size={19}/><span>Медиа</span></button><button><MoreVertical size={19}/><span>Ещё</span></button></div>
   <div className="group-profile-media">{mediaRows.map(([Icon,count,label]:any)=><button key={label} onClick={()=>setGallery(label)}><Icon size={20}/><span>{count} {label}</span></button>)}</div>
   <div className="group-profile-members-head"><div><Users size={19}/><b>{members.length} УЧАСТНИКА</b></div><UserPlus size={20}/></div>
   <div className="group-profile-members">{members.map((m:any)=>{const p=m.profiles||{};return <div className="group-profile-member" key={m.user_id}><Avatar p={{id:m.user_id,display_name:p.display_name||"Пользователь",username:p.username||"",avatar_url:p.avatar_url,online:p.online}}/><span><b>{p.display_name||"Пользователь"}</b><small>{p.online?"в сети":`@${p.username||""}`}</small></span><strong className={`role-badge role-${m.role}`}>{roleName(m.role)}</strong></div>})}</div>
 {gallery&&<GroupGallery chat={chat} kind={gallery} onClose={()=>setGallery(null)}/>}
 </div></div>
}

function GroupManager({chat,userId,onClose}:any){
 const [title,setTitle]=useState(chat.name||""); const [members,setMembers]=useState<any[]>([]); const [query,setQuery]=useState(""); const [candidates,setCandidates]=useState<Profile[]>([]); const [loading,setLoading]=useState(true); const [msg,setMsg]=useState("");
 const load=async()=>{if(!supabase)return;setLoading(true);const {data}=await supabase.from("chat_members").select("user_id,role,profiles(id,username,display_name,avatar_url)").eq("chat_id",chat.id).order("joined_at");setMembers(data||[]);setLoading(false)};
 useEffect(()=>{load()},[chat.id]);
 const loadContacts=async(v:string)=>{setQuery(v);if(!supabase)return;const {data:my}=await supabase.from("chat_members").select("chat_id,chats(type)").eq("user_id",userId);const direct=(my||[]).filter((x:any)=>(x.chats?.type||"direct")==="direct").map((x:any)=>x.chat_id);if(!direct.length){setCandidates([]);return;}const {data:ms}=await supabase.from("chat_members").select("user_id").in("chat_id",direct).neq("user_id",userId);const ids=[...new Set((ms||[]).map((x:any)=>x.user_id))];if(!ids.length){setCandidates([]);return;}let r=supabase.from("profiles").select("id,username,display_name,avatar_url").in("id",ids).order("display_name").limit(30);const q=v.trim();if(q)r=r.or(`username.ilike.%${q}%,display_name.ilike.%${q}%`);const {data}=await r;setCandidates((data||[]).filter((p:any)=>!members.some((m:any)=>m.user_id===p.id)))};
 const saveTitle=async()=>{const {error}=await supabase?.rpc("update_group_chat",{p_chat_id:chat.id,p_title:title.trim()});setMsg(error?.message||"Название сохранено");};
 const add=async(id:string)=>{const {error}=await supabase?.rpc("add_group_members",{p_chat_id:chat.id,p_user_ids:[id]});if(error)setMsg(error.message);else{setMsg("Участник добавлен");loadContacts(query);load()}};
 const remove=async(id:string)=>{const {error}=await supabase?.rpc("remove_group_member",{p_chat_id:chat.id,p_user_id:id});if(error)setMsg(error.message);else load()};
 const role=async(id:string,r:string)=>{const {error}=await supabase?.rpc("set_group_member_role",{p_chat_id:chat.id,p_user_id:id,p_role:r});if(error)setMsg(error.message);else load()};
 const roleName=(r:string)=>r==="owner"?"Создатель":r==="admin"?"Администратор":r==="moderator"?"Модератор":"Участник";
 return <div className="modal-backdrop" onClick={onClose}><div className="group-modal group-manage" onClick={e=>e.stopPropagation()}><button className="modal-x" onClick={onClose}><X/></button><h2>Управление группой</h2><label>Название группы</label><div className="profile-edit-row"><input value={title} onChange={e=>setTitle(e.target.value)} maxLength={80}/><button onClick={saveTitle}>Сохранить</button></div><b>Участники</b>{loading?<small>Загрузка...</small>:<div className="manage-members">{members.map((m:any)=>{const p=m.profiles||{};const owner=m.role==="owner";return <div key={m.user_id}><Avatar p={{id:m.user_id,display_name:p.display_name||"Пользователь",username:p.username||"",avatar_url:p.avatar_url}}/><span><b>{p.display_name||"Пользователь"}</b><small>@{p.username||""}</small></span>{owner?<strong className="role-badge role-owner">Создатель</strong>:<select value={m.role} onChange={e=>role(m.user_id,e.target.value)}><option value="admin">Администратор</option><option value="moderator">Модератор</option><option value="member">Участник</option></select>}{!owner&&<button className="member-remove" onClick={()=>remove(m.user_id)}><X size={16}/></button>}</div>})}</div>}<div className="group-step"><b>Добавить участников</b><small>Показываются только люди из ваших личных чатов</small><div className="group-search"><Search size={16}/><input value={query} onFocus={()=>loadContacts(query)} onChange={e=>loadContacts(e.target.value)} placeholder="Поиск людей"/></div><div className="group-candidates">{candidates.map(p=><button type="button" key={p.id} onClick={()=>add(p.id)}><Avatar p={p}/><span><b>{p.display_name}</b><small>@{p.username}</small></span><Plus size={18}/></button>)}</div></div>{msg&&<small className="group-msg">{msg}</small>}</div></div>
}


function PollCreator({onClose,onCreate}:any){
 const [q,setQ]=useState(""); const [opts,setOpts]=useState(["",""]);
 return <div className="modal-backdrop" onClick={onClose}><div className="group-modal poll-modal" onClick={e=>e.stopPropagation()}><button className="modal-x" onClick={onClose}><X/></button><h2>📊 Новый опрос</h2><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Вопрос" maxLength={180}/>{opts.map((o,i)=><input key={i} value={o} onChange={e=>setOpts(x=>x.map((v,n)=>n===i?e.target.value:v))} placeholder={`Вариант ${i+1}`}/>) }<button className="text-add" onClick={()=>setOpts(x=>x.length<8?[...x,""]:x)}>+ Добавить вариант</button><button className="primary" disabled={!q.trim()||opts.filter(Boolean).length<2} onClick={()=>onCreate(q.trim(),opts)}>Создать опрос</button></div></div>
}

function PollCard({message}:any){
 let data:any; try{data=JSON.parse(message.content)}catch{data={question:"Опрос",options:[]}};
 const [votes,setVotes]=useState<any[]>([]);
 useEffect(()=>{const load=async()=>{if(!supabase)return;const {data:v}=await supabase.from("poll_votes").select("user_id,option_index").eq("message_id",message.id);setVotes(v||[])};load();window.addEventListener("groza-poll-update",load);return()=>window.removeEventListener("groza-poll-update",load)},[message.id]);
 const vote=async(i:number)=>{if(!supabase)return;const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {error}=await supabase.from("poll_votes").upsert({message_id:message.id,user_id:user.id,option_index:i},{onConflict:"message_id,user_id"});if(!error){const {data:v}=await supabase.from("poll_votes").select("user_id,option_index").eq("message_id",message.id);setVotes(v||[])}};
 const total=votes.length;
 return <div className="poll-card"><b>📊 {data.question}</b><div>{(data.options||[]).map((o:string,i:number)=>{const count=votes.filter(v=>v.option_index===i).length;const pct=total?Math.round(count/total*100):0;return <button className="poll-option" key={i} onClick={()=>vote(i)}><span className="poll-fill" style={{width:`${pct}%`}}/><span className="poll-label">{o}</span><strong>{count||""}</strong></button>})}</div><small>{total} голос{total===1?"":"ов"}</small></div>
}

function GroupGallery({chat,kind,onClose}:any){
 const [items,setItems]=useState<any[]>([]); const [loading,setLoading]=useState(true);
 useEffect(()=>{(async()=>{if(!supabase)return;const {data}=await supabase.from("messages").select("*").eq("chat_id",chat.id).order("created_at",{ascending:false});const all:any[]=data||[];const filtered=all.filter(m=>kind==="фотографий"?(m.message_type==="image"||String(m.media_type||"").startsWith("image/")):kind==="видео"?String(m.media_type||"").startsWith("video/"):kind==="файлов"?m.message_type==="file":kind==="ссылок"?/https?:\/\//i.test(m.content||""):String(m.media_type||"").startsWith("audio/"));setItems(filtered);setLoading(false)})()},[chat.id,kind]);
 return <div className="modal-backdrop" onClick={onClose}><div className="gallery-modal" onClick={e=>e.stopPropagation()}><button className="modal-x" onClick={onClose}><X/></button><h2>{kind}</h2>{loading?<p>Загрузка...</p>:!items.length?<p>Пока ничего нет</p>:<div className="gallery-grid">{items.map(m=>m.message_type==="image"?<img key={m.id} src={m.media_url} alt=""/>:<a key={m.id} href={m.media_url||"#"} target="_blank" rel="noreferrer">{m.content||"Файл"}</a>)}</div>}</div></div>
}

function VoiceMessage({src,label,durationHint}:any){
 const audioRef=useRef<HTMLAudioElement|null>(null);
 const [playing,setPlaying]=useState(false);
 const [current,setCurrent]=useState(0);
 const [duration,setDuration]=useState(0);
 const fallback=Number(durationHint)||Number((String(label||"").match(/(\d+)\s*сек/)||[])[1]||0);
 const total=Math.max(duration||0,fallback||0);
 const fmt=(v:number)=>`${Math.floor(v/60)}:${String(Math.floor(v%60)).padStart(2,"0")}`;
 const toggle=async()=>{const a=audioRef.current;if(!a)return;if(a.paused){try{await a.play()}catch{}}else a.pause()};
 return <div className="voice-message compact-voice" onPointerDown={e=>e.stopPropagation()}>
   <audio ref={audioRef} src={src} preload="metadata" onLoadedMetadata={e=>setDuration(Number.isFinite(e.currentTarget.duration)?e.currentTarget.duration:0)} onTimeUpdate={e=>setCurrent(e.currentTarget.currentTime)} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>{setPlaying(false);setCurrent(0)}}/>
   <button className="voice-bubble-play" onClick={toggle} aria-label={playing?"Пауза":"Слушать"}>{playing?<Pause size={18} fill="currentColor"/>:<Play size={19} fill="currentColor"/>}</button>
   <div className="voice-bubble-main"><div className="voice-bars">{Array.from({length:22}).map((_,i)=><i key={i} style={{height:`${7+((i*13)%15)}px`}}/>)}</div><div className="voice-bubble-meta">{playing ? <b>{fmt(Math.max(0,total-current))}</b> : <b>{fmt(total)}</b>}</div></div>
   <Mic size={16} className="voice-bubble-mic"/>
 </div>
}

function MessageBubble({m,mine,messages,onOpenPhoto,editingId,setEditingId,editingText,setEditingText,saveEdit,deleteMessage,onReply,reactions,toggleReaction,copyText,senderProfile,isGroup,togglePin,isPinned}:any){
 const deleted=!!m.deleted_at; const [menuOpen,setMenuOpen]=useState(false); const holdTimer=useRef<number|null>(null); const reply=messages.find((x:Message)=>x.id===m.reply_to_id);
 const startHold=()=>{if(deleted||editingId===m.id)return; if(holdTimer.current)clearTimeout(holdTimer.current);holdTimer.current=window.setTimeout(()=>{setMenuOpen(true);navigator.vibrate?.(12)},520)};
 const cancelHold=()=>{if(holdTimer.current){clearTimeout(holdTimer.current);holdTimer.current=null}};
 const grouped=reactions.reduce((a:any,r:any)=>{(a[r.emoji]||=[]).push(r);return a},{});
 return <div id={`groza-message-${m.id}`} className={`bubble-row ${mine?"mine":""}`}><div className="bubble-wrap"><div className={`bubble ${deleted?"deleted":""} ${m.message_type==="image"&&!deleted?"photo-bubble":""}`} onPointerDown={startHold} onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold} onContextMenu={e=>{e.preventDefault();setMenuOpen(true)}}>
 {editingId===m.id?<div className="edit-box"><textarea value={editingText} onChange={e=>setEditingText(e.target.value)} autoFocus/><div><button onClick={()=>saveEdit(m.id)}><Check size={15}/>Сохранить</button><button onClick={()=>setEditingId(null)}><X size={15}/>Отмена</button></div></div>:<>{isGroup&&!mine&&<div className="group-message-author"><Avatar p={senderProfile||{id:m.sender_id,display_name:"Пользователь",username:""}}/><b>{senderProfile?.display_name||senderProfile?.username||"Пользователь"}</b></div>}{reply&&<div className="reply-preview"><Reply size={13}/><span><b>{reply.sender_id===m.sender_id?"Сообщение":"Ответ"}</b>{reply.content}</span></div>}{m.message_type==="poll"?<PollCard message={m}/>:m.message_type==="image"&&m.media_url?<button className="photo-message" onClick={()=>onOpenPhoto(m.media_url)}><img src={m.media_url} alt="Фотография"/></button>:String(m.media_type||"").startsWith("audio/")&&m.media_url?<VoiceMessage src={m.media_url} label={m.content} durationHint={m.media_duration}/>:m.message_type==="file"&&m.media_url?<a className="file-message" href={m.media_url} target="_blank" rel="noreferrer">📎 <span>{m.content||"Файл"}</span></a>:m.content}<small>{timeOf(m.created_at)}{m.edited?" · изменено":""}{mine&&<span className="delivery">{m.read_at?<CheckCheck size={14}/>:m.delivered_at?<CheckCheck size={14}/>:<Check size={14}/>}</span>}</small></>}
 </div>{Object.keys(grouped).length>0&&<div className="reaction-row">{Object.entries(grouped).map(([emoji,rs]:any)=><button key={emoji} className={rs.some((r:any)=>r.user_id===m.sender_id)?"reacted":""} onClick={()=>toggleReaction(m.id,emoji)}>{emoji} {rs.length}</button>)}</div>}
 {menuOpen&&!deleted&&createPortal(<><div className="message-sheet-backdrop" onClick={()=>setMenuOpen(false)}/><div className="message-sheet" role="dialog" aria-label="Действия с сообщением"><div className="quick-reactions">{["👍","❤️","😂","🔥","😮"].map(e=><button key={e} onClick={()=>{toggleReaction(m.id,e);setMenuOpen(false)}}>{e}</button>)}</div><button onClick={()=>{onReply(m);setMenuOpen(false)}}><Reply size={19}/>Ответить</button><button onClick={async()=>{await togglePin(m);setMenuOpen(false)}}>{isPinned?"📍 Открепить":"📌 Закрепить"}</button>{m.message_type!=="image"&&<button onClick={()=>{copyText(m.content);setMenuOpen(false)}}><Copy size={19}/>Копировать</button>}{mine&&m.message_type!=="image"&&<button onClick={()=>{setEditingId(m.id);setEditingText(m.content);setMenuOpen(false)}}><Pencil size={19}/>Редактировать</button>}{mine&&<button className="danger" onClick={()=>{deleteMessage(m.id);setMenuOpen(false)}}><Trash2 size={19}/>Удалить</button>}<button className="cancel" onClick={()=>setMenuOpen(false)}>Отмена</button></div></>,document.body)}</div></div>
}

type SettingsPanelProps = { dark:boolean; setDark:(value:boolean)=>void; notifications:boolean; requestNotifications:()=>void; setNotifications:(value:boolean)=>void; installEvent:any; logout:()=>void; userId:string; };
function SettingsPanel({dark,setDark,notifications,requestNotifications,setNotifications,installEvent,logout,userId}:SettingsPanelProps){
 const [profile,setProfile]=useState<Profile|null>(null); const [displayName,setDisplayName]=useState(""); const [username,setUsername]=useState(""); const [bio,setBio]=useState(""); const [theme,setTheme]=useState(localStorage.getItem("groza-theme")||"dark"); const [privacy,setPrivacy]=useState({allow_messages:"everyone",show_online:true,show_last_seen:true}); const [blocked,setBlocked]=useState<Profile[]>([]); const [saving,setSaving]=useState(false); const [profileError,setProfileError]=useState(""); const [chatBg,setChatBg]=useState(localStorage.getItem("groza-chat-bg")||"default");
 const load=async()=>{if(!supabase)return; const {data}=await supabase.from("profiles").select("id,username,display_name,avatar_url,bio,online,last_seen").eq("id",userId).single();if(data){setProfile(data);setDisplayName(data.display_name||"");setUsername(data.username||"");setBio(data.bio||"")} const {data:pr}=await supabase.from("privacy_settings").select("allow_messages,show_online,show_last_seen").eq("user_id",userId).single();if(pr)setPrivacy(pr); const {data:bs}=await supabase.from("blocked_users").select("blocked_id").eq("blocker_id",userId);if(bs?.length){const ids=bs.map((x:any)=>x.blocked_id);const {data:pp}=await supabase.from("profiles").select("id,username,display_name,avatar_url,online,last_seen").in("id",ids);setBlocked(pp||[])}};
 useEffect(()=>{load()},[userId]);
 const applyTheme=(t:string)=>{setTheme(t);localStorage.setItem("groza-theme",t);document.documentElement.dataset.theme=t;setDark(t!=="light")};
 const saveProfile=async()=>{if(!supabase)return;const u=username.trim().replace(/^@/,"").toLowerCase();if(!/^[a-z0-9_]{3,32}$/.test(u)){setProfileError("Username: 3–32 символа, только латиница, цифры и _");return}setSaving(true);setProfileError("");const {error}=await supabase.from("profiles").update({display_name:displayName.trim(),username:u,bio:bio.trim()||null}).eq("id",userId);setSaving(false);if(error)setProfileError(error.message);else load()};
 const savePrivacy=async(p:any)=>{setPrivacy(p);await supabase?.from("privacy_settings").upsert({user_id:userId,...p},{onConflict:"user_id"})};
 const unblock=async(id:string)=>{await supabase?.from("blocked_users").delete().eq("blocker_id",userId).eq("blocked_id",id);setBlocked(x=>x.filter(p=>p.id!==id))};
 return <div className="settings-panel"><div className="settings-title">Настройки</div>
 <div className="profile-card"><div className="profile-card-title"><UserRoundPen size={18}/>Ваш профиль</div><label>Имя</label><input value={displayName} onChange={e=>setDisplayName(e.target.value)} maxLength={80}/><label>Username</label><input value={username} onChange={e=>setUsername(e.target.value.replace(/\s/g,""))} maxLength={32}/><label>О себе</label><input value={bio} onChange={e=>setBio(e.target.value)} maxLength={160}/><button className="profile-save" onClick={saveProfile} disabled={saving}>{saving?"Сохраняем...":"Сохранить профиль"}</button>{profileError&&<div className="profile-error">{profileError}</div>}</div>
 <div className="settings-subtitle"><Palette size={17}/>Оформление чата</div><div className="appearance-card"><label>Фон чата</label><div className="appearance-grid">{[["default","Стандарт"],["dots","Точки"],["stars","Звёзды"],["waves","Волны"]].map(([id,l])=><button className={chatBg===id?"theme-active":""} key={id} onClick={()=>{setChatBg(id);localStorage.setItem("groza-chat-bg",id);document.documentElement.dataset.chatBg=id}}>{l}</button>)}</div></div>
 <div className="settings-subtitle"><Palette size={17}/>Темы оформления</div><div className="theme-grid">{[["dark","🌙 Тёмная"],["light","☀️ Светлая"],["purple","🟣 Фиолетовая"],["blue","🔵 Синяя"],["midnight","🌌 Полночь"],["emerald","💚 Изумрудная"],["sunset","🌅 Закат"],["rose","🌸 Розовая"],["ocean","🌊 Океан"],["coffee","☕ Кофейная"],["graphite","🪨 Графит"],["aurora","✨ Аврора"]].map(([id,label])=><button key={id} className={theme===id?"theme-active":""} onClick={()=>applyTheme(id)}>{label}</button>)}</div>
 <div className="settings-subtitle"><Lock size={17}/>Приватность</div><div className="privacy-card"><label>Кто может писать мне</label><select value={privacy.allow_messages} onChange={e=>savePrivacy({...privacy,allow_messages:e.target.value})}><option value="everyone">Все</option><option value="contacts">Только существующие чаты</option><option value="nobody">Никто</option></select><button className={`privacy-switch ${privacy.show_online?"on":""}`} onClick={()=>savePrivacy({...privacy,show_online:!privacy.show_online})}>Показывать «В сети»</button><button className={`privacy-switch ${privacy.show_last_seen?"on":""}`} onClick={()=>savePrivacy({...privacy,show_last_seen:!privacy.show_last_seen})}>Показывать время посещения</button></div>
 <div className="settings-subtitle"><Ban size={17}/>Чёрный список</div><div className="blocked-list">{blocked.length?blocked.map(p=><div className="blocked-user" key={p.id}><Avatar p={p}/><span><b>{p.display_name}</b><small>@{p.username}</small></span><button onClick={()=>unblock(p.id)}>Разблокировать</button></div>):<div className="empty-small">Заблокированных пользователей нет</div>}</div>
 <div className="setting"><span>{notifications?<Bell size={17}/>:<BellOff size={17}/>}Уведомления</span><button className={`switch ${notifications?"on":""}`} onClick={()=>notifications?setNotifications(false):requestNotifications()}><i/></button></div>{installEvent&&<button className="install-btn" onClick={async()=>{installEvent.prompt();await installEvent.userChoice}}><Download size={17}/>Установить ГРОЗА</button>}<button className="logout" onClick={logout}><LogOut/>Выйти</button></div>
}

