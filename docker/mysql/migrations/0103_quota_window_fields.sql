-- ============================================================================
-- 0103: 额度窗口持久化副本 user_quota_windows
--
-- 背景:在此之前**全部**计费周期状态只活在 Redis(quota:anchor / quota:tokens),
-- MySQL 里一个字节都没有。Redis 的数据目录一旦丢失(或换池 / 有人执行 FLUSHALL —— 后者
-- 还被写在 CLAUDE.md 的常规运维命令里),所有人的计费周期归零且无从恢复。
--
-- 🔴 设计上的三个关键决定,改这张表之前必须先读懂:
--
-- ① **主键是 (user_id, anchor_at) —— 一个窗口一行,不是一个用户一行。**
--    这不是为了留档,是为了让「以谁为准」的竞态在**结构上**消失:后台 flusher 落盘时
--    写的是「它当时那个 anchor」那一行,所以「手动重置刚把 used 归零、一个滞后的 flush
--    又把旧值写回来」这种经典竞态不可能发生 —— 旧值写进的是旧 anchor 的行。
--    同理 used 才敢用 GREATEST 合并:同一 anchor 下 used 单调不减是硬事实。
--
-- ② **anchor_at 用 BIGINT unix 秒,不用 DATETIME。**
--    Redis 里的真源就是整数,判定式 `now >= anchor + windowSec` 是整数比较。
--    转 DATETIME 再转回来会引入两颗雷:MySQL 的 datetime(0) 对小数秒是**四舍五入**不是截断,
--    且本仓库铁律是全程北京时间不做 UTC 转换 —— 多一层表示就多一个只在窗口边界那一秒
--    才发作的 bug 口子。要人读用 FROM_UNIXTIME(),**刻意不加冗余的可读列**
--    (同一事实两份表示是本仓库反复踩过的坑)。
--
-- ③ **必须有 tombstone(state=voided),不能只记「anchor = X」。**
--    anchor 有四个变更点,其中**两个是 DEL**:升级满血(applyUpgradeRefill)与降级作废
--    (realignWindowAfterDowngrade)。若 DB 侧没有「这个窗口已被作废」的表示,
--    恢复路径会从 MySQL 读回**升级前那个已耗尽的窗口** —— 用户付钱升级拿到满血,
--    Redis 一丢就被夺回去,而系统认为一切正常(anchor 有效、used 有据)。
--    ResetBaselineOnUpgrade 那一整套 refill_pending + reconciler 补偿正是为了保证满血兑现,
--    没有 tombstone 的恢复路径会从背后把它撤销。
--
-- ④ **version 是 per-user 单调序号,顺序判据只看它,不看 anchor 大小。**
--    anchor **不单调**:reset 是变大、两个 DEL 是「变没」。照抄 agentbridge 水位持久化那套
--    「取 max」会把 DEL 判成「更旧」而丢弃。四个 mutator 之间没有任何顺序保证,
--    必须靠显式版本号做「最新者胜」。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `user_quota_windows` (
  `user_id`   bigint unsigned NOT NULL COMMENT '归属用户',
  `anchor_at` bigint NOT NULL COMMENT '窗口起点(unix 秒;与 Redis quota:anchor 同一表示,刻意不转 DATETIME)',
  `version`   bigint NOT NULL DEFAULT '0' COMMENT 'per-user 单调序号;乱序写入靠它判新旧(anchor 不单调,不能比大小)',
  `state`     varchar(16) NOT NULL DEFAULT 'open' COMMENT 'open=在飞 | voided=已作废(升级满血/降级对齐 DEL 了 anchor)',
  `window_used_micro` bigint NOT NULL DEFAULT '0' COMMENT '窗口内累计真实成本(微元)绝对值快照,来源=Redis INCRBY 返回值;GREATEST 合并,单调不减',
  `used_synced_at` datetime DEFAULT NULL COMMENT 'used 快照上次落库时刻(判新鲜度 / flusher 是否卡死)',
  `window_sec`    int    NOT NULL DEFAULT '0' COMMENT '开窗时的窗口长度快照。⚠️ 纯审计 —— 恢复判到期一律用**当前配置**,与线上语义一致(anchorRollLua 会给在飞 anchor 续 TTL,admin 调大 window_days 会延长在飞窗口)',
  `tier`          varchar(16) NOT NULL DEFAULT '' COMMENT '开窗时生效档位快照;纯审计',
  `open_reason`   varchar(16) NOT NULL DEFAULT '' COMMENT 'usage=首次消耗/到期换锚 | reset=手动重置。⚠️ 只有这两个值 —— 恢复(从本表回灌 Redis)刻意**不改写**本列:那会抹掉窗口最初是怎么开的这一事实,而恢复事件本身已由 slog.Warn "从 MySQL 兜底副本恢复了额度窗口" 记录',
  `voided_reason` varchar(16) NOT NULL DEFAULT '' COMMENT 'upgrade=升级满血 | downgrade=到期/撤销降级对齐',
  `voided_at`     datetime DEFAULT NULL COMMENT '作废时刻;非 NULL 时恢复一律按「无窗口」处理',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`anchor_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='额度窗口持久化副本 —— Redis 为活窗唯一权威,本表是灾难恢复用的兜底副本(0103)';
