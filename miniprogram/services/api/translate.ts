// AI 论文翻译(流式)—— 小程序无 EventSource,用 wx.request({enableChunked}) + onChunkReceived
// 消费后端的 text/event-stream(端点不改)。逐 chunk 拿 ArrayBuffer,按 \n\n 切 SSE 帧,
// 累加 choices[0].delta.content,收到 [DONE] 后正则解析 <title_zh>/<abstract_zh>/<tldr_zh>。
import { getToken } from '../../store/auth'
import { ApiError, authedUrl, authHeader, handleAuthFailure } from '../request'

export interface TranslateBody {
  title?: string
  abstract?: string
  tldr?: string
}
export interface TranslateResult {
  title: string
  abstract: string
  tldr: string
}

// 手写 UTF-8 解码(小程序无稳定 TextDecoder);只对「完整帧字节」解码,不会遇到半个多字节字符。
function utf8Decode(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  while (i < bytes.length) {
    const b = bytes[i]
    if (b < 0x80) {
      out += String.fromCharCode(b)
      i += 1
    } else if (b >= 0xc0 && b < 0xe0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f))
      i += 2
    } else if (b >= 0xe0 && b < 0xf0) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f))
      i += 3
    } else {
      const cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f)
      const c = cp - 0x10000
      out += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff))
      i += 4
    }
  }
  return out
}

// 在字节流里找 \n\n(0x0A 0x0A)—— SSE 帧分隔。
function findFrameEnd(bytes: Uint8Array): number {
  for (let i = 0; i + 1 < bytes.length; i++) {
    if (bytes[i] === 0x0a && bytes[i + 1] === 0x0a) return i
  }
  return -1
}

function stripTags(c: string): string {
  return c.replace(/<\/?[a-z_]+>/gi, '\n').replace(/\n{2,}/g, '\n').trim()
}
function parseResult(c: string): TranslateResult {
  const g = (tag: string): string => {
    const m = c.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>'))
    return m ? m[1].trim() : ''
  }
  return { title: g('title_zh'), abstract: g('abstract_zh'), tldr: g('tldr_zh') }
}

// onProgress:流式过程中的「译文预览」(去标签的累加文本),用于「翻译中…」体感。
export function translatePaper(body: TranslateBody, onProgress: (preview: string) => void): Promise<TranslateResult> {
  return new Promise<TranslateResult>((resolve, reject) => {
    const token = getToken()
    if (!token) {
      reject(new ApiError(401, '请先登录', 401))
      return
    }
    let content = ''
    let bytes = new Uint8Array(0)
    let finished = false
    let errored = false

    // 预览合帧节流(性能审计 #4):旧逻辑每个 SSE token 都对累计全文跑 stripTags(两个全局正则)+ 整串 setData,
    // ~30/s 低配机明显卡顿。改成 ~140ms(与 agent-socket FLUSH_MS 同款)攒一次:仍逐 token 累加,但 stripTags+
    // 派发降到 ~7/s。最终 parseResult 用完整 content,与预览无关。
    const PREVIEW_MS = 140
    let previewTimer: ReturnType<typeof setTimeout> | null = null
    let previewDirty = false
    const emitPreview = () => {
      previewTimer = null
      if (!previewDirty) return
      previewDirty = false
      onProgress(stripTags(content))
    }
    const schedulePreview = () => {
      previewDirty = true
      if (previewTimer === null) previewTimer = setTimeout(emitPreview, PREVIEW_MS)
    }
    const clearPreview = () => {
      if (previewTimer !== null) {
        clearTimeout(previewTimer)
        previewTimer = null
      }
    }

    const finish = () => {
      if (finished) return
      finished = true
      clearPreview() // 防定时器泄漏;最终 translated 会取代预览,无需补尾帧
      resolve(parseResult(content))
    }
    const fail = (e: ApiError) => {
      if (finished || errored) return
      errored = true
      clearPreview()
      reject(e)
    }

    const task = wx.request({
      url: authedUrl('/public/translate/paper/stream'),
      method: 'POST',
      enableChunked: true,
      header: {
        'content-type': 'application/json',
        Accept: 'text/event-stream',
        ...authHeader(),
      },
      data: body,
      success: (res) => {
        // 非 SSE 错误(401 未登录 / 429 额度)走普通 JSON,不进 onChunkReceived。
        handleAuthFailure(res.statusCode) // 401 时和 JSON 请求一样清 token
        if (res.statusCode === 429) return fail(new ApiError(6010, '本周期额度已用完', 429))
        if (res.statusCode === 401) return fail(new ApiError(401, '登录已失效,请重新登录', 401))
        if (res.statusCode >= 400) return fail(new ApiError(res.statusCode, '翻译失败', res.statusCode))
        finish() // 流正常结束(即便没显式 [DONE])
      },
      fail: (err) => fail(new ApiError(-1, err.errMsg || '翻译失败', 0)),
    })

    task.onChunkReceived((res) => {
      const chunk = new Uint8Array(res.data as ArrayBuffer)
      const merged = new Uint8Array(bytes.length + chunk.length)
      merged.set(bytes)
      merged.set(chunk, bytes.length)
      bytes = merged
      let idx = findFrameEnd(bytes)
      while (idx >= 0) {
        const frame = utf8Decode(bytes.subarray(0, idx))
        bytes = bytes.subarray(idx + 2)
        handleFrame(frame)
        idx = findFrameEnd(bytes)
      }
    })

    function handleFrame(frame: string) {
      const trimmed = frame.trim()
      if (!trimmed || trimmed[0] === ':') return // 空 / 心跳注释帧
      let data = ''
      for (const l of frame.split('\n')) {
        if (l.indexOf('data:') === 0) data += l.slice(5).trim()
      }
      if (!data) return
      if (data === '[DONE]') {
        finish()
        return
      }
      try {
        const j = JSON.parse(data) as {
          error?: string
          choices?: { delta?: { content?: string } }[]
        }
        if (j.error) {
          fail(new ApiError(-1, j.error, 0))
          return
        }
        const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content
        if (typeof delta === 'string') {
          content += delta
          schedulePreview() // 合帧节流(见上),不再每 token stripTags+setData
        }
      } catch {
        /* 非 JSON 帧忽略 */
      }
    }
  })
}
