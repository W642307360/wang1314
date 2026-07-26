# 腾讯云生产部署

该目录用于将本项目持续部署到 `petinmyall.me`，不依赖 GPT/Sites 托管。

## 生产架构

- `/srv/fuchong/releases/<release>`：每次发布的只读版本目录
- `/srv/fuchong/current`：原子指向当前版本的软链接
- `/srv/fuchong/shared/data`：SQLite 生产数据库
- `/srv/fuchong/shared/uploads`：用户上传文件
- `/srv/fuchong/shared/backups`：数据库备份
- `/srv/fuchong/shared/.env.production`：服务器端生产密钥，权限 `600`
- Docker Compose：运行 Node.js API，健康检查与自动重启
- Nginx：主站静态文件、API/上传反向代理、HTTPS 与安全响应头
- Tencent COS：静态资源与上传文件持续同步
- Tencent CDN：`media.petinmyall.me` 提供图片、音视频 HTTPS 加速

## 发布新版本

在 Windows PowerShell 中进入项目根目录并执行：

```powershell
.\deploy\tencent\publish.ps1 -IdentityFile "C:\安全目录\wqqdwd.pem"
```

脚本会完成：

1. 创建排除依赖、缓存和日志的源码归档。
2. 上传到服务器的新 release 目录。
3. 在服务器容器内执行 `npm ci` 与生产构建。
4. 构建新的 API 镜像。
5. 原子切换 `/srv/fuchong/current`。
6. 等待 API 和数据库健康检查。
7. 失败时自动恢复上一个 release。
8. 成功后触发 COS 增量同步。

数据库、上传文件、备份和生产密钥不存放在 release 中，因此更新代码不会覆盖业务数据。

## 回滚

自动发布失败时脚本会恢复旧版本。需要手工回滚时：

```bash
sudo ln -sfn /srv/fuchong/releases/<旧版本> /srv/fuchong/current
cd /srv/fuchong/current
RELEASE_TAG=<旧版本> sudo -E docker compose -f deploy/tencent/compose.yaml up -d
sudo nginx -t && sudo systemctl reload nginx
```

## 自动任务

- `fuchong-backup.timer`：每天备份 SQLite，保留 14 天
- `fuchong-cos-sync.timer`：每 5 分钟同步静态资源和上传文件到 COS
- `certbot.timer`：自动续期主站及 CDN 证书
- `/etc/letsencrypt/renewal-hooks/deploy/fuchong-cdn-certificate`：续期后自动部署 CDN 证书

所有变更完成后运行 `sudo nginx -t`、`docker ps`、`/api/health` 和 HTTPS/CDN 检查再结束发布。
