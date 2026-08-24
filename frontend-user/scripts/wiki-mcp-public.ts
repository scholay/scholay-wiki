const namedInternalPaths = new Map<string, string>([
  ["scripts/lint-writing-skills.py", "写作技能检查脚本"],
  ["docker/mysql/migrations", "数据库迁移目录"],
  ["frontend-user/src/styles/globals.css", "Web 全局样式入口"],
  ["miniprogram/app.wxss", "小程序全局样式入口"],
  ["miniprogram/README", "小程序历史说明"],
  ["agent/README", "Agent 历史说明"],
  ["CLAUDE.md", "仓库开发说明"],
]);

const repositoryPathPattern =
  /(^|[\s`"'（(：:，,。；;])(?:frontend-user|frontend-admin|backend|agent|miniprogram|docs|scripts|docker|src|\.github)\/[a-zA-Z0-9_.:/-]+/g;
const localAbsolutePathPattern =
  /\/Users\/[^\s，。；：、）)>\]}`]+|[a-zA-Z]:\\[^\s，。；：、）)>\]}`]+/g;

/**
 * Wiki 正文可以讨论实现事实，但公开 MCP 不应暴露工作站绝对路径或仓库文件位置。
 * 精确名称先换成有语义的产品描述，未来新出现的内部路径再由通用兜底收口。
 */
export function sanitizeWikiMCPText(value: string): string {
  let sanitized = value;
  for (const [internalPath, publicLabel] of namedInternalPaths) {
    sanitized = sanitized.replaceAll(internalPath, publicLabel);
  }
  return sanitized
    .replace(localAbsolutePathPattern, "仓库外本地文件")
    .replace(
      repositoryPathPattern,
      (_match, prefix: string) => `${prefix}内部实现位置`,
    );
}

export function sanitizeWikiMCPValue<T>(value: T): T {
  if (typeof value === "string") {
    return sanitizeWikiMCPText(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeWikiMCPValue(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sanitizeWikiMCPValue(item),
      ]),
    ) as T;
  }
  return value;
}
