功能大全 · 冷启动数据包
========================

内容:
  feature-tools.json   201 条学术工具结构化数据(可直接导入功能大全)
  images/              201 个工具图标(<slug>.png/.ico/.svg …),与 json 里的 slug 一一对应
                         - 166 个是从工具官网抓的真实 logo(apple-touch-icon / favicon)
                         - 35 个无官网/抓不到的,用"分类配色 + 名称首字母"生成的 SVG 兜底

图片怎么走(重要):
  json 里的 logo 字段是【空】的。导入这个 zip 时,后端会把 images/ 里的每张图
  上传到 MinIO(bucket: scholar-feature-tools),并把对应工具的 logo 自动改成
  我们自己服务的稳定地址 /api/v1/public/tools/logo/<slug> —— 不再外链对方站点,
  彻底杜绝防盗链/CORS/404 图裂。
  (若导入的是纯 json 而非 zip,logo 留空,前端用首字母 SVG 兜底,也不会图裂。)

如何导入:
  1. 把本文件夹压缩成 zip(例如 feature-tools-coldstart.zip)
  2. 管理台 → 内容运营 → 功能大全 → 右上「导入工具」
  3. 选择上传 .zip(后端自动解包:读 feature-tools.json 导入 + 上传 images/ 到 MinIO)
  4. 「导入时通知下游 webhook」首次导入建议【关闭】
  5. 点导入 → 在「导入任务」看进度

幂等:按 source_topic_id / slug 去重 upsert,重复导入不会重复建。
slug 已规整为干净 ASCII(中文名工具用英文名或 tool-<id> 兜底)。
