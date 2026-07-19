CREATE TABLE IF NOT EXISTS customer_service_groups (
  group_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  feishu_chat_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO customer_service_groups(group_key,label,description) VALUES
  ('purchase','购买咨询','产品介绍、区别、价格、推荐购买和使用方法'),
  ('order','订单咨询','订单查询、支付、修改订单和订单状态'),
  ('after_sale','售后服务','退款、换货、投诉和售后处理'),
  ('pet_health','宠物健康咨询','宠物健康、产品使用、饮食和日常护理建议'),
  ('logistics','物流帮助','发货、快递状态和配送问题'),
  ('official','官方客服','综合咨询、无法分类问题和高级客户服务');
ALTER TABLE customer_service_sessions ADD COLUMN group_key TEXT DEFAULT 'official';
ALTER TABLE customer_service_sessions ADD COLUMN customer_code TEXT;
ALTER TABLE customer_service_sessions ADD COLUMN classification_confidence REAL DEFAULT 0;
ALTER TABLE customer_service_sessions ADD COLUMN handoff_reason TEXT;
ALTER TABLE customer_service_sessions ADD COLUMN feishu_root_message_id TEXT;
ALTER TABLE customer_service_sessions ADD COLUMN last_customer_message_at TEXT;
ALTER TABLE customer_service_sessions ADD COLUMN last_agent_message_at TEXT;
ALTER TABLE customer_service_sessions ADD COLUMN closed_at TEXT;
ALTER TABLE messages ADD COLUMN channel TEXT DEFAULT 'website';
ALTER TABLE messages ADD COLUMN external_message_id TEXT;
ALTER TABLE messages ADD COLUMN metadata_json TEXT DEFAULT '{}';
CREATE TABLE IF NOT EXISTS customer_service_events(id INTEGER PRIMARY KEY,session_id INTEGER REFERENCES customer_service_sessions(id) ON DELETE CASCADE,event_type TEXT NOT NULL,actor TEXT,detail_json TEXT DEFAULT '{}',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS customer_service_knowledge(id INTEGER PRIMARY KEY,group_key TEXT NOT NULL,title TEXT NOT NULL,keywords TEXT NOT NULL,answer TEXT NOT NULL,priority INTEGER NOT NULL DEFAULT 0,enabled INTEGER NOT NULL DEFAULT 1,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO customer_service_knowledge(id,group_key,title,keywords,answer,priority) VALUES
  (1,'purchase','购买建议','价格,推荐,适合,幼犬,幼猫,区别,怎么选','我可以根据宠物的年龄、品种、体重和生活习惯帮您筛选。请告诉我这些信息，以及您更关注健康、性格还是预算，我会给您更具体的建议。',100),
  (2,'order','订单查询','订单,支付,修改订单,订单状态','我可以帮您核对订单。为保护隐私，请直接发送本页面里的订单卡片，不要在聊天中提供完整身份证或银行卡信息。',100),
  (3,'after_sale','售后规则','退款,换货,退货,投诉,售后','售后问题会由专员优先处理。我已经记录您的诉求，请发送对应订单卡片并简要说明原因；涉及退款或投诉时会自动转人工。',100),
  (4,'pet_health','健康咨询边界','不舒服,呕吐,腹泻,没精神,生病,健康,饮食,护理','我会先帮您梳理情况，但线上建议不能替代兽医诊断。请告诉我宠物品种、年龄、体重、症状开始时间和是否进食饮水；如出现呼吸困难、抽搐、持续呕吐、便血或意识异常，请立即就近急诊。',100),
  (5,'logistics','物流查询','物流,快递,发货,配送,到哪了,什么时候到','我可以帮您核对发货和配送进度。请发送本页面里的物流订单卡片，我会根据订单记录继续处理。',100),
  (6,'official','综合咨询','人工,客服,其他,不知道','您好，我在。您可以直接描述问题，我会先帮您判断应该由哪个客服组处理；如果信息不足或需要特殊处理，我会马上转给人工客服。',10);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_service_customer_code ON customer_service_sessions(customer_code);
CREATE INDEX IF NOT EXISTS idx_customer_service_group_status ON customer_service_sessions(group_key,status,updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external_message ON messages(external_message_id) WHERE external_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_events_session_time ON customer_service_events(session_id,created_at);
CREATE INDEX IF NOT EXISTS idx_service_knowledge_group ON customer_service_knowledge(group_key,enabled,priority);
