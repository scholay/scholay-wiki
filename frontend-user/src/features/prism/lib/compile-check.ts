/**
 * 「系统自动编译检查」轮的标记。
 *
 * 诉求:agent 写完后自动编译来**检查文档正确性**,编译不通过时自动回喂报错让它修——但这一轮
 * **不该显示成用户提问**(不是用户代替发问)。做法:回喂给 agent 的修复指令带此前缀,agent 照常
 * 收到完整报错去修;前端在**渲染层**识别前缀,把这一轮的用户侧折成「系统 · 自动编译检查」小条,
 * 而不是用户气泡。前缀是可见文本(也进历史 transcript),即便渲染兜底也只会显示成一条系统说明,
 * 不会露成裸提问。实时(pendingTurns.userText)与历史(replay 的 userText)都经同一渲染器,故一致。
 */
export { COMPILE_CHECK_PREFIX, isCompileCheckText } from '@/shared/lib/prism-compile-check';
