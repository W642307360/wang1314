import { createHmac, timingSafeEqual } from "node:crypto";

const GROUP_ORDER = ["purchase", "order", "after_sale", "pet_health", "logistics", "official"];
const GROUP_LABELS = new Map([
  ["购买咨询", "purchase"],
  ["订单咨询", "order"],
  ["售后服务", "after_sale"],
  ["宠物健康咨询", "pet_health"],
  ["物流帮助", "logistics"],
  ["官方客服", "official"],
]);

const asText = (value, fallback = "") => String(value ?? fallback).trim();
const safeJson = (value, fallback = {}) => {
  try { return JSON.parse(value); } catch { return fallback; }
};
const apiError = (res, json, status, error) => json(res, status, { error });

export function createFeishuService({
  db,
  json,
  body,
  adminAuth = () => null,
  customerServiceState,
}) {
  const apiBase = asText(process.env.FEISHU_SERVICE_API_BASE, "https://open.feishu.cn").replace(/\/$/, "");
  const appId = asText(process.env.FEISHU_SERVICE_APP_ID);
  const appSecret = asText(process.env.FEISHU_SERVICE_APP_SECRET);
  const verificationToken = asText(process.env.FEISHU_SERVICE_VERIFICATION_TOKEN);
  const agentSecret = asText(process.env.FEISHU_SERVICE_AGENT_TOKEN_SECRET);
  const appOrigin = asText(
    process.env.APP_ORIGIN || process.env.PUBLIC_API_BASE,
    "http://127.0.0.1:4173",
  ).replace(/\/$/, "");
  const redirectUri = `${appOrigin}/feishu-service`;
  let tenantToken = null;
  let tenantTokenExpiresAt = 0;

  const serviceApi = (path) => `${apiBase}${path}`;
  const getTenantToken = async () => {
    if (!appId || !appSecret) throw new Error("客服飞书应用尚未配置");
    if (tenantToken && tenantTokenExpiresAt > Date.now()) return tenantToken;
    const response = await fetch(serviceApi("/open-apis/auth/v3/tenant_access_token/internal"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const data = await response.json();
    if (!response.ok || data.code || !data.tenant_access_token)
      throw new Error(data.msg || "获取客服飞书访问令牌失败");
    tenantToken = data.tenant_access_token;
    tenantTokenExpiresAt = Date.now() + Math.max(60, Number(data.expire || 7200) - 120) * 1000;
    return tenantToken;
  };

  const sendText = async (chatId, content) => {
    if (!chatId) return null;
    const token = await getTenantToken();
    const response = await fetch(serviceApi("/open-apis/im/v1/messages?receive_id_type=chat_id"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: "text",
        content: JSON.stringify({ text: String(content).slice(0, 3800) }),
      }),
    });
    const data = await response.json();
    if (!response.ok || data.code) throw new Error(data.msg || "飞书客服消息发送失败");
    return data.data?.message_id || null;
  };

  const notify = async (sessionInput, message, reason = "") => {
    const session = typeof sessionInput === "number"
      ? db.prepare("SELECT * FROM customer_service_sessions WHERE id=?").get(sessionInput)
      : sessionInput;
    if (!session) return { delivered: false, reason: "session_not_found" };
    const group = db.prepare(
      "SELECT * FROM customer_service_groups WHERE group_key=? AND enabled=1",
    ).get(session.group_key || "official");
    const fallback = db.prepare(
      "SELECT * FROM customer_service_groups WHERE group_key='official' AND enabled=1",
    ).get();
    const chatId = group?.feishu_chat_id || fallback?.feishu_chat_id;
    if (!chatId) return { delivered: false, reason: "group_unbound" };
    const code = session.customer_code || `CS${String(session.id).padStart(6, "0")}`;
    const lines = [
      `【${group?.label || "官方客服"}｜${code}】`,
      reason ? `转接原因：${reason}` : "客户新消息：",
      String(message || "").slice(0, 1200),
      "",
      `接管：接管 #${code}`,
      `回复：#${code} 您要回复的内容`,
      `结束：结束 #${code}`,
    ];
    const messageId = await sendText(chatId, lines.join("\n"));
    if (messageId) db.prepare(
      "UPDATE customer_service_sessions SET feishu_root_message_id=COALESCE(feishu_root_message_id,?) WHERE id=?",
    ).run(messageId, session.id);
    return { delivered: Boolean(messageId), message_id: messageId };
  };

  const tokenSignature = (payload) =>
    createHmac("sha256", agentSecret).update(payload).digest("base64url");
  const createAgentToken = (profile) => {
    if (!agentSecret) throw new Error("客服工作台令牌密钥尚未配置");
    const payload = Buffer.from(JSON.stringify({
      open_id: profile.open_id,
      name: profile.name || profile.en_name || "飞书客服",
      exp: Date.now() + 12 * 60 * 60 * 1000,
    })).toString("base64url");
    return `${payload}.${tokenSignature(payload)}`;
  };
  const verifyAgent = (req) => {
    if (!agentSecret) return null;
    const token = asText(req.headers.authorization).replace(/^Feishu\s+/i, "");
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expected = Buffer.from(tokenSignature(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    try {
      const profile = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      return profile?.open_id && profile.exp > Date.now() ? profile : null;
    } catch { return null; }
  };

  const eventTokenValid = (payload) =>
    !verificationToken || asText(payload?.header?.token || payload?.token) === verificationToken;
  const messageText = (message) => {
    const parsed = safeJson(message?.content, {});
    return asText(parsed.text || parsed.content).replace(/<at[^>]*>.*?<\/at>/g, "").trim();
  };
  const expectedChatForSession = (session) => {
    const group = db.prepare(
      "SELECT feishu_chat_id FROM customer_service_groups WHERE group_key=? AND enabled=1",
    ).get(session.group_key || "official");
    const fallback = db.prepare(
      "SELECT feishu_chat_id FROM customer_service_groups WHERE group_key='official' AND enabled=1",
    ).get();
    return group?.feishu_chat_id || fallback?.feishu_chat_id || "";
  };

  const handleEvent = async (req, res) => {
    const payload = await body(req);
    if (!eventTokenValid(payload)) return apiError(res, json, 401, "invalid verification token");
    if (payload.type === "url_verification") return json(res, 200, { challenge: payload.challenge });
    if (payload?.header?.event_type && payload.header.event_type !== "im.message.receive_v1")
      return json(res, 200, { ok: true, ignored: "event_type" });
    const event = payload.event || {};
    const message = event.message || {};
    if (event.sender?.sender_type === "app") return json(res, 200, { ok: true, ignored: "app_sender" });
    const externalId = asText(message.message_id);
    if (!externalId || message.message_type !== "text")
      return json(res, 200, { ok: true, ignored: "unsupported_message" });
    const eventId = asText(payload?.header?.event_id, externalId);
    const receipt = db.prepare(
      "INSERT OR IGNORE INTO feishu_event_receipts(event_id,event_type,status) VALUES(?,?,'processing')",
    ).run(eventId, asText(payload?.header?.event_type, "im.message.receive_v1"));
    if (!receipt.changes) return json(res, 200, { ok: true, duplicate: true });

    try {
      const content = messageText(message);
      const chatId = asText(message.chat_id);
      const bind = content.match(/绑定\s*(购买咨询|订单咨询|售后服务|宠物健康咨询|物流帮助|官方客服)/);
      if (bind) {
        const groupKey = GROUP_LABELS.get(bind[1]);
        db.prepare(
          "UPDATE customer_service_groups SET feishu_chat_id=?,updated_at=CURRENT_TIMESTAMP WHERE group_key=?",
        ).run(chatId, groupKey);
        await sendText(chatId, `绑定成功：本群已负责「${bind[1]}」。之后该组的人工接管和客户消息会实时发送到这里。`);
        db.prepare(
          "UPDATE feishu_event_receipts SET status='done',processed_at=CURRENT_TIMESTAMP WHERE event_id=?",
        ).run(eventId);
        return json(res, 200, { ok: true, action: "bind" });
      }

      const codeMatch = content.match(/#?(CS\d{6,})/i);
      if (!codeMatch) {
        db.prepare("UPDATE feishu_event_receipts SET status='done',processed_at=CURRENT_TIMESTAMP WHERE event_id=?").run(eventId);
        return json(res, 200, { ok: true, ignored: "missing_session_code" });
      }
      const code = codeMatch[1].toUpperCase();
      const session = db.prepare("SELECT * FROM customer_service_sessions WHERE customer_code=?").get(code);
      if (!session) {
        await sendText(chatId, `没有找到会话 ${code}，请检查编号。`);
        db.prepare("UPDATE feishu_event_receipts SET status='done',processed_at=CURRENT_TIMESTAMP WHERE event_id=?").run(eventId);
        return json(res, 200, { ok: true, ignored: "unknown_session" });
      }
      const expectedChat = expectedChatForSession(session);
      if (expectedChat && chatId !== expectedChat) {
        db.prepare("UPDATE feishu_event_receipts SET status='done',processed_at=CURRENT_TIMESTAMP WHERE event_id=?").run(eventId);
        return json(res, 200, { ok: true, ignored: "wrong_service_group" });
      }
      const actor = asText(event.sender?.sender_id?.open_id, "飞书客服");
      db.exec("BEGIN IMMEDIATE");
      try {
        if (/结束/.test(content)) {
          db.prepare(
            `UPDATE customer_service_sessions
             SET status='ai',assigned_to=NULL,handoff_reason=NULL,
                 auto_resume_at=NULL,human_last_activity_at=NULL,
                 closed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
             WHERE id=?`,
          ).run(session.id);
          db.prepare("INSERT INTO customer_service_events(session_id,event_type,actor,detail_json) VALUES(?,'human_ended',?,?)").run(session.id, actor, JSON.stringify({ externalId, chatId, channel: "feishu_bot" }));
          db.prepare("INSERT INTO messages(user_id,sender,type,content,session_id,status,service_type,channel,external_message_id) VALUES(?,'service','system','本次专员服务已结束，在线客服已恢复接待。',?,'sent',?,'feishu',?)").run(session.user_id, session.id, session.service_type, externalId);
        } else if (/接管/.test(content)) {
          customerServiceState.markHumanActive(session.id, actor);
          db.prepare("INSERT INTO customer_service_events(session_id,event_type,actor,detail_json) VALUES(?,'human_joined',?,?)").run(session.id, actor, JSON.stringify({ externalId, chatId, channel: "feishu_bot" }));
          db.prepare("INSERT INTO messages(user_id,sender,type,content,session_id,status,service_type,channel,external_message_id) VALUES(?,'service','system','福宠用户宠物专员已接入，请继续描述您的问题。',?,'sent',?,'feishu',?)").run(session.user_id, session.id, session.service_type, externalId);
        } else {
          const reply = content.replace(/#?CS\d{6,}/i, "").trim();
          if (reply) {
            db.prepare("INSERT INTO messages(user_id,sender,type,content,session_id,status,service_type,channel,external_message_id,metadata_json) VALUES(?,'agent','service',?,?,'sent',?,'feishu',?,?)").run(session.user_id, reply, session.id, session.service_type, externalId, JSON.stringify({ agent_open_id: actor }));
            customerServiceState.markHumanActive(session.id, actor);
          }
        }
        db.prepare("UPDATE feishu_event_receipts SET status='done',processed_at=CURRENT_TIMESTAMP WHERE event_id=?").run(eventId);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      customerServiceState.rearm();
      const action = /结束/.test(content) ? "end" : /接管/.test(content) ? "takeover" : "reply";
      return json(res, 200, { ok: true, action });
    } catch (error) {
      db.prepare("UPDATE feishu_event_receipts SET status='failed',error=?,processed_at=CURRENT_TIMESTAMP WHERE event_id=?")
        .run(String(error?.message || error).slice(0, 1000), eventId);
      throw error;
    }
  };

  const handleDesk = async (req, res, url, path, method) => {
    if (path === "/api/feishu-service/config" && method === "GET") {
      json(res, 200, { app_id: appId, redirect_uri: redirectUri });
      return true;
    }
    if (path === "/api/feishu-service/auth" && method === "POST") {
      const input = await body(req);
      if (!appId || !appSecret || !agentSecret)
        return apiError(res, json, 503, "客服飞书应用尚未完成服务器配置"), true;
      if (!asText(input.code) || asText(input.redirect_uri) !== redirectUri)
        return apiError(res, json, 400, "登录参数无效"), true;
      const tokenResponse = await fetch(serviceApi("/open-apis/authen/v2/oauth/token"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: appId,
          client_secret: appSecret,
          code: asText(input.code),
          redirect_uri: redirectUri,
        }),
      });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || tokenData.code || !tokenData.access_token)
        return apiError(res, json, 401, tokenData.msg || "飞书免登失败"), true;
      const profileResponse = await fetch(serviceApi("/open-apis/authen/v1/user_info"), {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profileData = await profileResponse.json();
      const profile = profileData.data || profileData;
      if (!profileResponse.ok || profileData.code || !profile.open_id)
        return apiError(res, json, 401, profileData.msg || "无法获取客服身份"), true;
      json(res, 200, {
        token: createAgentToken(profile),
        agent: {
          open_id: profile.open_id,
          name: profile.name || profile.en_name || "飞书客服",
          avatar_url: profile.avatar_url || "",
        },
      });
      return true;
    }
    if (path === "/api/feishu-service/admin-auth" && method === "POST") {
      const admin = adminAuth(req);
      const account = admin?.role === "admin"
        ? db.prepare("SELECT id,username,role FROM admins WHERE id=?").get(Number(admin.sub))
        : null;
      if (!account) return apiError(res, json, 401, "请使用管理员账号登录"), true;
      const profile = { open_id: `admin:${account.id}`, name: account.username || "客服经理" };
      return json(res, 200, { token: createAgentToken(profile), agent: profile }), true;
    }
    if (!path.startsWith("/api/feishu-service/")) return false;
    const agent = verifyAgent(req);
    if (!agent) return apiError(res, json, 401, "请在飞书工作台重新打开客服应用"), true;

    if (path === "/api/feishu-service/groups" && method === "GET") {
      const result = db.prepare(`SELECT g.*,
        (SELECT COUNT(*) FROM customer_service_sessions s WHERE s.group_key=g.group_key AND s.status IN ('human_pending','human') AND s.id=(SELECT s2.id FROM customer_service_sessions s2 WHERE s2.user_id=s.user_id ORDER BY s2.updated_at DESC,s2.id DESC LIMIT 1)) active_count,
        (SELECT COUNT(*) FROM customer_service_sessions s WHERE s.group_key=g.group_key AND s.status='human_pending' AND s.id=(SELECT s2.id FROM customer_service_sessions s2 WHERE s2.user_id=s.user_id ORDER BY s2.updated_at DESC,s2.id DESC LIMIT 1)) waiting_count,
        (SELECT COUNT(*) FROM messages m JOIN customer_service_sessions s ON s.id=m.session_id
          WHERE s.group_key=g.group_key AND m.sender='user' AND m.is_read=0
            AND s.id=(SELECT s2.id FROM customer_service_sessions s2 WHERE s2.user_id=s.user_id ORDER BY s2.updated_at DESC,s2.id DESC LIMIT 1)) unread_count
        FROM customer_service_groups g WHERE g.enabled=1`).all()
        .sort((a, b) => GROUP_ORDER.indexOf(a.group_key) - GROUP_ORDER.indexOf(b.group_key));
      json(res, 200, result);
      return true;
    }
    if (path === "/api/feishu-service/groups/bootstrap" && method === "POST") {
      const groups = db.prepare(
        "SELECT * FROM customer_service_groups WHERE enabled=1",
      ).all().sort((a, b) => GROUP_ORDER.indexOf(a.group_key) - GROUP_ORDER.indexOf(b.group_key));
      const token = await getTenantToken();
      const created = [];
      for (const group of groups.filter((item) => !item.feishu_chat_id)) {
        const uuid = `fuchong-service-${group.group_key}-v1`;
        const response = await fetch(serviceApi(
          `/open-apis/im/v1/chats?user_id_type=open_id&set_bot_manager=true&uuid=${encodeURIComponent(uuid)}`,
        ), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({
            name: `福宠客服｜${group.label}`,
            description: group.description || `福宠 ${group.label} 人工客服群`,
            owner_id: agent.open_id,
            user_id_list: [agent.open_id],
          }),
        });
        const data = await response.json();
        const chatId = asText(data.data?.chat_id);
        if (!response.ok || data.code || !chatId)
          throw new Error(data.msg || `创建${group.label}飞书群失败`);
        db.prepare(
          "UPDATE customer_service_groups SET feishu_chat_id=?,updated_at=CURRENT_TIMESTAMP WHERE group_key=? AND (feishu_chat_id IS NULL OR feishu_chat_id='')",
        ).run(chatId, group.group_key);
        created.push({ group_key: group.group_key, label: group.label, chat_id: chatId });
        await sendText(chatId, `本群已绑定【${group.label}】。AI 无法确认或遇到高风险问题时会自动转接到这里；回复格式：#会话编号 回复内容。`);
      }
      json(res, 200, { ok: true, created });
      return true;
    }
    if (path === "/api/feishu-service/sessions" && method === "GET") {
      const groupKey = asText(url.searchParams.get("group_key"));
      const status = asText(url.searchParams.get("status"));
      const sessionId = Number(url.searchParams.get("session_id") || 0);
      const where = ["1=1"], values = [];
      if (groupKey) { where.push("s.group_key=?"); values.push(groupKey); }
      if (status) { where.push("s.status=?"); values.push(status); }
      if (sessionId) { where.push("s.id=?"); values.push(sessionId); }
      if (!sessionId) where.push("s.id=(SELECT s2.id FROM customer_service_sessions s2 WHERE s2.user_id=s.user_id ORDER BY s2.updated_at DESC,s2.id DESC LIMIT 1)");
      const sessions = db.prepare(`SELECT s.*,u.nickname,u.phone,
        (SELECT content FROM messages m WHERE m.session_id=s.id ORDER BY m.id DESC LIMIT 1) latest_message,
        (SELECT created_at FROM messages m WHERE m.session_id=s.id ORDER BY m.id DESC LIMIT 1) latest_message_at,
        (SELECT COUNT(*) FROM messages m WHERE m.session_id=s.id AND m.sender='user' AND m.is_read=0) unread_count
        FROM customer_service_sessions s JOIN users u ON u.id=s.user_id
        WHERE ${where.join(" AND ")}
        ORDER BY CASE s.status WHEN 'human_pending' THEN 0 WHEN 'human' THEN 1 ELSE 2 END,s.updated_at DESC LIMIT 300`).all(...values);
      json(res, 200, sessions);
      return true;
    }
    const messagesMatch = path.match(/^\/api\/feishu-service\/sessions\/(\d+)\/messages$/);
    if (messagesMatch && method === "GET") {
      const sessionId = Number(messagesMatch[1]);
      if (!db.prepare("SELECT id FROM customer_service_sessions WHERE id=?").get(sessionId))
        return apiError(res, json, 404, "会话不存在"), true;
      db.prepare("UPDATE messages SET is_read=1 WHERE session_id=? AND sender='user'").run(sessionId);
      json(res, 200, db.prepare("SELECT * FROM messages WHERE session_id=? ORDER BY id").all(sessionId));
      return true;
    }
    if (messagesMatch && method === "POST") {
      const sessionId = Number(messagesMatch[1]);
      const input = await body(req);
      const session = db.prepare("SELECT * FROM customer_service_sessions WHERE id=?").get(sessionId);
      if (!session) return apiError(res, json, 404, "会话不存在"), true;
      const content = asText(input.content).slice(0, 4000);
      if (!content) return apiError(res, json, 400, "回复不能为空"), true;
      const autoTakeover = session.status !== "human";
      let created;
      db.exec("BEGIN IMMEDIATE");
      try {
        if (autoTakeover) {
          customerServiceState.markHumanActive(session.id, agent.name);
          db.prepare("INSERT INTO messages(user_id,sender,type,content,session_id,status,service_type,channel) VALUES(?,'service','system','福宠用户宠物专员已接入，请继续描述您的问题。',?,'sent',?,'feishu_web')")
            .run(session.user_id, session.id, session.service_type);
          db.prepare("INSERT INTO customer_service_events(session_id,event_type,actor,detail_json) VALUES(?,'human_joined',?,?)")
            .run(session.id, agent.name, JSON.stringify({ channel: "feishu_web", open_id: agent.open_id, automatic: true }));
        }
        created = db.prepare("INSERT INTO messages(user_id,sender,type,content,session_id,status,service_type,channel,metadata_json) VALUES(?,'agent','service',?,?,'sent',?,'feishu_web',?)")
          .run(session.user_id, content, session.id, session.service_type, JSON.stringify({ agent_open_id: agent.open_id, agent_name: agent.name }));
        customerServiceState.markHumanActive(session.id, agent.name);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      json(res, 201, {
        ...db.prepare("SELECT * FROM messages WHERE id=?").get(created.lastInsertRowid),
        auto_takeover: autoTakeover,
        session_status: "human",
      });
      return true;
    }
    const actionMatch = path.match(/^\/api\/feishu-service\/sessions\/(\d+)\/(takeover|close)$/);
    if (actionMatch && method === "POST") {
      const session = db.prepare("SELECT * FROM customer_service_sessions WHERE id=?").get(Number(actionMatch[1]));
      if (!session) return apiError(res, json, 404, "会话不存在"), true;
      const action = actionMatch[2];
      if (action === "takeover" && session.status !== "human") {
        db.exec("BEGIN IMMEDIATE");
        try {
          customerServiceState.markHumanActive(session.id, agent.name);
          db.prepare("INSERT INTO messages(user_id,sender,type,content,session_id,status,service_type,channel) VALUES(?,'service','system','福宠用户宠物专员已接入，请继续描述您的问题。',?,'sent',?,'feishu_web')").run(session.user_id, session.id, session.service_type);
          db.prepare("INSERT INTO customer_service_events(session_id,event_type,actor,detail_json) VALUES(?,'human_joined',?,?)").run(session.id, agent.name, JSON.stringify({ channel: "feishu_web", open_id: agent.open_id }));
          db.exec("COMMIT");
        } catch (error) { db.exec("ROLLBACK"); throw error; }
      } else if (action === "close" && session.status !== "ai") {
        customerServiceState.returnToOnline(session.id, {
          actor: agent.name,
          eventType: "human_ended",
          detail: { channel: "feishu_web", open_id: agent.open_id },
        });
      }
      json(res, 200, { ok: true, status: action === "takeover" ? "human" : "ai" });
      return true;
    }
    apiError(res, json, 404, "接口不存在");
    return true;
  };

  return {
    notify,
    verifyAgent,
    handle: async (req, res, url, path, method) => {
      if (path === "/api/integrations/feishu/events" && method === "POST") {
        await handleEvent(req, res);
        return true;
      }
      return handleDesk(req, res, url, path, method);
    },
  };
}
