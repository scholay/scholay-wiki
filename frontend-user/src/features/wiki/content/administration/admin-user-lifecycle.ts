import type { WikiArticle } from "../../types";

export const AdminUserLifecycleArticle: WikiArticle = {
  slug: "admin-user-lifecycle",
  title: "用户冻结、删除与角色变更",
  summary: "后台账号状态变更、令牌撤销和角色委派的高风险操作规则。",
  category: "administration",
  kind: "rule",
  status: "current",
  audience: ["管理员", "安全人员", "客服"],
  aliases: ["冻结用户", "删除用户", "角色分配"],
  sourcePaths: [
    "frontend-user/src/features/admin/components/UserActionsDrawer.tsx",
    "frontend-user/src/features/admin/pages/UsersPage.tsx",
    "backend/internal/user/handler_admin_ops.go",
    "backend/internal/user/repository.go",
    "backend/internal/admin/service.go",
  ],
  related: ["admin-access-control", "admin-user-directory"],
  sections: [
    {
      id: "freeze",
      title: "冻结与解冻",
      markdown: `从用户详情打开高风险操作面板，可以按权限冻结、解冻、删除账号或调整角色；下图展示的是这些动作及确认提示的代表状态。执行冻结前请核对用户 ID，并填写原因。

users.manage 可冻结普通账号，原因要求 1–255 个字符；admin 和 super_admin 不能通过该操作冻结。冻结会把状态改为 frozen 并撤销全部访问令牌；解冻只恢复账号状态，旧令牌不会复活，用户需要重新登录。`,
      embeds: [{ id: "admin-user-lifecycle" }],
    },
    {
      id: "delete",
      title: "删除",
      markdown: `删除要求输入 DELETE 确认，属于不可逆业务操作。后端显式清理或级联清理用户关联数据；列表批量删除只提交已选择的用户，不会隐式覆盖后续分页。执行前应先核对用户 ID，而不能只凭易变的昵称判断。`,
      blocks: [
        { type: "markdown" },
        {
          type: "tip",
          tip: {
            text: "DELETE 只是最终确认词，不是安全检查。粘贴前再次核对用户 ID、数据保留要求和恢复方案；删除完成后无法从后台撤销。",
          },
        },
      ],
    },
    {
      id: "role",
      title: "角色委派",
      markdown: `只有 super_admin 具备 users.role.assign。可将目标设为 user、operations 或 admin，但不能授予 super_admin，也不能修改另一个 super_admin；提交后立即生效，应结合最小权限原则使用。`,
      blocks: [
        { type: "markdown" },
        {
          type: "tip",
          tip: {
            text: "角色变更提交后立即生效。授权前按最小权限核对目标角色，变更后重新检查后台可见范围。",
          },
        },
      ],
    },
  ],
};
