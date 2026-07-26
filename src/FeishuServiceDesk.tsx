import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import "./FeishuServiceDesk.css";

type Group = { group_key: string; label: string; description: string; feishu_chat_id?: string; active_count: number; waiting_count: number };
type Session = { id: number; customer_code: string; nickname: string; phone?: string; status: "ai" | "human_pending" | "human"; service_type: string; latest_message: string; latest_message_at: string; unread_count: number; assigned_to?: string; handoff_reason?: string };
type Message = { id: number; sender: "user" | "service" | "agent"; type: string; content: string; created_at: string };

const TOKEN_KEY = "fuchong-feishu-agent-token";
const AGENT_KEY = "fuchong-feishu-agent";
const OAUTH_STATE_KEY = "fuchong-feishu-oauth-state";
const QUICK_REPLIES = ["您好，我是客服经理，正在为您核实。", "收到，我已看到您的问题，请稍等片刻。", "为了准确处理，请补充订单号或对应商品。"];

export default function FeishuServiceDesk() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || "");
  const [agent, setAgent] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(AGENT_KEY) || "null"); } catch { return null; }
  });
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupKey, setGroupKey] = useState("purchase");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [active, setActive] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [online, setOnline] = useState(true);
  const chatRef = useRef<HTMLDivElement>(null);
  const groupsBootstrapped = useRef(false);
  const activeId = active?.id;
  const headers = useMemo(() => ({ Authorization: `Feishu ${token}`, "content-type": "application/json" }), [token]);

  useEffect(() => {
    const parameters = new URLSearchParams(location.search);
    const code = parameters.get("code");
    if (token || !code) { setLoading(false); return; }
    const state = parameters.get("state");
    const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    if (!state || !expectedState || state !== expectedState) {
      setError("飞书登录校验失败，请重新进入");
      setLoading(false);
      return;
    }
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    fetch("/api/feishu-service/auth", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, redirect_uri: `${location.origin}/feishu-service` }),
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "飞书免登失败");
      sessionStorage.setItem(TOKEN_KEY, data.token);
      sessionStorage.setItem(AGENT_KEY, JSON.stringify(data.agent));
      setToken(data.token); setAgent(data.agent);
      history.replaceState({}, "", "/feishu-service");
    }).catch((cause) => setError(cause.message)).finally(() => setLoading(false));
  }, [token]);

  const login = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/feishu-service/config");
      const config = await response.json();
      if (!response.ok || !config.app_id) throw new Error("客服飞书应用尚未配置");
      const redirect = config.redirect_uri || `${location.origin}/feishu-service`;
      const authorize = new URL("https://accounts.feishu.cn/open-apis/authen/v1/authorize");
      const state = crypto.randomUUID();
      sessionStorage.setItem(OAUTH_STATE_KEY, state);
      authorize.searchParams.set("client_id", config.app_id);
      authorize.searchParams.set("redirect_uri", redirect);
      authorize.searchParams.set("state", state);
      // Basic identity is granted by Feishu automatically. Adding the legacy
      // `user_profile` scope makes current custom apps fail with error 20043.
      location.href = authorize.toString();
    } catch { setError("暂时无法连接飞书登录"); setLoading(false); }
  };

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(path, { ...init, headers: { ...headers, ...(init?.headers || {}) } });
    if (response.status === 401) { sessionStorage.removeItem(TOKEN_KEY); setToken(""); throw new Error("登录已过期，请重新打开应用"); }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "操作失败");
    return data;
  }, [headers]);

  const loadQueues = useCallback(async () => {
    if (!token) return;
    try {
      const [groupData, sessionData] = await Promise.all([
        api("/api/feishu-service/groups"),
        api(`/api/feishu-service/sessions?group_key=${encodeURIComponent(groupKey)}`),
      ]);
      setGroups(groupData); setSessions(sessionData);
      setActive((current) => current ? sessionData.find((item: Session) => item.id === current.id) || current : null);
      setLastSync(new Date()); setOnline(true);
    } catch (cause) { setOnline(false); setError(cause instanceof Error ? cause.message : "队列加载失败"); }
  }, [api, groupKey, token]);

  const loadMessages = useCallback(async (sessionId: number) => {
    try { setMessages(await api(`/api/feishu-service/sessions/${sessionId}/messages`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "消息加载失败"); }
  }, [api]);

  useEffect(() => { loadQueues(); const timer = window.setInterval(loadQueues, 2500); return () => clearInterval(timer); }, [loadQueues]);
  useEffect(() => {
    if (!token || groupsBootstrapped.current || !groups.some((group) => !group.feishu_chat_id)) return;
    groupsBootstrapped.current = true;
    api("/api/feishu-service/groups/bootstrap", { method: "POST", body: "{}" })
      .then(loadQueues)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "飞书客服群初始化失败"));
  }, [api, groups, loadQueues, token]);
  useEffect(() => { if (!activeId) return; loadMessages(activeId); const timer = window.setInterval(() => loadMessages(activeId), 1800); return () => clearInterval(timer); }, [activeId, loadMessages]);
  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }); }, [messages.length]);

  const action = async (name: "close") => {
    if (!active) return;
    await api(`/api/feishu-service/sessions/${active.id}/${name}`, { method: "POST", body: "{}" });
    await Promise.all([loadQueues(), loadMessages(active.id)]);
  };
  const send = async (event?: FormEvent) => {
    event?.preventDefault(); const content = reply.trim(); if (!active || !content || sending) return;
    const optimisticId = -Date.now();
    setSending(true); setReply(""); setError("");
    setMessages((items) => [...items, { id: optimisticId, sender: "agent", type: "service", content, created_at: new Date().toISOString() }]);
    try {
      const created = await api(`/api/feishu-service/sessions/${active.id}/messages`, { method: "POST", body: JSON.stringify({ content }) });
      setActive((current) => current ? { ...current, status: "human", assigned_to: agent?.name || "客服经理" } : current);
      setMessages((items) => items.map((item) => item.id === optimisticId ? created : item));
      await Promise.all([loadMessages(active.id), loadQueues()]);
    } catch (cause) { setReply(content); setError(cause instanceof Error ? cause.message : "发送失败"); }
    finally { setSending(false); }
  };

  const visibleSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((session) => [session.nickname, session.customer_code, session.latest_message, session.service_type]
      .some((value) => String(value || "").toLowerCase().includes(query)));
  }, [search, sessions]);

  if (!token) return <main className="fs-login"><div className="fs-login-card"><img className="fs-brand-logo" src="/assets/fuchong-logo.webp" alt="福宠客服" /><h1>福宠客服工作台</h1><p>在飞书内处理网站访客的独立会话，在线接待与人工回复实时同步。</p>{error && <em>{error}</em>}<button onClick={login} disabled={loading}>{loading ? "正在连接…" : "使用飞书身份进入"}</button></div></main>;

  return <main className={`fs-desk ${active ? "has-active" : ""}`}>
    <aside className="fs-groups">
      <header><img className="fs-brand-logo" src="/assets/fuchong-logo.webp" alt="" /><div><b>客服中心</b><small>{agent?.name || "在线客服"}</small></div></header>
      <nav>{groups.map((group) => <button key={group.group_key} className={groupKey === group.group_key ? "active" : ""} onClick={() => { setGroupKey(group.group_key); setActive(null); }}><span><b>{group.label}</b><small>{group.description}</small></span>{group.waiting_count > 0 && <em>{group.waiting_count}</em>}</button>)}</nav>
      <footer><span className={online ? "" : "offline"} /><b>{online ? "实时连接中" : "正在重连"}</b></footer>
    </aside>
    <section className={`fs-sessions ${active ? "mobile-hidden" : ""}`}>
      <header><div><small>当前分组</small><h1>{groups.find((item) => item.group_key === groupKey)?.label || "客服会话"}</h1></div><b>{sessions.length} 条</b></header>
      <label className="fs-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索访客、会话编号或消息" /></label>
      <div className="fs-session-list">{visibleSessions.length ? visibleSessions.map((session) => <button key={session.id} className={active?.id === session.id ? "active" : ""} onClick={() => { setActive(session); loadMessages(session.id); }}><i>{(session.nickname || "访").slice(0, 1)}</i><span><strong>{session.nickname || "网站访客"}<small>{session.customer_code}</small></strong><p>{session.latest_message || "等待客户消息"}</p><em className={session.status}>{session.status === "human_pending" ? "等待经理" : session.status === "human" ? "经理接待中" : "在线接待"}</em></span>{session.unread_count > 0 && <b>{session.unread_count}</b>}</button>) : <div className="fs-empty">{search ? "没有匹配的会话" : "当前分组暂无会话"}</div>}</div>
    </section>
    <section className={`fs-chat ${active ? "mobile-visible" : ""}`}>
      {active ? <>
        <header><button className="fs-back" onClick={() => setActive(null)}>‹</button><i>{(active.nickname || "访").slice(0, 1)}</i><div><h2>{active.nickname || "网站访客"}</h2><p>{active.customer_code} · {active.service_type} · {active.status === "human" ? `由 ${active.assigned_to || "客服经理"} 接待` : active.status === "human_pending" ? "等待经理接续" : "在线接待中"}</p></div><span>{active.status !== "ai" ? <button onClick={() => action("close")}>切回在线客服</button> : <b className="fs-auto-badge">回复即接续</b>}</span></header>
        {active.handoff_reason && <div className="fs-risk"><b>需要关注</b><span>{active.handoff_reason}</span></div>}
        <div className="fs-messages" ref={chatRef}>{messages.map((message) => <article key={message.id} className={message.sender}><i>{message.sender === "user" ? "客" : message.sender === "agent" ? "我" : "福"}</i><div><small>{message.sender === "user" ? "网站客户" : message.sender === "agent" ? "人工客服" : "在线客服"}</small><p>{message.content}</p><time>{message.created_at?.slice(5, 16)}</time></div></article>)}</div>
        <div className="fs-composer">
          <div className="fs-quick-replies">{QUICK_REPLIES.map((item) => <button type="button" key={item} onClick={() => setReply(item)}>{item}</button>)}</div>
          <form onSubmit={send}><textarea value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={active.status === "human" ? "输入回复，发送后实时同步到网站…" : "直接输入回复，发送时自动由客服经理接续…"} rows={3} /><div><small>{lastSync ? `已同步 ${lastSync.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "正在连接网站会话"}<br />Enter 发送 · Shift+Enter 换行</small><button disabled={!reply.trim() || sending}>{sending ? "发送中…" : active.status === "human" ? "发送回复" : "接续并回复"}</button></div></form>
        </div>
      </> : <div className="fs-chat-empty"><i>聊</i><h2>选择一条客户会话</h2><p>网站与飞书工作台会自动同步消息和接管状态</p></div>}
    </section>
    {error && <button className="fs-toast" onClick={() => setError("")}>{error}　×</button>}
  </main>;
}
