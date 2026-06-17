// 冒烟:对 smart-search 发一条真问题,验证 agent(DeepSeek)真能回 + 调用 minicod 检索。
// 用法: SCHOLAY_EMAIL=.. SCHOLAY_PASS=.. node scripts/agent-test/smoke.mjs
import { login, askOnce, fmt } from './lib.mjs'

const email = process.env.SCHOLAY_EMAIL || 'p0test_smart@test.local'
const pass = process.env.SCHOLAY_PASS || 'P0test123!'

const token = await login(email, pass)
console.log('login OK, token len', token.length)

const t0 = Date.now()
const r = await askOnce('smart-search', token,
  '帮我找几篇关于 transformer 注意力机制的代表性论文,并简要说明各自贡献', { timeoutMs: 180000 })
console.log(fmt('smart-search smoke', r))
console.log('elapsed', ((Date.now() - t0) / 1000).toFixed(1) + 's')
console.log('--- text head ---')
console.log(r.text.slice(0, 600))
process.exit(r.error ? 1 : 0)
