CREATE TABLE IF NOT EXISTS sellers(
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL,
  address TEXT NOT NULL,
  rating REAL NOT NULL DEFAULT 5,
  sales INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  specialty TEXT,
  offline_store TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO sellers(id,name,city,address,rating,sales,review_count,specialty,offline_store) VALUES
(1,'云朵宠物生活馆','上海','静安区愚园路218号',4.9,3289,862,'猫咪家庭适配与新手陪伴','云朵生活馆·静安店'),
(2,'森屿萌宠馆','杭州','西湖区文三路126号',4.8,2168,591,'长毛猫护理与科学喂养','森屿萌宠·西湖店'),
(3,'暖爪宠物之家','南京','鼓楼区中山北路88号',4.9,1896,476,'幼宠社会化与家庭融入','暖爪之家·鼓楼店'),
(4,'星河伴侣宠物馆','苏州','工业园区星湖街115号',4.8,2751,702,'犬类行为训练与陪伴评估','星河伴侣·园区店'),
(5,'小满宠物生活','成都','锦江区东大街166号',4.9,3640,915,'家庭养宠咨询与健康回访','小满生活·锦江店'),
(6,'拾光萌宠空间','北京','朝阳区朝阳北路92号',4.7,1528,389,'宠物影像档案与成长记录','拾光空间·朝阳店'),
(7,'橘里宠物会馆','武汉','江汉区青年路308号',4.8,2390,648,'猫咪性格观察与选宠顾问','橘里会馆·江汉店'),
(8,'青禾宠物生活馆','宁波','鄞州区天童南路77号',4.9,1765,422,'小型犬照护与日常美容','青禾生活馆·鄞州店'),
(9,'岛屿宠物之家','厦门','思明区湖滨南路188号',4.8,2056,537,'热带水族与环境适配','岛屿之家·思明店'),
(10,'白露萌宠馆','广州','天河区体育西路103号',4.9,4186,1108,'猫犬健康筛查与售后陪伴','白露萌宠·天河店'),
(11,'山茶宠物生活','重庆','渝中区时代天街46号',4.7,1482,365,'家庭伴侣犬与适养评估','山茶生活·渝中店'),
(12,'木棉宠物会馆','深圳','南山区海德三道62号',4.9,3915,984,'精品猫舍档案与健康管理','木棉会馆·南山店'),
(13,'浮光宠物空间','长沙','岳麓区潇湘中路156号',4.8,2264,578,'奇宠环境配置与安全照护','浮光空间·岳麓店'),
(14,'春野萌宠之家','青岛','市南区香港中路71号',4.9,1839,461,'幼宠免疫与家庭过渡','春野之家·市南店'),
(15,'月桂宠物生活馆','天津','和平区南京路203号',4.8,2677,699,'宠物营养与体态管理','月桂生活馆·和平店'),
(16,'清川宠物会馆','济南','历下区泉城路129号',4.7,1356,328,'鸟类照护与互动训练','清川会馆·历下店'),
(17,'松果萌宠空间','合肥','蜀山区潜山路169号',4.9,1978,503,'兔类与小宠科学饲养','松果空间·蜀山店'),
(18,'南风宠物之家','福州','鼓楼区五四路96号',4.8,2145,552,'家庭选宠与长期回访','南风之家·鼓楼店'),
(19,'晴川宠物生活','西安','雁塔区科技路118号',4.9,3068,801,'犬类体态与行为评估','晴川生活·雁塔店'),
(20,'溪谷萌宠馆','昆明','盘龙区北京路846号',4.8,1692,417,'异宠、水族与自然环境营造','溪谷萌宠·盘龙店');

UPDATE pets
SET seller_id=((id-1) % 20)+1
WHERE seller_id IS NULL;

UPDATE pets
SET seller_name=(SELECT name FROM sellers WHERE sellers.id=pets.seller_id)
WHERE seller_id IS NOT NULL
  AND (seller_name IS NULL OR trim(seller_name)='' OR seller_name IN ('福宠认证宠物馆','福宠P0店铺'));

UPDATE pet_products
SET seller_id=(SELECT seller_id FROM pets WHERE pets.id=pet_products.pet_id)
WHERE seller_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sellers_status ON sellers(status,id);
CREATE INDEX IF NOT EXISTS idx_pets_seller_id ON pets(seller_id,status,id);
