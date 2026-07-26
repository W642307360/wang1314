import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { customerServiceCorpusStatus, matchCustomerServiceCorpus } from "./customer-service-corpus.mjs";

const serverDir = dirname(fileURLToPath(import.meta.url));
const tempDir = mkdtempSync(join(tmpdir(), "fuchong-service-test-"));
const port = 31993;
const mockPort = 31994;
const base = `http://127.0.0.1:${port}`;
const serviceSecret = "service-app-test-secret";
const verificationToken = "service-verification-test-token";
const agentSecret = "service-agent-token-test-secret";
const sentToFeishu = [];

const mockFeishu = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const input = raw ? JSON.parse(raw) : {};
  const respond = (data) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(data));
  };
  if (req.url === "/open-apis/auth/v3/tenant_access_token/internal") {
    assert.equal(input.app_id, "cli_service_test");
    assert.equal(input.app_secret, serviceSecret);
    return respond({ code: 0, tenant_access_token: "tenant-test-token", expire: 7200 });
  }
  if (req.url?.startsWith("/open-apis/im/v1/messages")) {
    sentToFeishu.push(input);
    return respond({ code: 0, data: { message_id: `om_mock_${sentToFeishu.length}` } });
  }
  if (req.url === "/open-apis/authen/v2/oauth/token") {
    assert.equal(input.client_id, "cli_service_test");
    assert.equal(input.client_secret, serviceSecret);
    assert.equal(input.redirect_uri, `${base}/feishu-service`);
    return respond({ code: 0, access_token: "user-test-token" });
  }
  if (req.url === "/open-apis/authen/v1/user_info") {
    assert.equal(req.headers.authorization, "Bearer user-test-token");
    return respond({ code: 0, data: { open_id: "ou_agent_test", name: "测试客服" } });
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ code: 404, msg: "mock endpoint not found" }));
});
mockFeishu.listen(mockPort, "127.0.0.1");

