# 部署与验收手册

## 环境

1. 安装 Node.js 24+，执行 `npm ci` 与 `npm --prefix server ci`。
2. 复制 `.env.example` 到部署平台环境变量，必须设置新的 `ADMIN_TOKEN_SECRET`。
3. 飞书密钥、微信支付密钥和证书仅放服务端环境，不进入 Git、前端或日志。
4. 将 `DB_PATH` 指向持久磁盘；`server/data`、`server/backups` 和上传目录必须可写。

## 发布顺序

```bash
npm run lint
npm run build
npm test --prefix server
node server/backup.mjs
npm start --prefix server
npm run preview -- --host 0.0.0.0 --port 4173
```

API 启动时先创建每日备份，再按文件名顺序执行未应用迁移。禁止手工删除 `schema_migrations` 或重新初始化正式库。

## 上线验收

- `GET /api/health` 返回 `ok=true`。
- 管理后台 `/api/admin/db/status` 的 `integrity_check=ok` 且外键违规为 0。
- 同一手机号登录两次，两个响应中的用户 ID 相同。
- 登录前收藏与购物车在登录后存在；刷新页面仍存在。
- 创建订单后重复发送相同 `client_request_id`，订单号相同且库存只锁定一次。
- 后台更新物流后，用户订单详情的百分比和事件记录同步变化。
- 飞书依次执行“测试连接、同步预览、确认同步”，1000 条测试任务完成且失败明细可查询。
- 重启同步服务后，未完成任务能够从持久化队列继续。

## 监控与备份

- 每日保留数据库快照，至少保留 7 天；恢复前先停止写服务并保留故障库副本。
- 监控 `api_error_logs`、`sync_task_errors`、支付回调失败、订单库存异常和磁盘容量。
- SQLite 采用 WAL 与 5 秒忙等待。单机运营可稳定使用；需要多实例并发写入时迁移 PostgreSQL，API 数据边界保持不变。
