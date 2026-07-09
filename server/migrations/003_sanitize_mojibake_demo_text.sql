-- 修复早期命令行测试写入的问号乱码演示数据。
-- 只更新无法识别的 "????" 文本，不删除业务数据。

UPDATE feishu_sync_configs
SET name = '福宠商品库'
WHERE name LIKE '%?%';

UPDATE pets
SET
  name = CASE WHEN name LIKE '%?%' THEN '福宠验收宠物' ELSE name END,
  breed = CASE WHEN breed LIKE '%?%' THEN '布偶猫' ELSE breed END,
  gender = CASE WHEN gender LIKE '%?%' THEN '女' ELSE gender END,
  color = CASE WHEN color LIKE '%?%' THEN '海豹双色' ELSE color END,
  body_type = CASE WHEN body_type LIKE '%?%' THEN '大型猫' ELSE body_type END,
  personality = CASE WHEN personality LIKE '%?%' THEN '温顺亲人' ELSE personality END,
  health_status = CASE WHEN health_status LIKE '%?%' THEN '健康' ELSE health_status END,
  vaccine_record = CASE WHEN vaccine_record LIKE '%?%' THEN '疫苗齐全' ELSE vaccine_record END,
  seller_name = CASE WHEN seller_name LIKE '%?%' THEN '福宠认证宠物馆' ELSE seller_name END,
  description = CASE WHEN description LIKE '%?%' THEN '系统验收商品档案' ELSE description END,
  updated_at = CURRENT_TIMESTAMP
WHERE
  name LIKE '%?%'
  OR breed LIKE '%?%'
  OR gender LIKE '%?%'
  OR color LIKE '%?%'
  OR body_type LIKE '%?%'
  OR personality LIKE '%?%'
  OR health_status LIKE '%?%'
  OR vaccine_record LIKE '%?%'
  OR seller_name LIKE '%?%'
  OR description LIKE '%?%';

UPDATE banners
SET title = '福宠安心到家'
WHERE title LIKE '%?%';

UPDATE categories
SET name = '福宠分类'
WHERE name LIKE '%?%';
