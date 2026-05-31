// 注意:上游 agent runtime 源码里的 `import { feature } from 'bun:bundle'` 已经通过 sed
// 批量替换为 `from 'bundle-feature'`,后者通过 tsconfig.json 的 paths 解析到
// stubs/bun-bundle.ts。这一步是因为 Bun 把 `bun:` 前缀当作内置 namespace 直通,
// 无法被 tsconfig paths 或 Bun.plugin 拦截。

const version = process.env.CLAUDE_CODE_LOCAL_VERSION ?? '999.0.0-local'
const packageUrl = process.env.CLAUDE_CODE_LOCAL_PACKAGE_URL ?? 'paper-reviewer'
const buildTime = process.env.CLAUDE_CODE_LOCAL_BUILD_TIME ?? new Date().toISOString()

process.env.CLAUDE_CODE_LOCAL_SKIP_REMOTE_PREFETCH ??= '1'

Object.assign(globalThis, {
  MACRO: {
    VERSION: version,
    PACKAGE_URL: packageUrl,
    NATIVE_PACKAGE_URL: packageUrl,
    BUILD_TIME: buildTime,
    FEEDBACK_CHANNEL: 'local',
    VERSION_CHANGELOG: '',
    ISSUES_EXPLAINER: '',
  },
})

// Switch to the current workspace
if (process.env.CALLER_DIR) {
  process.chdir(process.env.CALLER_DIR)
}
