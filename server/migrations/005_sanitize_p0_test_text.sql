-- 清理 P0 验收过程中命令行编码造成的问号乱码。
-- 只替换无法识别的问号文本，不删除数据。

UPDATE users
SET nickname = 'P0验收用户'
WHERE nickname LIKE 'P0%?%';

UPDATE pets
SET
  name = CASE WHEN name LIKE 'P0%?%' THEN 'P0客服收藏验收宠物' ELSE name END,
  breed = CASE WHEN breed LIKE '%?%' THEN '布偶猫' ELSE breed END,
  gender = CASE WHEN gender LIKE '%?%' THEN '女' ELSE gender END,
  color = CASE WHEN color LIKE '%?%' THEN '海豹双色' ELSE color END,
  body_type = CASE WHEN body_type LIKE '%?%' THEN '大型猫' ELSE body_type END,
  personality = CASE WHEN personality LIKE '%?%' THEN '亲人' ELSE personality END,
  health_status = CASE WHEN health_status LIKE '%?%' THEN '健康' ELSE health_status END,
  vaccine_record = CASE WHEN vaccine_record LIKE '%?%' THEN '疫苗齐全' ELSE vaccine_record END,
  seller_name = CASE WHEN seller_name LIKE '%?%' THEN '福宠P0店铺' ELSE seller_name END,
  description = CASE WHEN description LIKE '%?%' THEN 'P0闭环验收' ELSE description END,
  updated_at = CURRENT_TIMESTAMP
WHERE
  name LIKE 'P0%?%'
  OR breed LIKE '%?%'
  OR seller_name LIKE '%?%';

UPDATE messages
SET
  product_name = 'P0客服收藏验收宠物',
  seller_name = '福宠P0店铺'
WHERE product_name LIKE 'P0%?%' OR seller_name LIKE '%?%';

UPDATE customer_service_sessions
SET
  product_name = 'P0客服收藏验收宠物',
  seller_name = '福宠P0店铺'
WHERE product_name LIKE 'P0%?%' OR seller_name LIKE '%?%';
