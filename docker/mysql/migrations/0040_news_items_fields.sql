-- ============================================================================
-- 0040 情报(学术新闻)主表 news_items
--   上游 = Minicod news webhook(server-to-server 推送);本侧只接收/落库/展示。
--   稳定主键 = id(uuid,上游跨更新不变);slug 做 SEO 路由(/news/:slug)。
--   热度字段(heat_external / heat_trend)按协议是「数值」(可含小数、可为负),
--   用 DECIMAL 存;news.heat 事件只覆盖 heat_* 三列 + 不动 upstream_updated_at。
-- 幂等:CREATE TABLE IF NOT EXISTS。永不 DROP。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `news_items` (
  `id`                  CHAR(36)      NOT NULL                  COMMENT '情报id(uuid,上游稳定主键,upsert/幂等依据)',
  `slug`                VARCHAR(200)  NOT NULL DEFAULT ''       COMMENT 'SEO slug(形如 2026-06-12-xxx),详情页路由',
  `url`                 VARCHAR(768)  NOT NULL DEFAULT ''       COMMENT '上游站内详情页绝对URL',
  `report_id`           VARCHAR(64)   NOT NULL DEFAULT ''       COMMENT '所属报告id(可空)',
  `report_type`         VARCHAR(16)   NOT NULL DEFAULT ''       COMMENT 'hourly=快讯 | daily=今日要览',
  `section`             VARCHAR(32)   NOT NULL DEFAULT ''       COMMENT 'major-event/china-policy/top-journal/other',
  `section_label`       VARCHAR(64)   NOT NULL DEFAULT ''       COMMENT '版块中文名',
  `title`               VARCHAR(500)  NOT NULL DEFAULT ''       COMMENT '标题(zh)',
  `summary`             TEXT                                    COMMENT '导语(zh)',
  `body_md`             LONGTEXT                                COMMENT '正文markdown(zh,/uploads已绝对URL)',
  `body_html`           LONGTEXT                                COMMENT '正文HTML(zh,/uploads已绝对URL,可直接展示)',
  `credibility_note`    TEXT                                    COMMENT '可信度说明(zh)',
  `cover_image`         VARCHAR(768)  NOT NULL DEFAULT ''       COMMENT '封面图URL(从body_html抽首图,上游链接直用)',
  `original_date`       VARCHAR(20)   NOT NULL DEFAULT ''       COMMENT '论文/事件原始日期YYYY-MM-DD(可空,原样存字符串)',
  `published_at`        DATETIME      NULL                      COMMENT '发布时间',
  `sources`             JSON                                    COMMENT '来源数组[{url,label}]',
  `status`              VARCHAR(20)   NOT NULL DEFAULT 'published' COMMENT '恒published(仅已发布才投递)',
  `is_featured`         TINYINT(1)    NOT NULL DEFAULT 0        COMMENT '是否头条',
  `score`               DECIMAL(4,2)  NOT NULL DEFAULT 0        COMMENT '影响力评分0-10',
  `view_count`          BIGINT        NOT NULL DEFAULT 0        COMMENT '浏览数(本侧累加,upsert不被webhook覆盖)',
  `heat_external`       DECIMAL(5,2)  NOT NULL DEFAULT 0        COMMENT '站外综合热度0-100(榜单排序键)',
  `heat_trend`          DECIMAL(8,2)  NOT NULL DEFAULT 0        COMMENT '热度上升速度(可负,飙升用)',
  `heat_measured_at`    DATETIME      NULL                      COMMENT '热度最近测量时刻',
  `upstream_created_at` DATETIME      NULL                      COMMENT '上游创建时间',
  `upstream_updated_at` DATETIME      NULL                      COMMENT '上游更新时间(=dateModified真源;热度刷新不动它)',
  `created_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '本侧行创建时间',
  `updated_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '本侧行更新时间(含热度刷新,非SEO用)',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='情报(学术新闻)主表';
