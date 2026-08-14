-- ============================================================================
-- 0115: 会员兑换码生成批次
--
-- batch_id 只是管理分组标识，兑换权益的真源仍是每张码本身的 grant_* / max_uses
-- 等字段。这样既不引入第二套可漂移的配置，也保持现有多行 INSERT 的原子性。
--
-- 存量数据按产品约定「一码一批」，绝不按 created_at / note 推测原批次。
-- 回填只处理空值：脚本每次 Docker 启动重放时，新批次 UUID 不会被覆盖。
-- ============================================================================

CALL add_column_if_not_exists('vip_redemption_codes', 'batch_id',
  "CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '' COMMENT '生成批次ID;同次生成共享;存量码一张一批'");

UPDATE `vip_redemption_codes`
SET `batch_id` = CONCAT('legacy-', LPAD(`id`, 20, '0'))
WHERE `batch_id` IS NULL OR `batch_id` = '';
