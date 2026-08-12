import type { ReactNode } from "react";
import { Bell, Boxes, DatabaseZap, Flame, Sparkles } from "lucide-react";
import {
  AdminMockBadge,
  AdminMockButton,
  AdminMockPage,
  AdminMockTabs,
} from "./WikiEmbedAdminShared";

/** 公告类型、受众、排期与派生状态 · 纯样式 fixture。 */
export function WikiEmbedAdminAnnouncements() {
  return (
    <AdminMockPage
      fixture="admin-announcements"
      title="公告"
      description="共 3 条 · 发布站内公告 / 全局横幅"
      actions={<AdminMockButton>＋ 新建公告</AdminMockButton>}
    >
      <div className="overflow-hidden rounded-8 border border-border bg-background">
        <div className="grid grid-cols-[minmax(240px,1fr)_80px_80px_200px_100px] border-b border-border bg-surface-1 text-12 font-medium text-faint">
          {["标题", "等级", "状态", "时段", ""].map((label) => (
            <span key={label} className="flex h-9 items-center px-3">
              {label}
            </span>
          ))}
        </div>
        {[
          {
            title: "暑期科研写作服务安排",
            severity: "提示",
            status: "已发布",
            period: "2026-08-12 → 2026-08-20",
            tone: "green" as const,
          },
          {
            title: "支付渠道维护提醒",
            severity: "警告",
            status: "草稿",
            period: "2026-08-16 → 长期",
            tone: "amber" as const,
          },
          {
            title: "旧版功能下线说明",
            severity: "严重",
            status: "草稿",
            period: "2026-07-01 → 2026-07-15",
            tone: "red" as const,
          },
        ].map((row, index) => (
          <div
            key={row.title}
            className={`grid min-w-3xl grid-cols-[minmax(240px,1fr)_80px_80px_200px_100px] ${index < 2 ? "border-b border-border-hairline" : ""}`}
          >
            <span className="flex h-12 items-center px-3 text-16 font-medium text-foreground">
              {row.title}
            </span>
            <span className="flex h-12 items-center px-3">
              <AdminMockBadge tone={row.tone}>{row.severity}</AdminMockBadge>
            </span>
            <span className="flex h-12 items-center px-3">
              <AdminMockBadge
                tone={row.status === "已发布" ? "green" : "neutral"}
              >
                {row.status}
              </AdminMockBadge>
            </span>
            <span className="flex h-12 items-center px-3 text-14 text-muted-foreground">
              {row.period}
            </span>
            <span className="flex h-12 items-center justify-end gap-1 px-3 text-faint">
              <span className="inline-flex size-7 items-center justify-center">
                ✎
              </span>
              <span className="inline-flex size-7 items-center justify-center text-brand-red">
                ×
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-8 border border-brand-amber/30 bg-brand-amber-soft px-3 py-2 text-14 leading-paragraph text-muted-foreground">
        保存并启用公告只更新后台记录；当前没有用户侧公开读取路由。
      </div>
    </AdminMockPage>
  );
}

/** 热搜词、热门论文与数据保留策略 · 纯样式 fixture。 */
export function WikiEmbedAdminHotContent() {
  return (
    <AdminMockPage
      fixture="admin-hot-content"
      title="热门内容"
      description="最近更新：2026-08-12 10:20"
      actions={<AdminMockButton tone="outline">清理过期</AdminMockButton>}
    >
      <section className="mb-6 grid grid-cols-2 gap-4">
        <ContentKpi
          icon={<Flame className="size-4" />}
          label="热搜词条数"
          value="1,286"
        />
        <ContentKpi
          icon={<Boxes className="size-4" />}
          label="热门论文数"
          value="842"
        />
      </section>
      <section className="mb-6 rounded-8 border border-border bg-background p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-16 font-medium text-foreground">
              数据保留策略
            </h3>
            <p className="mt-1 text-12 text-faint">
              删除过期搜索明细，保留聚合计数与论文内容信号。
            </p>
          </div>
          <AdminMockButton tone="outline">保存策略</AdminMockButton>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <ContentField label="搜索明细保留" value="90 天" width="w-32" />
          <ContentField label="曝光 / 点击保留" value="365 天" width="w-32" />
        </div>
      </section>
      <AdminMockTabs items={["热门搜索词", "热门论文"]} active="热门搜索词" />
      <div className="mb-3 mt-4 flex gap-1">
        {["全部", "文献", "期刊"].map((label) => (
          <span
            key={label}
            className={`inline-flex h-8 items-center rounded-8 border px-3 text-14 ${label === "全部" ? "border-foreground bg-foreground text-on-dark" : "border-border bg-background text-foreground"}`}
          >
            {label}
          </span>
        ))}
      </div>
      <ContentTable
        columns={["关键词", "类型", "搜索次数", "最近搜索"]}
        template="minmax(260px,1fr) 100px 120px 160px"
        minWidth={700}
        rows={[
          [
            "diffusion model",
            <AdminMockBadge key="type">文献</AdminMockBadge>,
            "12,840",
            "2026-08-12 10:18",
          ],
          [
            "protein structure",
            <AdminMockBadge key="type">文献</AdminMockBadge>,
            "9,210",
            "2026-08-12 09:42",
          ],
          [
            "Nature Machine Intelligence",
            <AdminMockBadge key="type" tone="green">
              期刊
            </AdminMockBadge>,
            "7,860",
            "2026-08-11 23:16",
          ],
        ]}
      />
      <p className="mt-4 text-14 leading-paragraph text-muted-foreground">
        历史 view_count 不再更新；当前浏览信号应看 impression、click 与
        seo_view。
      </p>
    </AdminMockPage>
  );
}

/** 期刊上游抓取、暂存、资格筛选与发布状态机 · 纯样式 fixture。 */
export function WikiEmbedAdminJournalSync() {
  return (
    <AdminMockPage
      fixture="admin-journal-sync"
      title="期刊数据同步"
      description="上游全量摄取（staged）→ 按 tier 分批发布（published）→ 可整批回滚 · 同步中每 5 秒自动刷新"
    >
      <div className="max-w-5xl space-y-4">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ContentKpi
            label="上游总量"
            value="38,420"
            note="构建于 2026-08-12 08:00"
          />
          <ContentKpi label="本地收录" value="34,806" note="staged 6,120" />
          <ContentKpi
            label="已发布"
            value="28,686"
            note="进 sitemap / 可被索引"
          />
          <ContentKpi
            label="资格达标（staged）"
            value="1,842"
            note="满足门槛、待发布"
          />
        </section>

        <section className="rounded-8 border border-border bg-background px-4 py-3">
          <h3 className="text-12 font-medium text-faint">
            价值分层分布（value_tier）
          </h3>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-14">
            {[
              ["S", "286"],
              ["A", "1,556"],
              ["B", "4,278"],
              ["C", "8,420"],
              ["D", "20,266"],
            ].map(([tier, value]) => (
              <span key={tier} className="inline-flex items-baseline gap-1">
                <span className="text-muted-foreground">Tier {tier}</span>
                <span className="font-medium tabular-nums text-foreground">
                  {value}
                </span>
              </span>
            ))}
          </div>
        </section>

        <section className="rounded-8 border border-border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-16 font-medium text-foreground">
                <DatabaseZap className="size-4" />
                同步控制
              </h3>
              <p className="mt-1 text-12 text-faint">
                从上游继续全量摄取，先写入 staged，不直接公开。
              </p>
            </div>
            <AdminMockButton>开始同步</AdminMockButton>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <ContentField label="任务状态" value="空闲" />
            <ContentField label="每批条数" value="2,000" />
            <ContentField label="续跑游标" value="34,806" />
          </div>
        </section>

        <section className="rounded-8 border border-border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-16 font-medium text-foreground">发布控制</h3>
              <p className="mt-1 text-12 text-faint">
                只放行资格达标的 staged 记录；生成批次用于整批回滚。
              </p>
            </div>
            <AdminMockButton tone="outline">发布 1,200 条</AdminMockButton>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <ContentField label="最高价值层级" value="Tier A" width="w-32" />
            <ContentField label="发布数量" value="1,200" width="w-32" />
            <ContentField label="当前可发布" value="1,842" width="w-32" />
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-16 font-medium text-foreground">批次历史</h3>
          <ContentTable
            columns={["批次", "类型", "结果", "状态", "时间", "操作"]}
            template="180px 110px minmax(260px,1fr) 100px 160px 110px"
            minWidth={920}
            rows={[
              [
                "SYNC-20260812-01",
                "同步",
                "抓取 2,000 · 暂存 1,986 · 跳过 14",
                <AdminMockBadge key="status" tone="green">
                  已完成
                </AdminMockBadge>,
                "2026-08-12 10:20",
                "查看",
              ],
              [
                "PUBLISH-20260811-04",
                "发布",
                "Tier S / A · 发布 1,200 · sitemap 已更新",
                <AdminMockBadge key="status" tone="green">
                  已发布
                </AdminMockBadge>,
                "2026-08-11 18:42",
                "回滚",
              ],
              [
                "SYNC-20260810-03",
                "同步",
                "上游限流后取消 · 已暂存数据保留",
                <AdminMockBadge key="status">已取消</AdminMockBadge>,
                "2026-08-10 14:06",
                "查看",
              ],
            ]}
          />
        </section>
        <p className="text-14 leading-paragraph text-muted-foreground">
          同一时间只允许一个 running 或 paused 任务；取消不会清除已暂存的数据。
        </p>
      </div>
    </AdminMockPage>
  );
}

/** 功能工具目录、批量导入任务与 Webhook 投递 · 纯样式 fixture。 */
export function WikiEmbedAdminToolOperations() {
  return (
    <AdminMockPage
      fixture="admin-tool-operations"
      title="功能广场"
      description="学术工具黄页 · 共 286 个"
      actions={
        <>
          <AdminMockButton tone="outline">Webhook</AdminMockButton>
          <AdminMockButton>导入工具</AdminMockButton>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <span className="flex h-9 w-full items-center rounded-8 border border-border bg-background px-3 text-14 text-faint sm:max-w-xs">
          搜索名称…
        </span>
        <ContentField value="全部分类" width="w-48" />
        <ContentField value="全部状态" width="w-32" />
        <ContentField value="全部 SEO 状态" width="w-36" />
      </div>
      <ContentTable
        columns={["工具", "分类", "状态", "SEO", "排序", "更新时间", "操作"]}
        template="minmax(260px,1fr) 130px 100px 120px 80px 160px 110px"
        minWidth={960}
        rows={[
          [
            <div key="tool">
              <p className="text-16 font-medium text-foreground">
                Research Figure Cleaner
              </p>
              <p className="font-mono text-12 text-faint">
                figure-cleaner · source_topic_id 8421
              </p>
            </div>,
            "图像处理",
            <AdminMockBadge key="status" tone="green">
              已上线
            </AdminMockBadge>,
            <AdminMockBadge key="seo" tone="green">
              允许收录
            </AdminMockBadge>,
            "10",
            "2026-08-12 09:48",
            "↗　✎　×",
          ],
          [
            <div key="tool">
              <p className="text-16 font-medium text-foreground">
                Reference Style Checker
              </p>
              <p className="font-mono text-12 text-faint">citation-checker</p>
            </div>,
            "写作工具",
            <AdminMockBadge key="status" tone="amber">
              待审
            </AdminMockBadge>,
            <AdminMockBadge key="seo" tone="amber">
              待审核
            </AdminMockBadge>,
            "20",
            "2026-08-11 16:20",
            "↗　✎　×",
          ],
          [
            <div key="tool">
              <p className="text-16 font-medium text-foreground">
                Legacy PDF Converter
              </p>
              <p className="font-mono text-12 text-faint">pdf-converter-v1</p>
            </div>,
            "文档工具",
            <AdminMockBadge key="status">归档</AdminMockBadge>,
            <AdminMockBadge key="seo">不收录</AdminMockBadge>,
            "90",
            "2026-08-08 11:06",
            "↗　✎　×",
          ],
        ]}
      />
      <div className="mt-4 flex items-center justify-center gap-3 text-14 text-faint">
        <span className="rounded-8 border border-border px-3 py-2">上一页</span>
        <span>第 1 / 15 页</span>
        <span className="rounded-8 border border-border px-3 py-2">下一页</span>
      </div>
      <p className="mt-4 text-14 leading-paragraph text-muted-foreground">
        批量导入、任务记录与 Webhook
        是独立路由；这里保留功能广场目录首屏，不把这些互斥页面拼进同一截图。
      </p>
    </AdminMockPage>
  );
}

/** 社区 Skill 审核队列、举报与强制下架 · 纯样式 fixture。 */
export function WikiEmbedAdminSkillModeration() {
  return (
    <AdminMockPage
      fixture="admin-skill-moderation"
      title="Skill 审核"
      description="用户上传的技能是不可信内容；审核只是降噪层，真正隔离靠运行时"
      tabs={
        <div className="flex flex-wrap gap-1">
          {[
            ["待审核", "2"],
            ["已通过", "84"],
            ["已拒绝", "12"],
            ["已下架", "3"],
          ].map(([label, count]) => (
            <span
              key={label}
              className={`inline-flex h-8 items-center gap-2 rounded-8 border px-3 text-14 ${label === "待审核" ? "border-foreground bg-foreground text-on-dark" : "border-border bg-background text-foreground"}`}
            >
              {label}
              <span className="tabular-nums opacity-70">{count}</span>
            </span>
          ))}
        </div>
      }
    >
      <ContentTable
        columns={["Skill", "作者", "版本", "提交说明", "提交时间", "操作"]}
        template="minmax(240px,1fr) 150px 90px minmax(220px,1fr) 150px 210px"
        minWidth={1050}
        rows={[
          [
            <div key="skill">
              <p className="text-16 font-medium text-foreground">
                Systematic Review Assistant
              </p>
              <p className="font-mono text-12 text-faint">
                systematic-review-assistant
              </p>
            </div>,
            "林晓舟 · ID 28461",
            "v1.4.0",
            "SKILL.md 已解析 · 2 个外部链接",
            "2026-08-12 09:52",
            <div key="actions" className="flex gap-2">
              <AdminMockButton>通过</AdminMockButton>
              <AdminMockButton tone="outline">拒绝</AdminMockButton>
            </div>,
          ],
          [
            <div key="skill">
              <p className="text-16 font-medium text-foreground">
                LaTeX Table Formatter
              </p>
              <p className="font-mono text-12 text-faint">
                latex-table-formatter
              </p>
            </div>,
            "周奕辰 · ID 28177",
            "v2.1.1",
            "公开版本更新后重新提交",
            "2026-08-12 08:18",
            <div key="actions" className="flex gap-2">
              <AdminMockButton>通过</AdminMockButton>
              <AdminMockButton tone="outline">拒绝</AdminMockButton>
            </div>,
          ],
        ]}
      />

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-16 font-medium text-foreground">待处理举报</h3>
            <p className="mt-1 text-12 text-faint">
              举报不自动改变审核状态，需要人工结案。
            </p>
          </div>
          <AdminMockBadge tone="red">3 条</AdminMockBadge>
        </div>
        <ContentTable
          columns={["Skill", "举报原因", "举报人", "时间", "操作"]}
          template="minmax(220px,1fr) minmax(260px,1fr) 140px 150px 190px"
          minWidth={900}
          rows={[
            [
              "Dataset Downloader",
              "涉及权限诱导与未知外部下载地址",
              "用户 ID 27602",
              "2026-08-11 18:06",
              <div key="actions" className="flex gap-2">
                <AdminMockButton tone="outline">驳回举报</AdminMockButton>
                <AdminMockButton>下架</AdminMockButton>
              </div>,
            ],
          ]}
        />
      </section>
      <div className="mt-4 rounded-8 border border-brand-amber/30 bg-brand-amber-soft px-3 py-2 text-14 leading-paragraph text-muted-foreground">
        强制下架需要填写审核意见并再次确认；人工审核不能替代运行时隔离。
      </div>
    </AdminMockPage>
  );
}

/** 站内消息草稿、定向范围与不可逆发送 · 纯样式 fixture。 */
export function WikiEmbedAdminMessaging() {
  return (
    <AdminMockPage
      fixture="admin-messaging"
      title="站内消息"
      description="共 86 条 · 创建草稿 → 发送给全体 / 会员等级 / 指定用户"
      tabs={
        <div className="flex flex-wrap gap-1">
          {["全部", "草稿", "发送中", "已发送", "失败"].map((label) => (
            <span
              key={label}
              className={`inline-flex h-8 items-center rounded-8 border px-3 text-14 ${label === "全部" ? "border-foreground bg-foreground text-on-dark" : "border-border bg-background text-foreground"}`}
            >
              {label}
            </span>
          ))}
        </div>
      }
      actions={<AdminMockButton>＋ 新建消息</AdminMockButton>}
    >
      <ContentTable
        columns={[
          "标题 / 正文",
          "类别",
          "发送范围",
          "状态",
          "创建时间",
          "发送时间",
          "操作",
        ]}
        template="minmax(280px,1fr) 110px 170px 100px 150px 150px 100px"
        minWidth={1060}
        rows={[
          [
            <div key="message">
              <p className="text-16 font-medium text-foreground">
                本周服务更新说明
              </p>
              <p className="line-clamp-1 text-12 text-faint">
                本周将更新智能检索和写作服务，使用期间无需退出账号…
              </p>
            </div>,
            <AdminMockBadge key="type">system</AdminMockBadge>,
            "全体用户",
            <AdminMockBadge key="status" tone="amber">
              草稿
            </AdminMockBadge>,
            "2026-08-12 09:20",
            "—",
            <AdminMockButton key="send" tone="outline">
              发送
            </AdminMockButton>,
          ],
          [
            <div key="message">
              <p className="text-16 font-medium text-foreground">
                Pro 会员功能提醒
              </p>
              <p className="line-clamp-1 text-12 text-faint">
                新的智能写作模板已向 Pro 与 Max 用户开放…
              </p>
            </div>,
            <AdminMockBadge key="type" tone="red">
              promotion
            </AdminMockBadge>,
            "指定会员等级 · 286 人",
            <AdminMockBadge key="status" tone="green">
              已发送
            </AdminMockBadge>,
            "2026-08-11 15:04",
            "2026-08-11 16:00",
            "查看",
          ],
          [
            <div key="message">
              <p className="text-16 font-medium text-foreground">
                退款到账通知
              </p>
              <p className="line-clamp-1 text-12 text-faint">
                订单退款已完成，请留意原支付渠道到账状态…
              </p>
            </div>,
            <AdminMockBadge key="type">transaction</AdminMockBadge>,
            "指定用户 · ID 27602",
            <AdminMockBadge key="status" tone="green">
              已发送
            </AdminMockBadge>,
            "2026-08-10 11:42",
            "2026-08-10 11:43",
            "查看",
          ],
        ]}
      />
      <div className="mt-4 flex items-center justify-between text-14 text-muted-foreground">
        <span>1–20 / 共 86 条</span>
        <span>第 1 / 5 页 · 下一页 →</span>
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-8 border border-brand-amber/30 bg-brand-amber-soft px-3 py-2 text-14 leading-paragraph text-muted-foreground">
        <Bell className="mt-1 size-4 shrink-0 text-brand-amber" />
        发送会同步推进为不可逆状态。按会员等级定向时，发送前会解析为明确用户集合；历史
        by_plan 字段不能当成可靠投递结果。
      </div>
    </AdminMockPage>
  );
}

/** 邀请活动与推广弹窗的两个独立配置面 · 纯样式 fixture。 */
export function WikiEmbedAdminCampaignsPromo() {
  return (
    <AdminMockPage
      fixture="admin-campaigns-promo"
      title="活动管理"
      description="管理邀请有礼与限时会员推广，各活动独立开关、独立配置"
      tabs={
        <AdminMockTabs items={["邀请有礼", "限时领取会员"]} active="邀请有礼" />
      }
    >
      <div className="flex max-w-3xl flex-col gap-4">
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-8 border border-border bg-background p-4">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-6 w-11 rounded-pill bg-brand-green">
              <span className="absolute right-1 top-1 size-4 rounded-pill bg-background" />
            </span>
            <div>
              <p className="text-16 font-medium text-foreground">
                邀请活动总开关
              </p>
              <p className="mt-1 text-12 text-faint">
                已开启：用户端顶栏、设置与注册归因入口可见
              </p>
            </div>
          </div>
          <AdminMockButton>保存配置</AdminMockButton>
        </section>

        <CampaignSection
          icon={<Sparkles className="size-4" />}
          title="注册关联礼"
          description="好友在绑定时窗内确认邀请人后，双方分别入账。"
          fields={[
            ["邀请人注册礼", "100 经费"],
            ["被邀请人注册礼", "50 经费"],
            ["每日奖励上限", "10 人 / 邀请人"],
            ["允许绑定时窗", "30 天"],
          ]}
        />
        <CampaignSection
          icon={<Sparkles className="size-4" />}
          title="首次付费返利"
          description="首单时窗独立于绑定时窗，从被邀请人注册时起计算。"
          fields={[
            ["首单返利比例", "5%"],
            ["首单有效时窗", "30 天"],
            ["邀请码帮助链接", "https://www.scholay.com/help/invite"],
          ]}
        />
        <section className="rounded-8 border border-border bg-background p-4">
          <h3 className="text-16 font-medium text-foreground">当前活动概况</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <ContentKpi label="已绑定关系" value="1,842" note="累计" />
            <ContentKpi label="本月注册奖励" value="86,400" note="经费" />
            <ContentKpi label="本月首单返利" value="¥3,280" note="已结算" />
          </div>
        </section>
        <div className="rounded-8 border border-brand-amber/30 bg-brand-amber-soft px-3 py-2 text-14 leading-paragraph text-muted-foreground">
          本图只展示具备 config.manage 权限时的“邀请有礼”状态。operations
          只会看到“限时领取会员”；关闭邀请会停止新绑定，但既有奖励承诺继续履约。
        </div>
      </div>
    </AdminMockPage>
  );
}

function ContentKpi({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note?: string;
  icon?: ReactNode;
}) {
  return (
    <section className="rounded-8 border border-border bg-background p-4">
      <div className="flex items-center justify-between text-faint">
        <span className="text-14">{label}</span>
        {icon}
      </div>
      <p className="mt-2 text-32 font-medium tabular-nums text-foreground">
        {value}
      </p>
      {note ? (
        <p className="mt-1 text-12 text-muted-foreground">{note}</p>
      ) : null}
    </section>
  );
}

function ContentField({
  label,
  value,
  width = "w-full",
}: {
  label?: string;
  value: string;
  width?: string;
}) {
  return (
    <div>
      {label ? <p className="mb-1 text-12 text-faint">{label}</p> : null}
      <span
        className={`flex h-9 items-center rounded-8 border border-border bg-background px-3 text-14 text-foreground ${width}`}
      >
        {value}
      </span>
    </div>
  );
}

function ContentTable({
  columns,
  template,
  minWidth,
  rows,
}: {
  columns: readonly string[];
  template: string;
  minWidth: number;
  rows: readonly (readonly ReactNode[])[];
}) {
  return (
    <div className="overflow-x-auto rounded-8 border border-border bg-background">
      <div
        className="grid border-b border-border bg-surface-1 text-12 font-medium text-faint"
        style={{ gridTemplateColumns: template, minWidth }}
      >
        {columns.map((column) => (
          <span key={column} className="flex h-9 items-center px-3">
            {column}
          </span>
        ))}
      </div>
      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className={`grid ${rowIndex < rows.length - 1 ? "border-b border-border-hairline" : ""}`}
          style={{ gridTemplateColumns: template, minWidth }}
        >
          {row.map((cell, cellIndex) => (
            <div
              key={cellIndex}
              className="flex min-h-12 min-w-0 items-center px-3 text-14 text-muted-foreground"
            >
              {cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CampaignSection({
  icon,
  title,
  description,
  fields,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  fields: readonly (readonly [string, string])[];
}) {
  return (
    <section className="rounded-8 border border-border bg-background p-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-brand-red">{icon}</span>
        <div>
          <h3 className="text-16 font-medium text-foreground">{title}</h3>
          <p className="mt-1 text-12 text-faint">{description}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <ContentField key={label} label={label} value={value} />
        ))}
      </div>
    </section>
  );
}
