// 内容安全预检 —— UGC 发送前调用后端 msgSecCheck 代理。
// 后端 fail-open:服务不可用一律 pass:true。前端出错也放行(不因网络抖动拦正常用户)。
import { request } from './request'

interface CheckResp {
  pass: boolean
  suggest?: string
}

// 返回 true=可发送;false=命中违规,应拦下。
export async function checkText(content: string): Promise<boolean> {
  const t = content.trim()
  if (!t) return true
  try {
    const r = await request<CheckResp>({
      url: '/user/wechat/msg-check',
      method: 'POST',
      data: { content: t },
    })
    return r.pass !== false
  } catch {
    return true // fail-open
  }
}
