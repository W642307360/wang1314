import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import "./FeishuServiceDesk.css";

type Group = { group_key: string; label: string; description: string; active_count: number; waiting_count: number };
type Session = { id: number; customer_code: string; nickname: string; phone?: string; status: "ai" | "human_pending" | "human"; service_type: string; latest_message: string; latest_message_at: string; unread_count: number; assigned_to?: string; handoff_reason?: string };
type Message = { id: number; sender: "user" | "service" | "agent"; type: string; content: string; created_at: string };

const TOKEN_KEY = "fuchong-feishu-agent-token";
const AGENT_KEY = "fuchong-feishu-agent";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const headers = useMemo(() => ({ Authorization: `Feishu ${token}`, "content-type": "application/json" }), [token]);

  useEffect(() => {
    const code = new URLSearchParams(location.search).get("code");
    if (token || !code) { setLoading(false); return; }
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
      const redirect = config.redirect_uri || `${location.origin}/feishu-service`;
      const authorize = new URL("https://accounts.feishu.cn/open-apis/authen/v1/authorize");
      authorize.searchParams.set("client_id", config.app_id);
      authorize.searchParams.set("redirect_uri", redirect);
      authorize.searchParams.set("state", crypto.randomUUID());
      authorize.searchParams.set("scope", "user_profile");
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
    } catch (cause) { setError(cause instanceof Error ? cause.message : "队列加载失败"); }
  }, [api, groupKey, token]);

  const loadMessages = useCallback(async (sessionId: number) => {
    try { setMessages(await api(`/api/feishu-service/sessions/${sessionId}/messages`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "消息加载失败"); }
  }, [api]);

  useEffect(() => { loadQueues(); const timer = window.setInterval(loadQueues, 2500); return () => clearInterval(timer); }, [loadQueues]);
  useEffect(() => { if (!active) return; loadMessages(active.id); const timer = window.setInterval(() => loadMessages(active.id), 1800); return () => clearInterval(timer); }, [active?.id, loadMessages]);
  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }); }, [messages.length]);

  const action = async (name: "takeover" | "close") => {
    if (!active) return;
    await api(`/api/feishu-service/sessions/${active.id}/${name}`, { method: "POST", body: "{}" });
    await Promise.all([loadQueues(), loadMessages(active.id)]);
  };
  const send = async (event: FormEvent) => {
    event.preventDefault(); const content = reply.trim(); if (!active || !content || sending) return;
    setSending(true); setReply("");
    try {
      await api(`/api/feishu-service/sessions/${active.id}/messages`, { method: "POST", body: JSON.stringify({ content }) });
      await Promise.all([loadMessages(active.id), loadQueues()]);
    } catch (cause) { setReply(content); setError(cause instanceof Error ? cause.message : "发送失败"); }
    finally { setSending(false); }
  };

  if (!token) return <main className="fs-login"><div className="fs-login-card"><i>福</i><h1>福宠客服工作台</h1><p>在飞书内处理网站访客的独立会话，AI 与人工回复实时同步。</p>{error && <em>{error}</em>}<button onClick={login} disabled={loading}>{loading ? "正在连接…" : "使用飞书身份进入"}</button></div></main>;

  return <main className="fs-desk">
    <aside className="fs-groups">
      <header><i>福</i><div><b>客服中心</b><small>{agent?.name || "在线客服"}</small></div></header>
      <nav>{groups.map((group) => <button key={group.group_key} className={groupKey === group.group_key ? "active" : ""} onClick={() => { setGroupKey(group.group_key); setActive(null); }}><span><b>{group.label}</b><small>{group.description}</small></span>{group.waiting_count > 0 && <em>{group.waiting_count}</em>}</button>)}</nav>
      <footer><span /><b>实时连接中</b></footer>
    </aside>
    <section className={`fs-sessions ${active ? "mobile-hidden" : ""}`}>
      <header><div><small>当前分组</small><h1>{groups.find((item) => item.group_key === groupKey)?.label || "客服会话"}</h1></div><b>{sessions.length} 条</b></header>
      <div className="fs-session-list">{sessions.length ? sessions.map((session) => <button key={session.id} className={active?.id === session.id ? "active" : ""} onClick={() => { setActive(session); loadMessages(session.id); }}><i>{(session.nickname || "访").slice(0, 1)}</i><span><strong>{session.nickname || "网站访客"}<small>{session.customer_code}</small></strong><p>{session.latest_message || "等待客户消息"}</p><em>{session.status === "human_pending" ? "待接管" : session.status === "human" ? "人工中" : "AI"}</em></span>{session.unread_count > 0 && <b>{session.unread_count}</b>}</button>) : <div className="fs-empty">当前分组暂无会话</div>}</div>
    </section>
    <section className={`fs-chat ${active ? "mobile-visible" : ""}`}>
      {active ? <>
        <header><button className="fs-back" onClick={() => setActive(null)}>‹</button><i>{(active.nickname || "访").slice(0, 1)}</i><div><h2>{active.nickname || "网站访客"}</h2><p>{active.customer_code} · {active.service_type} · {active.status === "human" ? `由 ${active.assigned_to || "人工客服"} 接待` : active.status === "human_pending" ? "等待人工接管" : "AI 接待中"}</p></div><span>{active.status === "human" ? <button onClick={() => action("close")}>结束人工</button> : <button className="primary" onClick={() => action("takeover")}>接管会话</button>}</span></header>
        {active.handoff_reason && <div className="fs-risk">转人工原因：{active.handoff_reason}</div>}
        <div className="fs-messages" ref={chatRef}>{messages.map((message) => <article key={message.id} className={message.sender}><i>{message.sender === "user" ? "客" : message.sender === "agent" ? "我" : "AI"}</i><div><small>{message.sender === "user" ? "网站客户" : message.sender === "agent" ? "人工客服" : "智能客服"}</small><p>{message.content}</p><time>{message.created_at?.slice(5, 16)}</time></div></article>)}</div>
        <form onSubmit={send}><textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder={active.status === "human" ? "输入回复，发送后实时同步到网站…" : "接管会话后即可回复…"} disabled={active.status !== "human"} rows={2} /><button disabled={active.status !== "human" || !reply.trim() || sending}>{sending ? "发送中" : "发送"}</button></form>
      </> : <div className="fs-chat-empty"><i>聊</i><h2>选择一条客户会话</h2><p>网站与飞书工作台会自动同步消息和接管状态</p></div>}
    </section>
    {error && <button className="fs-toast" onClick={() => setError("")}>{error}　×</button>}
  </main>;
}
