# 福宠宠物商城

福宠是一个增量开发的宠物商城系统，包含用户端、管理员后台、SQLite 数据库、微信支付预留、客服消息与飞书多维表格同步队列。项目保留现有 UI 和业务结构，数据库变更全部通过迁移执行，不会重建或清空已有数据。

## 已实现功能

- 用户端：首页、场馆/品种、分页搜索、宠物详情、收藏、购物车、足迹、地址、优惠券、订单、客服、登录与资料维护。
- 交易链路：选择商品、地址确认、创建订单、库存锁定、模拟支付/微信预支付、支付回调、后台发货、物流进度、售后退款。
- 管理后台：管理员鉴权、商品资料与媒体、SKU/库存、用户、订单、交易流水、物流、投诉售后、Banner/分类、优惠券、飞书同步和操作日志。
- 数据安全：增量 migration、启动前自动备份、外键检查、常用查询索引、测试使用独立临时数据库。
- 性能：商品 API 分页、列表懒加载、图片缩略图/高清图分级、骨架状态、飞书每批最多 500 条异步处理。

## 本地启动

要求 Node.js 24+。

```bash
npm install
npm --prefix server install
npm run dev
```

另开终端启动 API：

```bash
npm start --prefix server
```

- 用户端：http://127.0.0.1:4173/
- 管理后台：http://127.0.0.1:4173/#admin
- API：http://127.0.0.1:3001/
- 初始管理员：admin / 123456789

生产环境请复制 `.env.example` 的字段到部署平台环境变量。必须替换 `ADMIN_TOKEN_SECRET`；飞书 App Secret、微信支付密钥和证书禁止提交 Git。前端使用 `VITE_API_BASE`，上传文件公开地址使用 `PUBLIC_API_BASE`。

## 数据库与迁移

默认数据库是 `server/data/fuchong.db`，该目录已忽略提交。启动 API 时会按顺序执行 `server/migrations/*.sql`，已执行记录写入 `schema_migrations`。迁移只新增表、字段和索引，不使用 `DROP TABLE`，也不清空旧数据。

建议部署平台定时备份：

```powershell
Copy-Item server\data\fuchong.db server\backups\fuchong-$(Get-Date -Format yyyyMMdd-HHmmss).db
```

主要数据表：`users`、`user_auth`、`pets`、`breeds`、`pet_products`、`pet_skus`、`pet_images`、`pet_videos`、`inventory`、`orders`、`order_items`、`payments`、`logistics`、`logistics_events`、`after_sales`、`complaints`、`favorites`、`follows`、`footprints`、`addresses`、`coupons`、`user_coupons`、`messages`、`banners`、`categories`、`feishu_sync_configs`、`feishu_sync_tasks`、`admin_operation_logs`。

## 核心 API

用户端：

- `GET /api/pets?q=&page=1&pageSize=12`、`GET /api/pets/:id`
- `GET/PATCH /api/users/:id`、`PATCH /api/users/:id/bind-phone`、`POST /api/users/:id/auth`
- `GET /api/users/:id/summary`
- `GET/POST/PATCH/DELETE /api/addresses`
- `GET/POST/DELETE /api/favorites`、`GET/POST/DELETE /api/follows`
- `GET/POST/DELETE /api/footprints`、`GET /api/coupons`
- `POST /api/orders`、`GET /api/orders`、`GET /api/orders/:id`、`PATCH /api/orders/:id/cancel`
- `POST /api/payments/mock`、`POST /api/payments/wechat/prepay`、`POST /api/payments/wechat/notify`
- `POST /api/after-sales`、`POST /api/complaints`、`GET/POST /api/messages`

管理员端（均需 Bearer Token）：

- `POST /api/admin/login`、`GET /api/admin/stats`、`GET /api/admin/db/status`
- `GET/POST/PATCH/DELETE /api/admin/pets`、商品媒体、SKU 与库存子接口
- `GET/PATCH /api/admin/orders/:id`、`PUT /api/admin/orders/:id/logistics`
- `GET/PATCH /api/admin/users/:id`
- `GET/PATCH /api/admin/complaints/:id`、`GET/PATCH /api/admin/after-sales/:id`
- `GET/POST/PATCH/DELETE /api/admin/banners`、`/categories`
- `GET/POST/PATCH /api/admin/coupons`、`POST /api/admin/coupons/:id/issue`
- 飞书配置、同步、暂停、继续、重试、错误明细接口

## 飞书同步

后台可保存多维表格 App ID、Base 链接、Table ID 和字段映射。任务执行流程为：鉴权 → 分页读取 → 字段校验/标准品种匹配 → 每批最多 500 条写入宠物、库存、图片和视频 → 记录成功数与逐行错误。缺少 `FEISHU_APP_SECRET` 时远程任务会明确失败，不会伪造同步成功；测试数据模式仍可验证完整队列。

当前表格配置基准：App ID `cli_a902ca6a2cb85cc0`，Table ID `tblUaCqyE3xkk1Bj`。要进行真实远程读取，必须在运行环境提供对应 App Secret，并在飞书开放平台授予多维表格读取权限。

## 微信支付

已实现 JSAPI 预支付签名、支付通知验签/解密、幂等付款和订单状态更新。真实支付前需要配置 `.env.example` 中全部 `WECHAT_PAY_*` 字段，并使用公网 HTTPS 回调地址。开发环境的模拟支付接口只用于本地联调。

## 检查与构建

```bash
npm run lint
npm run build
npm test --prefix server
```

接口测试使用系统临时目录中的独立 SQLite 数据库，不读取、不覆盖真实业务库。提交前还应检查 `/api/admin/db/status` 的迁移记录、外键完整性和备份结果。

## 部署建议

- 将 `dist/` 部署到 Nginx/CDN，API 使用 PM2、systemd 或容器托管。
- 上传文件生产环境迁移到对象存储/CDN，保留当前 URL 字段协议。
- 轻运营规模可继续使用 WAL 模式 SQLite；用户、订单写入量进一步增长时迁移到 PostgreSQL，并沿用现有迁移与 API 边界。
- 将数据库备份、接口错误日志、飞书同步失败数和微信支付回调失败纳入监控告警。
