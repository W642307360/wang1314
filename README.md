# 福宠宠物商城

商业级宠物商城前台 + 管理后台 + SQLite 数据库 + 商品同步队列。

## 功能概览

- 用户端：首页、场馆、搜索、宠物详情、收藏、关注、足迹、地址、优惠券、订单、客服消息。
- 管理后台：商品、SKU/库存、订单、物流、售后/投诉、用户、首页内容、飞书同步、操作日志。
- 数据库：迁移保护、备份策略、支付、库存、同步错误日志、兼容 products/pet_categories 命名视图。
- 性能：商品分页加载、接口索引、500 条/批异步同步、图片懒加载基础、10,000 商品级查询验证。

## 本地启动

```bash
npm install
npm run dev
```

另开一个终端启动 API：

```bash
cd server
npm install
npm start
```

默认地址：

- 前台：http://127.0.0.1:4173/
- API：http://127.0.0.1:3001/
- 后台：http://127.0.0.1:4173/#admin

后台账号：

- 账号：admin
- 密码：123456789

## 环境变量

```bash
PORT=3001
DB_PATH=./data/fuchong.db
ADMIN_TOKEN_SECRET=please-change-in-production
ADMIN_INITIAL_PASSWORD=123456789
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
WECHAT_PAY_APP_ID=wx_xxx
WECHAT_PAY_MCH_ID=商户号
WECHAT_PAY_SERIAL_NO=商户证书序列号
WECHAT_PAY_PRIVATE_KEY_PATH=./certs/apiclient_key.pem
WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH=./certs/wechatpay_platform.pem
WECHAT_PAY_API_V3_KEY=32位APIv3密钥
WECHAT_PAY_NOTIFY_URL=https://你的域名/api/payments/wechat/notify
```

生产部署必须修改 `ADMIN_TOKEN_SECRET`，密钥与证书文件禁止提交 Git。微信支付金额由系统中的元自动换算为分，支付结果只接受微信签名验证通过的服务端回调。

## 数据库安全

数据库文件默认在 `server/data/fuchong.db`，该目录不会提交 Git。

本项目使用 `server/migrations/*.sql` 做增量迁移：

- 禁止 `DROP TABLE`
- 禁止清空业务数据
- 新字段、新表、新索引全部通过 migration 增量执行
- 已执行迁移记录在 `schema_migrations`

手动备份建议：

```powershell
Copy-Item server\data\fuchong.db server\backups\fuchong-$(Get-Date -Format yyyyMMdd-HHmmss).db
```

`server/backups/` 已加入 `.gitignore`。

## 核心 API

用户端：

- `GET /api/pets?q=&page=1&pageSize=12`
- `GET /api/pets/:id`
- `GET /api/categories`
- `POST /api/visitors/session`
- `POST /api/orders`
- `GET /api/orders?user_id=`
- `POST /api/payments/mock`
- `POST /api/payments/wechat/prepay`
- `POST /api/payments/wechat/notify`
- `PATCH /api/orders/:id/cancel`
- `GET/POST /api/favorites`
- `GET/POST/DELETE /api/follows`
- `GET/POST/DELETE /api/footprints`
- `GET/POST /api/addresses`
- `GET/POST /api/messages`
- `GET /api/coupons`

后台：

- `POST /api/admin/login`
- `GET /api/admin/stats`
- `GET /api/admin/db/status`
- `GET/POST /api/admin/pets`
- `GET/PATCH/DELETE /api/admin/pets/:id`
- `GET/POST /api/admin/pets/:id/skus`
- `PATCH/DELETE /api/admin/skus/:id`
- `POST /api/admin/pets/:id/images`
- `POST /api/admin/pets/:id/videos`
- `GET /api/admin/orders`
- `GET/PATCH /api/admin/orders/:id`
- `PUT /api/admin/orders/:id/logistics`
- `GET /api/admin/users`
- `GET /api/admin/users/:id`
- `GET/PATCH /api/admin/complaints/:id`
- `GET/PATCH /api/admin/after-sales/:id`
- `GET/POST /api/admin/banners`
- `GET/POST /api/admin/categories`
- `GET/POST /api/admin/feishu/configs`
- `POST /api/admin/feishu/sync`
- `POST /api/admin/feishu/tasks/:id/pause`
- `POST /api/admin/feishu/tasks/:id/resume`
- `POST /api/admin/feishu/tasks/:id/retry`
- `GET /api/admin/feishu/tasks/:id/errors`
- `GET /api/admin/logs`

## 构建与检查

```bash
npm run build
cd server
npm test
```

接口测试使用系统临时目录中的独立 SQLite 数据库，不会读取、修改或清空真实业务数据库。当前覆盖管理员鉴权、商品创建、真实地址下单、支付幂等、未付款禁止发货、物流进度与用户端同步。

## 飞书同步

后台保存多维表格配置后，可启动真实远程读取。同步流程按每批最多 500 条执行：飞书鉴权 → 分页读取记录 → 字段校验/转换 → 宠物与品种关联 → 商品、库存、图片、视频写入 → 错误日志。未提供 `FEISHU_APP_SECRET` 时不会伪造远程成功，任务会明确记录失败原因；也可使用后台测试模式验证队列。

建议上线前检查：

1. 后台登录是否成功。
2. `/api/admin/db/status` 是否能看到迁移记录。
3. 商品搜索 `pageSize=12` 是否只返回一页。
4. 同步任务 500 条/批是否 completed。
5. 下单、模拟支付、物流更新是否能在后台看到状态变化。

## 部署建议

- 使用 Node.js 24+。
- API 进程建议由 PM2、systemd 或容器托管。
- 前端 `dist/` 可部署到 Nginx/CDN。
- 上传文件建议迁移到对象存储/CDN。
- SQLite 可支撑当前演示/轻运营；更大规模建议迁移 PostgreSQL/MySQL，并保留当前迁移策略。
