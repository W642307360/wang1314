import webpush from "web-push";

const text = (value, max = 4000) => String(value ?? "").trim().slice(0, max);

export function createServicePush({ db, json, body }) {
  const publicKey = text(process.env.WEB_PUSH_PUBLIC_KEY, 512);
  const privateKey = text(process.env.WEB_PUSH_PRIVATE_KEY, 512);
  const subject = text(process.env.WEB_PUSH_SUBJECT || "mailto:service@petinmyall.me", 500);
  const pushEnabled = Boolean(publicKey && privateKey);
  let verifyAgent = () => null;
  if (pushEnabled) webpush.setVapidDetails(subject, publicKey, privateKey);

  const setAgentVerifier = (verifier) => { verifyAgent = verifier; };
  const unreadCount = () => Number(db.prepare(
    "SELECT COUNT(*) count FROM messages WHERE sender='user' AND is_read=0",
  ).get()?.count || 0);

  const notifyAgents = async (input = {}) => {
    if (!pushEnabled) return { delivered: 0, disabled: true };
    const subscriptions = db.prepare(
      "SELECT * FROM service_agent_push_subscriptions WHERE status='active'",
    ).all();
    const payload = JSON.stringify({
      title: text(input.title || "福宠客服有新咨询", 80),
      body: text(input.body || "有顾客发来了新消息", 180),
      url: text(input.url || `/service${input.sessionId ? `?session=${Number(input.sessionId)}` : ""}`, 500),
      session_id: Number(input.sessionId || 0) || null,
      badge: unreadCount(),
      tag: `fuchong-agent-${Number(input.sessionId || 0) || "queue"}`,
    });
    let delivered = 0;
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
        }, payload, { TTL: 60 * 60, urgency: "high", topic: "fuchong-agent" });
        delivered++;
        db.prepare(
          "UPDATE service_agent_push_subscriptions SET last_success_at=CURRENT_TIMESTAMP,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(subscription.id);
      } catch (error) {
        const status = Number(error?.statusCode || 0);
        if ([404, 410].includes(status))
          db.prepare("UPDATE service_agent_push_subscriptions SET status='expired',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .run(`expired:${status}`, subscription.id);
        else
          db.prepare("UPDATE service_agent_push_subscriptions SET last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .run(text(error?.message || error, 500), subscription.id);
      }
    }
    return { delivered, subscriptions: subscriptions.length };
  };

  const handle = async (req, res, path, method) => {
    if (!path.startsWith("/api/service-app/")) return false;
    if (path === "/api/service-app/config" && method === "GET") {
      json(res, 200, { ok: true, push_enabled: pushEnabled, vapid_public_key: publicKey || null });
      return true;
    }
    const agent = verifyAgent(req);
    if (!agent) {
      json(res, 401, { ok: false, message: "客服登录已过期，请重新登录" });
      return true;
    }
    if (path === "/api/service-app/push/subscribe" && method === "POST") {
      if (!pushEnabled) {
        json(res, 503, { ok: false, message: "消息推送尚未完成服务器配置" });
        return true;
      }
      const input = await body(req);
      const endpoint = text(input.endpoint, 2500);
      const p256dh = text(input.keys?.p256dh, 500);
      const authKey = text(input.keys?.auth, 500);
      if (!endpoint.startsWith("https://") || !p256dh || !authKey) {
        json(res, 400, { ok: false, message: "推送订阅数据不完整" });
        return true;
      }
      db.prepare(
        `INSERT INTO service_agent_push_subscriptions(agent_id,agent_name,endpoint,p256dh,auth_key,user_agent,status)
         VALUES(?,?,?,?,?,?,'active')
         ON CONFLICT(endpoint) DO UPDATE SET agent_id=excluded.agent_id,agent_name=excluded.agent_name,
           p256dh=excluded.p256dh,auth_key=excluded.auth_key,user_agent=excluded.user_agent,
           status='active',last_error=NULL,updated_at=CURRENT_TIMESTAMP`,
      ).run(agent.open_id, agent.name || "客服经理", endpoint, p256dh, authKey, text(req.headers["user-agent"], 500) || null);
      json(res, 201, { ok: true, subscribed: true });
      return true;
    }
    if (path === "/api/service-app/push/unsubscribe" && method === "POST") {
      const input = await body(req);
      const endpoint = text(input.endpoint, 2500);
      const changed = endpoint
        ? db.prepare("UPDATE service_agent_push_subscriptions SET status='revoked',updated_at=CURRENT_TIMESTAMP WHERE agent_id=? AND endpoint=?")
          .run(agent.open_id, endpoint).changes
        : db.prepare("UPDATE service_agent_push_subscriptions SET status='revoked',updated_at=CURRENT_TIMESTAMP WHERE agent_id=?")
          .run(agent.open_id).changes;
      json(res, 200, { ok: true, revoked: changed });
      return true;
    }
    if (path === "/api/service-app/push/test" && method === "POST") {
      const result = await notifyAgents({
        title: "福宠客服提醒已开启",
        body: "之后顾客发来新消息时，客服手机会收到提醒。",
        url: "/service",
      });
      json(res, 200, { ok: true, ...result });
      return true;
    }
    json(res, 404, { ok: false, message: "客服工作台接口不存在" });
    return true;
  };

  return { handle, setAgentVerifier, notifyAgents, pushEnabled, publicKey };
}
