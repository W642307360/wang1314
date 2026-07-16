CREATE TABLE IF NOT EXISTS seller_reviews(
  id INTEGER PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES sellers(id),
  user_id INTEGER REFERENCES users(id),
  nickname TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 5,
  content TEXT NOT NULL,
  tags TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS seller_reports(
  id INTEGER PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES sellers(id),
  user_id INTEGER REFERENCES users(id),
  pet_id INTEGER REFERENCES pets(id),
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  contact_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reply TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<24)
INSERT INTO seller_reviews(seller_id,nickname,rating,content,tags,created_at)
SELECT s.id,
  CASE (s.id+n)%12
    WHEN 0 THEN '云朵慢慢' WHEN 1 THEN '小满的日常' WHEN 2 THEN '认真养宠人'
    WHEN 3 THEN '一颗松果' WHEN 4 THEN '橘子汽水' WHEN 5 THEN '陪伴研究所'
    WHEN 6 THEN '春日来信' WHEN 7 THEN '阿梨和它' WHEN 8 THEN '岛屿散步'
    WHEN 9 THEN '奶油泡芙' WHEN 10 THEN '晴天收藏家' ELSE '温柔养宠家' END,
  CASE WHEN (s.id+n)%9=0 THEN 4 ELSE 5 END,
  CASE n%10
    WHEN 0 THEN '到店环境干净安静，工作人员先了解家庭情况，再介绍适合的宠物，没有急着催促下单。'
    WHEN 1 THEN '健康资料、接种记录和实拍影像都能逐项核对，带回家以后还有专人回访适应情况。'
    WHEN 2 THEN '商品页面和现场看到的一致，上传的视频也确实是这只宠物的日常实拍，选宠过程比较放心。'
    WHEN 3 THEN '客服把饮食、作息、应激期和就医提醒讲得很细，新手也能听懂，后续回复速度很快。'
    WHEN 4 THEN '线下门店布置有空间感，没有异味，宠物精神状态不错，店员允许我们慢慢观察互动。'
    WHEN 5 THEN '价格、保障范围和后续费用都提前说明，合同信息清楚，没有临时增加不明项目。'
    WHEN 6 THEN '接回家第一周每天都有人询问吃饭和排便情况，遇到小问题会给出明确处理步骤。'
    WHEN 7 THEN '商家提供的性格描述比较准确，家里有孩子也提前做了适养评估，整体体验很专业。'
    WHEN 8 THEN '疫苗凭证和健康检查可以查看原始记录，实拍照片没有过度修饰，资料透明度很好。'
    ELSE '从咨询、到店、确认资料到接回家的流程很顺畅，售后不是结束交易，而是继续陪伴。' END,
  CASE n%4 WHEN 0 THEN '资料透明,实拍一致' WHEN 1 THEN '服务耐心,环境整洁' WHEN 2 THEN '回访及时,新手友好' ELSE '流程规范,健康保障' END,
  datetime('now','-' || ((s.id*7+n*3)%120) || ' days')
FROM sellers s CROSS JOIN seq
WHERE NOT EXISTS (SELECT 1 FROM seller_reviews WHERE seller_id=s.id);

CREATE INDEX IF NOT EXISTS idx_seller_reviews_seller ON seller_reviews(seller_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_seller_reports_status ON seller_reports(status,created_at DESC,id DESC);
