# 商品橱窗主体分割模型

`silueta.onnx` 是 U-2-Net 的 43 MB 精简模型，仅在服务端本地执行商品主图主体分割。图片不会发送到第三方服务。仓库使用 `silueta.parts/*.part` 保存完整模型分片，服务端首次推理时会自动组装到忽略提交的 `server/data/models/` 缓存目录。

- 来源：<https://github.com/danielgatis/rembg/releases/download/v0.0.0/silueta.onnx>
- 上游项目：<https://github.com/xuebinqin/U-2-Net>
- 上游许可证：Apache-2.0
- SHA-256：`75DA6C8D2F8096EC743D071951BE73B4A8BC7B3E51D9A6625D63644F90FFEEDB`

模型随项目部署，飞书同步期间只处理新增或主图发生变化的商品；生成的 420px 白底 WebP 存入服务器缓存，商品详情仍读取原始高清图。
