ALTER TABLE sellers ADD COLUMN image_url TEXT;
ALTER TABLE sellers ADD COLUMN thumbnail_url TEXT;

UPDATE sellers
SET image_url=printf('/merchant/seller-%02d.webp',id),
    thumbnail_url=printf('/merchant/seller-%02d-thumb.webp',id)
WHERE id BETWEEN 1 AND 20;

WITH RECURSIVE seq(n) AS (
  SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<128
)
INSERT INTO seller_reviews(seller_id,nickname,rating,content,tags,created_at)
SELECT s.id,
  CASE (s.id+n)%20
    WHEN 0 THEN '云朵慢慢' WHEN 1 THEN '小满的日常' WHEN 2 THEN '认真养宠人'
    WHEN 3 THEN '一颗松果' WHEN 4 THEN '橘子汽水' WHEN 5 THEN '陪伴研究所'
    WHEN 6 THEN '春日来信' WHEN 7 THEN '阿梨和它' WHEN 8 THEN '岛屿散步'
    WHEN 9 THEN '奶油泡芙' WHEN 10 THEN '晴天收藏家' WHEN 11 THEN '温柔养宠家'
    WHEN 12 THEN '南风吹过' WHEN 13 THEN '木棉小院' WHEN 14 THEN '月桂日记'
    WHEN 15 THEN '清川和团子' WHEN 16 THEN '山茶的朋友' WHEN 17 THEN '星河漫步'
    WHEN 18 THEN '青禾手记' ELSE '暖爪生活' END,
  CASE WHEN (s.id*3+n)%13 IN (0,1) THEN 4 ELSE 5 END,
  CASE n%16
    WHEN 0 THEN '第一次到店时先看了门店环境和宠物状态，工作人员没有催促，留了充足时间让我们观察互动。'
    WHEN 1 THEN '页面里的实拍图和现场看到的一致，毛色、体型和精神状态都没有明显差异。'
    WHEN 2 THEN '健康检查、疫苗记录和日常喂养表都能逐项核对，资料解释得很清楚。'
    WHEN 3 THEN '客服先问了家庭成员和作息，再推荐更适合的性格，没有只按价格介绍。'
    WHEN 4 THEN '接回家前把粮食过渡、应激期和就医提醒整理成清单，新手照着做很省心。'
    WHEN 5 THEN '门店干净安静，分区和通风都不错，现场没有明显异味，宠物状态也很放松。'
    WHEN 6 THEN '下单前把价格、保障范围和后续可能产生的费用都说清楚了，合同没有模糊项目。'
    WHEN 7 THEN '生活视频确实是对应宠物的日常记录，能看出性格和活动状态，选宠时很有帮助。'
    WHEN 8 THEN '到家第一周每天都有回访问吃饭、饮水和排便情况，回复速度一直很稳定。'
    WHEN 9 THEN '性格描述比较准确，和家里原住民见面的步骤也给了具体建议，适应过程很顺利。'
    WHEN 10 THEN '工作人员对品种特点和常见健康风险讲得很客观，没有回避需要长期注意的问题。'
    WHEN 11 THEN '预约到店、核对档案、签约和接宠的流程衔接顺畅，每一步都有人说明。'
    WHEN 12 THEN '门店实景照片与实际环境一致，位置也好找，预约后到店基本不用等待。'
    WHEN 13 THEN '售后不是简单发模板，遇到挑食问题时会结合体重和作息给调整方案。'
    WHEN 14 THEN '家里有孩子，商家专门做了互动和适养评估，提醒了边界和卫生注意事项。'
    ELSE '比较喜欢这里资料透明的方式，原始凭证、实拍影像和服务承诺都可以当面确认。' END
  || CASE ((n-1)/16)%8
    WHEN 0 THEN ' 整体沟通自然，第一次养宠也不会有压力。'
    WHEN 1 THEN ' 目前适应稳定，后续问题也能及时找到人。'
    WHEN 2 THEN ' 细节比预想充分，家里人对这次选择都很满意。'
    WHEN 3 THEN ' 从咨询到接回家的体验一致，没有前后说法变化。'
    WHEN 4 THEN ' 特别是档案和影像对应关系做得清楚，比较让人放心。'
    WHEN 5 THEN ' 工作人员耐心但不过度推销，给了我们自己判断的空间。'
    WHEN 6 THEN ' 后续还会定期回访，能感受到服务不是到成交就结束。'
    ELSE ' 如果朋友以后需要选宠，我会愿意推荐先来实地了解。' END,
  CASE n%6
    WHEN 0 THEN '资料透明,实拍一致' WHEN 1 THEN '服务耐心,环境整洁'
    WHEN 2 THEN '回访及时,新手友好' WHEN 3 THEN '流程规范,健康保障'
    WHEN 4 THEN '适养评估,讲解专业' ELSE '价格透明,售后负责' END,
  datetime('now','-' || ((s.id*11+n*5)%360) || ' days')
FROM sellers s CROSS JOIN seq
WHERE n <= 128-(SELECT COUNT(*) FROM seller_reviews r WHERE r.seller_id=s.id);

UPDATE sellers
SET review_count=(SELECT COUNT(*) FROM seller_reviews WHERE seller_id=sellers.id),
    updated_at=CURRENT_TIMESTAMP;