let stderr = "";
const child = spawn(process.execPath, [join(serverDir, "index.mjs")], {
  cwd: dirname(serverDir),
  env: {
    ...process.env,
    PORT: String(port),
    FUCHONG_TEST_DB_PATH: "",
    DB_PATH: join(tempDir, "test.db"),
    ADMIN_INITIAL_PASSWORD: "123456789",
    ADMIN_TOKEN_SECRET: "admin-test-secret",
    APP_ORIGIN: base,
    PUBLIC_API_BASE: base,
    FEISHU_SERVICE_APP_ID: "cli_service_test",
    FEISHU_SERVICE_APP_SECRET: serviceSecret,
    FEISHU_SERVICE_VERIFICATION_TOKEN: verificationToken,
    FEISHU_SERVICE_AGENT_TOKEN_SECRET: agentSecret,
    FEISHU_SERVICE_API_BASE: `http://127.0.0.1:${mockPort}`,
    CUSTOMER_SERVICE_REPLY_DELAY_MS: "0",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stderr.on("data", (chunk) => { stderr += chunk; });

const waitForHealth = async () => {
  for (let index = 0; index < 80; index += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`客服测试 API 未能启动：${stderr}`);
};
const request = async (path, options = {}) => {
  const response = await fetch(`${base}${path}`, options);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
};
const jsonRequest = (path, data, headers = {}) => request(path, {
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(data),
});
let eventSequence = 0;
const feishuEvent = (content, chatId = "oc_purchase_group", messageId) => {
  eventSequence += 1;
  const externalId = messageId || `om_event_${eventSequence}`;
  return jsonRequest("/api/integrations/feishu/events", {
    schema: "2.0",
    header: {
      event_id: `evt_${externalId}`,
      event_type: "im.message.receive_v1",
      token: verificationToken,
    },
    event: {
      sender: { sender_type: "user", sender_id: { open_id: "ou_agent_test" } },
      message: {
        message_id: externalId,
        message_type: "text",
        chat_id: chatId,
        content: JSON.stringify({ text: content }),
      },
    },
  });
};

test("新网站客服、飞书机器人和人工工作台双向链路", async (t) => {
  await waitForHealth();
  t.after(async () => {
    child.kill();
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    await new Promise((resolve) => mockFeishu.close(resolve));
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const visitorA = await jsonRequest("/api/visitors/session", { token: "visitor-a" });
  const visitorB = await jsonRequest("/api/visitors/session", { token: "visitor-b" });
  assert.equal(visitorA.response.status, 200);
  assert.notEqual(visitorA.payload.userId, visitorB.payload.userId);

  const adminLogin = await jsonRequest("/api/admin/login", { username: "admin", password: "123456789" });
  assert.equal(adminLogin.response.status, 200);
  const agentLogin = await jsonRequest("/api/feishu-service/admin-auth", {}, {
    Authorization: `Bearer ${adminLogin.payload.token}`,
  });
  assert.equal(agentLogin.response.status, 200);
  assert.ok(agentLogin.payload.token);
  assert.equal(agentLogin.payload.agent.name, "admin");
  const agentAuthorization = { Authorization: `Feishu ${agentLogin.payload.token}` };
  const serviceGroups = await request("/api/feishu-service/groups", { headers: agentAuthorization });
  assert.equal(serviceGroups.response.status, 200);
  assert.equal(serviceGroups.payload.length, 6);
  assert.ok(serviceGroups.payload.every((group) => Number.isInteger(group.unread_count)));
  assert.equal((await request("/api/service-app/push/subscribe")).response.status, 401);
  const pushUnavailable = await jsonRequest("/api/service-app/push/subscribe", {
    endpoint: "https://push.example.test/subscription",
    keys: { p256dh: "test-p256dh", auth: "test-auth" },
  }, agentAuthorization);
  assert.equal(pushUnavailable.response.status, 503);

  const corpusDb = new DatabaseSync(join(tempDir, "test.db"), { readOnly: true });
  const corpusCounts = Object.fromEntries(corpusDb.prepare(
    "SELECT group_key,count(*) AS total FROM customer_service_knowledge WHERE enabled=1 GROUP BY group_key",
  ).all().map((row) => [row.group_key, Number(row.total)]));
  corpusDb.close();
  assert.deepEqual(corpusCounts, {
    after_sale: 103,
    logistics: 103,
    official: 103,
    order: 103,
    pet_health: 103,
    purchase: 303,
  }, "纯话术扩展不能写入或改变原 818 条数据库知识");
  const corpusStatus = customerServiceCorpusStatus();
  assert.equal(corpusStatus.loaded, true);
  assert.equal(corpusStatus.entry_count, 4998);
  assert.equal(corpusStatus.intent_count, 478);
  assert.equal(corpusStatus.source_sha256, "7b6167c6265b6afef4af8db55176d36d4dd8158eaeb87d348b375dbc9727599d");
  assert.equal(corpusStatus.sources.length, 2);
  assert.equal(corpusStatus.sources[1].sha256, "aede9a3752596174abff8c36de813b08c7823a6f7221d546390e7ad36ea2299a");
  assert.equal(matchCustomerServiceCorpus("这只现在还在吗", { groupKey: "purchase" }).reply, "还在的 可以放心看");
  assert.equal(matchCustomerServiceCorpus("付款后什么时候安排发出", { groupKey: "logistics" }).group, "logistics");
  assert.equal(matchCustomerServiceCorpus("完全无关的量子物理问题", { groupKey: "official" }).matched, false);
  const paraphraseCases = [
    ["大概几天到", "到货时效"],
    ["这只宠物大概几天到", "到货时效"],
    ["请问一下这只小狗大约什么时候能送到我这里", "到货时效"],
    ["我想问这只宠物发货以后多久可以收到", "到货时效"],
    ["到北京大概要几天", "到货时效"],
    ["麻烦问下这个宠物目前还有没有", "在售确认"],
    ["请问这只小狗现在是不是还有呀", "在售确认"],
    ["想问一下这个猫猫到手总共要多少钱", "价格咨询"],
    ["这个宠物的疫苗现在打了多少针", "疫苗进度"],
    ["请问一下它平时的脾气怎么样", "温顺程度"],
  ];
  for (const [question, expectedIntent] of paraphraseCases) {
    const result = matchCustomerServiceCorpus(question, { groupKey: "purchase" });
    assert.equal(result.matched, true, `口语变体应命中：${question}`);
    assert.equal(result.intent, expectedIntent, `口语变体不能答错意图：${question}`);
  }
  const supplementalCases = [
    ["想问下这只宠物的毛是不是很蓬松呀", "purchase", "毛发蓬松咨询"],
    ["你们这个公司到底正不正规", "official", "公司靠谱吗"],
    ["宠物到家以后突然没有精神怎么办", "pet_health", "突然没精神"],
    ["普通客服解决不了的话还能找谁处理", "after_sale", "售后升级"],
    ["这只宠物是不是不太爱叫", "purchase", "不爱叫"],
  ];
  for (const [question, groupKey, expectedIntent] of supplementalCases) {
    const result = matchCustomerServiceCorpus(question, { groupKey });
    assert.equal(result.matched, true, `新增话术口语变体应命中：${question}`);
    assert.equal(result.intent, expectedIntent, `新增话术不能串意图：${question}`);
  }
  const maintainedCorpus = JSON.parse(readFileSync(join(serverDir, "customer-service-corpus.json"), "utf8"));
  const representativeIntents = [...new Map(maintainedCorpus.entries.map((entry) => [`${entry.group}:${entry.intent}`, entry])).values()];
  assert.equal(representativeIntents.length, 478);
  for (const entry of representativeIntents) {
    const conversational = `您好，我想咨询一下，${entry.question}，能帮我确认一下吗`;
    const result = matchCustomerServiceCorpus(conversational, { groupKey: entry.group });
    assert.equal(result.matched, true, `236 类意图的口语扩写都应命中：${entry.intent}`);
    assert.equal(result.intent, entry.intent, `口语扩写不能串意图：${entry.intent}`);
  }

  const purchase = await jsonRequest("/api/messages", {
    user_id: visitorA.payload.userId,
    sender: "agent",
    content: "我想买适合幼犬的产品，预算三千元",
    service_type: "购买咨询",
  });
  const order = await jsonRequest("/api/messages", {
    user_id: visitorB.payload.userId,
    content: "我的订单什么时候发货",
    service_type: "订单咨询",
  });
  assert.equal(purchase.response.status, 201);
  assert.equal(purchase.payload.group_key, "purchase");
  assert.equal(order.payload.group_key, "order");
  assert.notEqual(purchase.payload.session_id, order.payload.session_id);

  const sameUserWithoutSessionId = await jsonRequest("/api/messages", {
    user_id: visitorA.payload.userId,
    content: "这只现在还有吗",
    service_type: "购买咨询",
  });
  assert.equal(sameUserWithoutSessionId.payload.session_id, purchase.payload.session_id, "同一用户不传会话号时必须复用唯一主会话");
  const primarySession = await request(`/api/customer-service/session?user_id=${visitorA.payload.userId}`);
  assert.equal(primarySession.payload.id, purchase.payload.session_id);

  const productCard = await jsonRequest("/api/messages", {
    user_id: visitorA.payload.userId,
    session_id: purchase.payload.session_id,
    type: "product_card",
    content: "【福宠商品资料】\n商品：测试宠物\n价格：¥2999",
    service_type: "购买咨询",
  });
  assert.equal(productCard.payload.reply, "在的");
  assert.equal(productCard.payload.status, "ai");

  const availability = await jsonRequest("/api/messages", {
    user_id: visitorA.payload.userId,
    session_id: purchase.payload.session_id,
    content: "这只现在还在吗",
    service_type: "购买咨询",
  });
  assert.equal(availability.payload.reply, "还在的 可以放心看");
  const fuzzyPrice = await jsonRequest("/api/messages", {
    user_id: visitorA.payload.userId,
    session_id: purchase.payload.session_id,
    content: "这只到手一共多少钱",
    service_type: "购买咨询",
  });
  assert.equal(fuzzyPrice.payload.reply, "价格页面有显示");

  const askFreshVisitor = async (tokenSuffix, content, serviceType) => {
    const visitor = await jsonRequest("/api/visitors/session", { token: `intent-${tokenSuffix}` });
    return jsonRequest("/api/messages", {
      user_id: visitor.payload.userId,
      content,
      service_type: serviceType,
    });
  };
  const vaccineIntent = await askFreshVisitor("vaccine", "它目前打了几针疫苗", "宠物健康咨询");
  assert.equal(vaccineIntent.payload.reply, "疫苗都打齐了");
  const pedigreeIntent = await askFreshVisitor("pedigree", "能确定是纯种的吗", "购买咨询");
  assert.equal(pedigreeIntent.payload.reply, "会如实说明品种和血统情况");
  const deliveryIntent = await askFreshVisitor("delivery", "付款后什么时候安排发出", "物流帮助");
  assert.equal(deliveryIntent.payload.reply, "确认健康和线路后安排发出");

  const visitorC = await jsonRequest("/api/visitors/session", { token: "visitor-c" });
  const unknownFirst = await jsonRequest("/api/messages", {
    user_id: visitorC.payload.userId,
    content: "关于编号 ZX-17 的特殊规则是什么",
    service_type: "官方客服",
  });
  const unknownSecond = await jsonRequest("/api/messages", {
    user_id: visitorC.payload.userId,
    session_id: unknownFirst.payload.session_id,
    content: "这个情况具体应该如何办理",
    service_type: "官方客服",
  });
  assert.equal(unknownSecond.payload.status, "ai", "连续无法确认时仍应保持自动在线接待");
  assert.ok(unknownSecond.payload.reply, "无法准确匹配时应自然澄清，不能自动转专员");

  const sensitiveQuestion = await jsonRequest("/api/messages", {
    user_id: visitorC.payload.userId,
    session_id: unknownFirst.payload.session_id,
    content: "我要退款投诉，宠物有点不舒服",
    service_type: "售后服务",
  });
  assert.equal(sensitiveQuestion.payload.status, "ai", "退款、投诉和健康问题不能自动转专员");

  const staleVisitor = await jsonRequest("/api/visitors/session", { token: "stale-specialist-visitor" });
  const ensuredSession = await jsonRequest("/api/customer-service/session", {
    user_id: staleVisitor.payload.userId,
    service_type: "官方客服",
  });
  assert.ok(ensuredSession.payload.id);
  const staleHandoff = await jsonRequest(`/api/customer-service/sessions/${ensuredSession.payload.id}/handoff`, {
    user_id: staleVisitor.payload.userId,
    reason: "测试过期专员队列",
  });
  assert.equal(staleHandoff.payload.status, "human_pending");
  assert.ok(staleHandoff.payload.auto_resume_at, "主动转接后必须返回自动恢复期限");
  const waitingQuestion = await jsonRequest("/api/messages", {
    user_id: staleVisitor.payload.userId,
    session_id: ensuredSession.payload.id,
    content: "这只宠物大概几天能到我这里",
    service_type: "物流帮助",
  });
  assert.equal(waitingQuestion.payload.status, "human_pending");
  assert.equal(waitingQuestion.payload.reply, null, "等待专员期间不能抢先自动回复");
  const staleDb = new DatabaseSync(join(tempDir, "test.db"));
  staleDb.prepare("UPDATE customer_service_sessions SET auto_resume_at=datetime('now','-1 second') WHERE id=?").run(ensuredSession.payload.id);
  staleDb.close();
  const recoveredSession = await request(`/api/customer-service/session?user_id=${staleVisitor.payload.userId}`);
  assert.equal(recoveredSession.payload.status, "ai", "超过30秒没有专员活动的队列应恢复在线接待");
  let recoveredMessages = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const result = await request(
      `/api/messages?user_id=${staleVisitor.payload.userId}&session_id=${ensuredSession.payload.id}`,
    );
    recoveredMessages = result.payload;
    if (
      recoveredMessages.some(
        (message) =>
          message.sender === "service" &&
          message.type !== "system" &&
          message.id > waitingQuestion.payload.id,
      )
    )
      break;
  }
  assert.ok(
    recoveredMessages.some(
      (message) =>
        message.sender === "service" &&
        message.type !== "system" &&
        message.id > waitingQuestion.payload.id,
    ),
    "自动恢复后必须继续回答等待中的最后一条用户消息",
  );
  const legacyDb = new DatabaseSync(join(tempDir, "test.db"));
  legacyDb.prepare(
    `UPDATE customer_service_sessions
     SET status='human',auto_resume_at=NULL,human_last_activity_at=NULL,
         last_agent_message_at=datetime('now','-25 hours'),
         updated_at=datetime('now','-25 hours')
     WHERE id=?`,
  ).run(ensuredSession.payload.id);
  legacyDb.close();
  const recoveredLegacySession = await request(
    `/api/customer-service/session?user_id=${staleVisitor.payload.userId}`,
  );
  assert.equal(
    recoveredLegacySession.payload.status,
    "ai",
    "升级前遗留且超过24小时无人工活动的会话应兼容恢复在线接待",
  );

  const ownMessages = await request(`/api/messages?user_id=${visitorA.payload.userId}&session_id=${purchase.payload.session_id}`);
  assert.equal(ownMessages.payload[0].sender, "user", "网站公开接口不能伪造人工客服身份");
  const crossUser = await request(`/api/messages?user_id=${visitorB.payload.userId}&session_id=${purchase.payload.session_id}`);
  assert.deepEqual(crossUser.payload, [], "不同用户不能读取彼此会话消息");
  const crossStatus = await request(`/api/customer-service/sessions/${purchase.payload.session_id}?user_id=${visitorB.payload.userId}`);
  assert.equal(crossStatus.response.status, 404);

  const unboundHandoff = await jsonRequest(`/api/customer-service/sessions/${purchase.payload.session_id}/handoff`, {
    user_id: visitorA.payload.userId,
    reason: "客户要求人工",
  });
  assert.equal(unboundHandoff.payload.feishu.delivered, false);
  assert.equal(unboundHandoff.payload.feishu.reason, "group_unbound");

  const invalidChallenge = await jsonRequest("/api/integrations/feishu/events", {
    type: "url_verification", token: "wrong", challenge: "blocked",
  });
  assert.equal(invalidChallenge.response.status, 401);
  const challenge = await jsonRequest("/api/integrations/feishu/events", {
    type: "url_verification", token: verificationToken, challenge: "accepted",
  });
  assert.equal(challenge.payload.challenge, "accepted");

  const binding = await feishuEvent("绑定 购买咨询");
  assert.equal(binding.payload.action, "bind");
  assert.equal(sentToFeishu.length, 1);
  const boundHandoff = await jsonRequest(`/api/customer-service/sessions/${purchase.payload.session_id}/handoff`, {
    user_id: visitorA.payload.userId,
    reason: "需要购买专员",
    preview: "请推荐适合幼犬的产品",
  });
  assert.equal(boundHandoff.payload.feishu.delivered, true);
  assert.equal(sentToFeishu.length, 2);
  assert.match(JSON.parse(sentToFeishu[1].content).text, new RegExp(purchase.payload.customer_code));

  const takeover = await feishuEvent(`接管 #${purchase.payload.customer_code}`);
  assert.equal(takeover.payload.action, "takeover");
  const replyMessageId = "om_agent_reply_once";
  const reply = await feishuEvent(`#${purchase.payload.customer_code} 您好，我是购买咨询人工客服。`, "oc_purchase_group", replyMessageId);
  assert.equal(reply.payload.action, "reply");
  const duplicate = await feishuEvent(`#${purchase.payload.customer_code} 重复消息不应写入。`, "oc_purchase_group", replyMessageId);
  assert.equal(duplicate.payload.duplicate, true);
  const websiteMessages = await request(`/api/messages?user_id=${visitorA.payload.userId}&session_id=${purchase.payload.session_id}`);
  assert.equal(websiteMessages.payload.filter((item) => item.external_message_id === replyMessageId).length, 1);
  assert.ok(websiteMessages.payload.some((item) => item.sender === "agent" && item.content.includes("购买咨询人工客服")));
  const liveStatus = await request(`/api/customer-service/sessions/${purchase.payload.session_id}?user_id=${visitorA.payload.userId}`);
  assert.equal(liveStatus.payload.status, "human");

  const publicConfig = await request("/api/feishu-service/config");
  assert.equal(publicConfig.payload.app_id, "cli_service_test");
  assert.equal(publicConfig.payload.redirect_uri, `${base}/feishu-service`);
  const unauthorizedDesk = await request("/api/feishu-service/groups");
  assert.equal(unauthorizedDesk.response.status, 401);
  const deskLogin = await jsonRequest("/api/feishu-service/auth", {
    code: "oauth-code", redirect_uri: `${base}/feishu-service`,
  });
  assert.equal(deskLogin.response.status, 200);
  const deskHeaders = { authorization: `Feishu ${deskLogin.payload.token}` };
  const groups = await request("/api/feishu-service/groups", { headers: deskHeaders });
  assert.equal(groups.payload.length, 6);
  const sessions = await request("/api/feishu-service/sessions?group_key=purchase", { headers: deskHeaders });
  assert.ok(sessions.payload.some((item) => item.id === purchase.payload.session_id));

  const close = await feishuEvent(`结束 #${purchase.payload.customer_code}`);
  assert.equal(close.payload.action, "end");
  const closedStatus = await request(`/api/customer-service/sessions/${purchase.payload.session_id}?user_id=${visitorA.payload.userId}`);
  assert.equal(closedStatus.payload.status, "ai");

  const deskReply = await jsonRequest(
    `/api/feishu-service/sessions/${purchase.payload.session_id}/messages`,
    { content: "您好，我是客服经理，已经从飞书应用网页接续处理。" },
    deskHeaders,
  );
  assert.equal(deskReply.response.status, 201);
  assert.equal(deskReply.payload.auto_takeover, true, "网页首次回复应自动接管，不要求先点接管按钮");
  assert.equal(deskReply.payload.session_status, "human");
  const afterDeskReply = await request(`/api/messages?user_id=${visitorA.payload.userId}&session_id=${purchase.payload.session_id}`);
  assert.ok(afterDeskReply.payload.some((item) => item.sender === "agent" && item.content.includes("客服经理")));

  const badRead = await jsonRequest(`/api/customer-service/sessions/${purchase.payload.session_id}/read`, {
    user_id: visitorB.payload.userId,
  });
  assert.equal(badRead.response.status, 404);
  const ownRead = await jsonRequest(`/api/customer-service/sessions/${purchase.payload.session_id}/read`, {
    user_id: visitorA.payload.userId,
  });
  assert.equal(ownRead.response.status, 200);
});
