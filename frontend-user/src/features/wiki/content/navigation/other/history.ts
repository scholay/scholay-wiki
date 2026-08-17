import type { WikiNavNode } from "../../../types";
import { primary } from "../targets";

export const historyNode: WikiNavNode = {
  id: "other-history",
  title: "历史与兼容",
  children: [
    {
      id: "other-history-tools-coldstart",
      title: "学术工具目录冷启动与下载治理",
      target: primary("feature-tools-coldstart-governance"),
    },
    {
      id: "other-history-backup",
      title: "备份、恢复与故障证据边界",
      target: primary("backup-and-restore-boundary"),
    },
    {
      id: "other-history-design-source",
      title: "设计真相源与历史交互资料",
      target: primary("design-source-of-truth"),
    },
    {
      id: "other-history-coupons",
      title: "优惠券系统（遗留）",
      target: primary("coupon-system-legacy"),
    },
    {
      id: "other-history-checkin",
      title: "任务中心与签到",
      target: primary("task-center-and-checkin"),
    },
    {
      id: "other-history-components",
      title: "已下线与兼容组件",
      target: primary("legacy-components"),
    },
  ],
};
