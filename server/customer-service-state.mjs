const DEFAULT_AUTO_RESUME_SECONDS = 30;
const ONLINE_RESUME_MESSAGE = "专员暂未及时回复，在线客服已继续为您接待。";

const sqliteTimestamp = (value = Date.now()) =>
  new Date(value).toISOString().replace("T", " ").slice(0, 19);

export function createCustomerServiceState({ db, onAutoResume = async () => {} }) {
  const configuredSeconds = Number(process.env.CUSTOMER_SERVICE_AUTO_RESUME_SECONDS);
  const autoResumeSeconds = Number.isFinite(configuredSeconds)
    ? Math.max(1, Math.min(24 * 60 * 60, Math.floor(configuredSeconds)))
    : DEFAULT_AUTO_RESUME_SECONDS;
  let timer = null;
  let stopped = false;

  const deadline = () => sqliteTimestamp(Date.now() + autoResumeSeconds * 1000);

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const latestUnansweredCustomerMessage = (sessionId) =>
    db.prepare(
      `SELECT m.*
       FROM messages m
       WHERE m.session_id=? AND m.sender='user'
         AND m.id>COALESCE((
           SELECT MAX(answer.id) FROM messages answer
           WHERE answer.session_id=m.session_id AND answer.sender IN ('service','agent')
         ),0)
       ORDER BY m.id DESC LIMIT 1`,
    ).get(sessionId);

  const returnToOnline = (
    sessionId,
    {
      actor = "system",
      eventType = "human_ended",
      detail = {},
      systemMessage = "本次专员服务已结束，在线客服已恢复接待。",
      autoReply = false,
    } = {},
  ) => {
    const session = db.prepare("SELECT * FROM customer_service_sessions WHERE id=?").get(sessionId);
    if (!session || !["human_pending", "human"].includes(session.status))
      return { changed: false, session };
    const unanswered = autoReply ? latestUnansweredCustomerMessage(sessionId) : null;
    db.exec("BEGIN IMMEDIATE");
    try {
      const changed = db.prepare(
        `UPDATE customer_service_sessions
         SET status='ai',assigned_to=NULL,handoff_reason=NULL,
             auto_resume_at=NULL,human_last_activity_at=NULL,
             closed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
         WHERE id=? AND status IN ('human_pending','human')`,
      ).run(sessionId);
      if (!changed.changes) {
        db.exec("COMMIT");
        return { changed: false, session: db.prepare("SELECT * FROM customer_service_sessions WHERE id=?").get(sessionId) };
      }
      db.prepare(
        "INSERT INTO customer_service_events(session_id,event_type,actor,detail_json) VALUES(?,?,?,?)",
      ).run(sessionId, eventType, actor, JSON.stringify(detail));
      if (systemMessage)
        db.prepare(
          `INSERT INTO messages(
             user_id,sender,type,content,session_id,status,service_type,channel
           ) VALUES(?,'service','system',?,?,'sent',?,'system')`,
        ).run(session.user_id, systemMessage, sessionId, session.service_type);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    const updated = db.prepare("SELECT * FROM customer_service_sessions WHERE id=?").get(sessionId);
    if (unanswered)
      void onAutoResume({ session: updated, message: unanswered }).catch((error) =>
        console.error("客服自动恢复回复失败", error),
      );
    rearm();
    return { changed: true, session: updated };
  };

  const expireDue = () => {
    const legacyStale = db.prepare(
      `SELECT id FROM customer_service_sessions
       WHERE status IN ('human_pending','human')
         AND auto_resume_at IS NULL
         AND datetime(COALESCE(last_agent_message_at,updated_at,created_at))
             <=datetime('now','-24 hours')
       ORDER BY id`,
    ).all();
    for (const row of legacyStale)
      returnToOnline(row.id, {
        actor: "system",
        eventType: "legacy_handoff_auto_resumed",
        detail: { reason: "legacy_handoff_inactive_over_24h" },
        systemMessage: null,
        autoReply: false,
      });
    const due = db.prepare(
      `SELECT id FROM customer_service_sessions
       WHERE status IN ('human_pending','human')
         AND auto_resume_at IS NOT NULL
         AND datetime(auto_resume_at)<=datetime('now')
       ORDER BY auto_resume_at,id`,
    ).all();
    for (const row of due)
      returnToOnline(row.id, {
        actor: "system",
        eventType: "handoff_auto_resumed",
        detail: { reason: "no_human_reply_within_deadline", seconds: autoResumeSeconds },
        systemMessage: ONLINE_RESUME_MESSAGE,
        autoReply: true,
      });
    return legacyStale.length + due.length;
  };

  const rearm = () => {
    clearTimer();
    if (stopped) return;
    const next = db.prepare(
      `SELECT auto_resume_at FROM customer_service_sessions
       WHERE status IN ('human_pending','human') AND auto_resume_at IS NOT NULL
       ORDER BY datetime(auto_resume_at),id LIMIT 1`,
    ).get();
    if (!next?.auto_resume_at) return;
    const target = Date.parse(String(next.auto_resume_at).replace(" ", "T") + "Z");
    const wait = Math.max(0, Math.min(2_147_000_000, target - Date.now()));
    timer = setTimeout(() => {
      timer = null;
      try {
        expireDue();
      } finally {
        rearm();
      }
    }, wait);
    timer.unref?.();
  };

  const requestHandoff = (sessionId, reason, { actor = "customer", channel = "website" } = {}) => {
    const dueAt = deadline();
    const changed = db.prepare(
      `UPDATE customer_service_sessions
       SET status='human_pending',handoff_reason=?,assigned_to=NULL,
           human_last_activity_at=NULL,auto_resume_at=?,
           closed_at=NULL,updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
    ).run(String(reason || "").slice(0, 500), dueAt, sessionId);
    if (changed.changes)
      db.prepare(
        "INSERT INTO customer_service_events(session_id,event_type,actor,detail_json) VALUES(?,'handoff_requested',?,?)",
      ).run(sessionId, actor, JSON.stringify({ reason, channel, auto_resume_at: dueAt }));
    rearm();
    return db.prepare("SELECT * FROM customer_service_sessions WHERE id=?").get(sessionId);
  };

  const markHumanActive = (sessionId, assignedTo, { eventType = "", actor = "", detail = {} } = {}) => {
    const dueAt = deadline();
    const changed = db.prepare(
      `UPDATE customer_service_sessions
       SET status='human',assigned_to=?,human_last_activity_at=CURRENT_TIMESTAMP,
           last_agent_message_at=CURRENT_TIMESTAMP,auto_resume_at=?,
           closed_at=NULL,updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
    ).run(assignedTo || null, dueAt, sessionId);
    if (changed.changes && eventType)
      db.prepare(
        "INSERT INTO customer_service_events(session_id,event_type,actor,detail_json) VALUES(?,?,?,?)",
      ).run(sessionId, eventType, actor || assignedTo || "agent", JSON.stringify({ ...detail, auto_resume_at: dueAt }));
    rearm();
    return db.prepare("SELECT * FROM customer_service_sessions WHERE id=?").get(sessionId);
  };

  const ensureFresh = (sessionId) => {
    const session = db.prepare("SELECT * FROM customer_service_sessions WHERE id=?").get(sessionId);
    if (
      session &&
      ["human_pending", "human"].includes(session.status) &&
      (
        (
          session.auto_resume_at &&
          Date.parse(String(session.auto_resume_at).replace(" ", "T") + "Z") <= Date.now()
        ) ||
        (
          !session.auto_resume_at &&
          Date.parse(
            String(
              session.last_agent_message_at ||
              session.updated_at ||
              session.created_at,
            ).replace(" ", "T") + "Z",
          ) <= Date.now() - 24 * 60 * 60 * 1000
        )
      )
    ) {
      returnToOnline(session.id, {
        actor: "system",
        eventType: session.auto_resume_at
          ? "handoff_auto_resumed"
          : "legacy_handoff_auto_resumed",
        detail: session.auto_resume_at
          ? { reason: "lazy_deadline_check", seconds: autoResumeSeconds }
          : { reason: "legacy_handoff_inactive_over_24h" },
        systemMessage: session.auto_resume_at ? ONLINE_RESUME_MESSAGE : null,
        autoReply: Boolean(session.auto_resume_at),
      });
      return db.prepare("SELECT * FROM customer_service_sessions WHERE id=?").get(sessionId);
    }
    return session;
  };

  const primaryForUser = (userId) => {
    const session = db.prepare(
      "SELECT * FROM customer_service_sessions WHERE user_id=? ORDER BY updated_at DESC,id DESC LIMIT 1",
    ).get(userId);
    return session ? ensureFresh(session.id) : null;
  };

  expireDue();
  rearm();

  return {
    autoResumeSeconds,
    requestHandoff,
    markHumanActive,
    returnToOnline,
    ensureFresh,
    primaryForUser,
    rearm,
    stop() {
      stopped = true;
      clearTimer();
    },
  };
}
