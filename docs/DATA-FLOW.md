# 福宠系统数据流程

## 用户身份与数据归属

手机号是可重复登录的稳定身份。`POST /api/users/login` 先按 `account / phone / openid / wechat_openid` 查询已有用户，存在时更新登录时间，不创建重复用户；不存在时才创建。游客登录正式账号时传入 `previous_user_id`，服务端只在该旧账号状态为 `guest` 时合并数据，避免误合并其他正式账号。

用户数据统一用 `user_id` 关联：

```text
users
 ├─ user_auth / user_login_logs / visitors
 ├─ favorites / follows / footprints / cart_items
 ├─ addresses / user_coupons / messages
 ├─ customer_service_sessions / seller_reports
 └─ orders ─ order_items ─ pets
              ├─ payments
              ├─ logistics ─ logistics_events
              ├─ order_status_history
              └─ after_sales / complaints
```

再次使用同一手机号登录会返回同一个 `users.id`。收藏、购物车、地址、订单、付款、物流和消息因此继续读取原记录。前端已登录时不会再次创建访客并覆盖 `fuchong-user-id`；购物车同时保留服务端真值和按用户隔离的本地缓存，网络恢复后由 `/api/cart/merge` 幂等合并。

## 订单一致性

`POST /api/orders` 接收 `client_request_id`。同一用户重复提交相同请求号时直接返回原订单，不会再次锁库存。订单创建、明细、状态历史和库存锁定在同一事务内完成。支付成功由唯一支付索引防重复入账；取消、退款、收货分别释放锁定库存，并写入状态历史。

物流由 `logistics` 保存当前状态，`logistics_events` 保存 0–100% 的每次变化。用户端订单详情和管理员后台读取同一组表，不使用两套状态。

## 飞书同步

```text
测试连接 → 同步预览 → 管理员确认 → 创建任务
         → 持久化每行 payload → 分批事务写入
         → 商品/品种/库存/图片/视频 → 前台分页读取
```

- `record_id` 映射 `pets(source='feishu', external_id)`，重复同步执行更新。
- `feishu_sync_task_items` 保存每行原始数据、成功/失败状态和错误。
- `feishu_sync_tasks.processed/success/failed` 保存总进度。
- 暂停不丢队列；继续从 `processed` 开始；重试会重新运行持久化数据，商品写入保持幂等。
- 服务重启自动恢复 `pending/running` 任务；没有持久化数据的旧任务会明确标记失败。
- 图片与视频按商品、顺序更新，不一次性返回到前台商品列表。

## 故障定位

未捕获接口异常返回 `request_id`，内部详情写入 `api_error_logs`。管理员操作写入 `admin_operation_logs`，同步逐行错误写入 `sync_task_errors`。生产环境应按 `request_id`、订单号、同步任务 ID 定位，不向用户暴露堆栈或密钥。
