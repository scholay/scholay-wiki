-- ============================================================================
-- 0127 情报封面缩略图列(news_items)
--   背景:cover_image 是上游原图 URL,经 /img-remote 代理回源极慢(实测冷缓存
--   30s+/张),首页情报区图片把带宽拖死。方案:webhook 落库后【后台】下载原图 →
--   生成 ~640px JPEG 缩略图 → 存 MinIO(原图不落库);列表下发缩略图,详情页
--   仍走 /img-remote(生成缩略图那次取图顺带预热了 nginx 30d proxy_cache)。
--
--   cover_thumb_key:MinIO 对象 key(news-covers/<id>-<8位src哈希>.jpg);空 = 未生成。
--     key 内嵌 src 哈希 → 上游换图后重生成会产生【新 key/新 URL】,天然穿透
--     浏览器/边缘的 immutable 长缓存,无需版本参数。
--   cover_thumb_src:生成缩略图时使用的原图 URL(= 当时的 cover_image)。
--     上游 news.updated 会整列覆盖 cover_image,而这两列【刻意不进】repository.go
--     的 newsUpdatableCols —— 后台任务比对 cover_thumb_src != cover_image 即知
--     需要重生成,upsert 永远不会把它们冲掉。
-- 幂等:add_column_if_not_exists。永不 DROP。
-- ============================================================================

CALL add_column_if_not_exists('news_items', 'cover_thumb_key',
  'VARCHAR(255) NOT NULL DEFAULT '''' COMMENT ''本站缩略图 MinIO key(news-covers/<id>-<hash>.jpg);空=未生成''');
CALL add_column_if_not_exists('news_items', 'cover_thumb_src',
  'VARCHAR(768) NOT NULL DEFAULT '''' COMMENT ''缩略图对应的原图URL(=生成时的 cover_image);与 cover_image 不一致=需重生成''');
