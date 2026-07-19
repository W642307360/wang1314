# 福宠猫狗真实声音素材库

本目录提供可直接复制、部署和试听的短音频：

- `cats/cat-01.mp3` 至 `cats/cat-30.mp3`（真实幼猫声音）
- `dogs/dog-01.mp3` 至 `dogs/dog-30.mp3`（真实幼犬声音）
- `试听清单.html`：双击即可逐条播放或下载全部 60 条声音

统一规格：4 秒、MP3、单声道、22.05 kHz、64 kbps。网页采用 `preload="none"`，只有用户点击试听时才请求文件，不占用商品首屏带宽。

## 内容与技术校验

原始录音来自真实幼猫与幼犬录音。项目转码时执行解码校验、去除极低频与超高频、响度平衡、首尾淡入淡出；验收要求为时长 3–5 秒、可完整解码且非静音。这里的“随机分配”是稳定随机：按品种、商品 ID 计算，同一商品再次打开仍使用同一条声音。

## 原始录音与署名

每组 30 条短音频由下列真实录音分段生成；衍生音频继续遵守相应原始许可。

| 类型 | 原始文件 | 作者 | 许可 |
| --- | --- | --- | --- |
| 幼猫 | [Kitten Sounds](https://orangefreesounds.com/kitten-sounds/) | videog | Public Domain |
| 幼猫 | [Cute Kitten Meow](https://freesound.org/people/Breviceps/sounds/448084/) | Breviceps | CC0 |
| 幼犬 | [Puppy at a night.ogg](https://commons.wikimedia.org/wiki/File:Puppy_at_a_night.ogg) | Knites | CC0 |

详情与完整许可文本以对应 Wikimedia Commons 文件页为准。
