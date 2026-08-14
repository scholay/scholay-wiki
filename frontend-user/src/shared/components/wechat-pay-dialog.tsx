// 微信支付弹窗 —— 四条支付路径(会员订阅 / 额度弹窗升级 / 价格页 / 经费充值)+ 移动端两个弹层共用一份。
//
// 状态机:加载中 → 待扫码(二维码 + 倒计时 + 轮询) → 已支付(成功态 1.2s) → 已过期(可重新获取) → 失败
//
// 环境分流(shared/lib/device.ts,判定收口在那一处):
//   · 手机浏览器(非微信内)→ mode:'h5',拿到 h5_url 直接 location.href 跳走,**不显示二维码**;
//     后台 pay_modes 没开 h5 时后端下单会失败 → 自动回落 native 显示二维码并说明原因。
//   · 微信内置浏览器 → 二维码扫不了自己(也无法用 h5,微信封了站外 h5 拉起),
//     显示二维码 + 「长按识别」提示。**不给一个用户扫不了的码却不说话**。
//   · 其余(PC)→ mode:'native' 扫码。
//
// 🔴 Radix 铁律:Dialog 根节点常驻 + open={!!orderNo},内容 {orderNo && <DialogContent/>}。
// 绝不在 open 态卸载 —— 那会泄漏 body pointer-events 锁,症状是全站点击失灵(见 frontend-user/CLAUDE.md §十)。
//
// 🔴 建单在**调用方**:各路径先建自己的订单(订阅单/充值单),拿到 order_no 才把弹窗打开。
// 本组件只负责「拿订单号换二维码 + 盯支付结果」,不知道也不关心买的是什么。
import { useEffect, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { CheckCircle2, Loader2, RefreshCw, ScanLine, TriangleAlert } from 'lucide-react';
import { PayMethodLogo } from './PayMethodLogo';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/utils';
import { toApiError } from '@/shared/lib/http';
import { isPhoneDevice, isWeChatBrowser } from '@/shared/lib/device';
import { useStartWechat, useWechatPayStatus, type WechatPayCreated } from '@/shared/api/wechat-pay';

export interface WechatPayDialogProps {
  /** 待支付订单号;null = 关闭。调用方建单成功后才 set。 */
  orderNo: string | null;
  /** 商品说明(如「Pro 年度会员订阅」/「科研经费充值」),只用于文案。 */
  subject?: string;
  onOpenChange: (open: boolean) => void;
  /** 轮询到 paid 后的副作用(刷新额度 / 广播 / 跳转…)。各路径各不相同,由调用方注入。 */
  onPaid: () => void;
}

/** 秒 → mm:ss。 */
function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function WechatPayDialog({ orderNo, subject, onOpenChange, onPaid }: WechatPayDialogProps) {
  // 关窗时**不跟着卸载内容**:Dialog 根常驻 + 内容滞后一拍,让 Radix 走完自己的关闭收尾
  // (「open 时被卸载」是 body pointer-events 锁泄漏的已知成因,这里连边都不沾)。
  // 滞后期间靠 active=false 停掉轮询与倒计时,不留后台请求。
  const [mounted, setMounted] = useState<{ orderNo: string; subject?: string } | null>(null);
  useEffect(() => {
    if (orderNo) setMounted({ orderNo, subject });
  }, [orderNo, subject]);

  return (
    <Dialog open={!!orderNo} onOpenChange={onOpenChange}>
      {/* key=orderNo:换一单 = 换一份全新状态(二维码/倒计时/轮询都重来),不必手写 reset effect。 */}
      {mounted && (
        <WechatPayBody
          key={mounted.orderNo}
          orderNo={mounted.orderNo}
          subject={mounted.subject}
          active={!!orderNo}
          onOpenChange={onOpenChange}
          onPaid={onPaid}
        />
      )}
    </Dialog>
  );
}

function WechatPayBody({
  orderNo,
  subject,
  active,
  onOpenChange,
  onPaid,
}: WechatPayDialogProps & { orderNo: string; active: boolean }) {
  const start = useStartWechat();
  const [pay, setPay] = useState<WechatPayCreated | null>(null);
  const [errMsg, setErrMsg] = useState('');
  /** h5 下单失败后回落到扫码 —— 需要如实告诉用户「本机本该跳微信,但没开通」。 */
  const [fellBackToQr, setFellBackToQr] = useState(false);
  const [paid, setPaid] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const startedRef = useRef(false);
  const paidRef = useRef(false);
  const successTimerRef = useRef(0);
  // onPaid / onOpenChange 常是内联箭头(每渲染换引用),放 ref 里让成功 effect 只依赖 paid 信号。
  const cbRef = useRef({ onPaid, onOpenChange });
  cbRef.current = { onPaid, onOpenChange };

  const inWeChat = isWeChatBrowser();
  const wantH5 = isPhoneDevice() && !inWeChat;

  const create = async () => {
    setErrMsg('');
    setPay(null);
    setFellBackToQr(false);
    setNow(Date.now()); // 倒计时基准对齐到「刚拿到码」这一刻,避免用挂载时的旧时间算首帧
    try {
      const r = await start.mutateAsync({ order_no: orderNo, mode: wantH5 ? 'h5' : 'native' });
      // 下单成功但没给可用载荷 = 这条路走不通,当失败处理(否则会渲染出一个空白弹窗)。
      // 抛出去正好复用下面的「h5 → native 回落」与错误态。
      if (r.mode === 'h5' ? !r.h5_url : !r.code_url) {
        throw new Error('微信没有返回可用的支付信息,请稍后再试');
      }
      setPay(r);
      if (r.mode === 'h5') window.location.href = r.h5_url; // 离开页面唤起微信
    } catch (err) {
      // h5 失败最常见的原因是后台 pay_modes 没开 h5(后端把细节吞进 2004 通用文案里,
      // 前端无法按 code 分辨)—— 直接回落扫码重试一次,比让用户对着一句「创建支付失败」强。
      if (wantH5) {
        try {
          const r2 = await start.mutateAsync({ order_no: orderNo, mode: 'native' });
          if (!r2.code_url) throw new Error('微信没有返回支付二维码,请稍后再试');
          setFellBackToQr(true);
          setPay(r2);
          return;
        } catch (err2) {
          setErrMsg(toApiError(err2).message || '没能创建支付,这笔钱没有扣,稍后再试一次');
          return;
        }
      }
      setErrMsg(toApiError(err).message || '没能创建支付,这笔钱没有扣,稍后再试一次');
    }
  };

  // 挂载即下单(组件被 key 到 orderNo,一单只跑一次)。
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void create();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 倒计时心跳(有码 / 未支付 / 未过期 / 窗口开着 才跑)。
  const expiresAt = pay ? pay.expires_at * 1000 : 0;
  const remainSec = expiresAt ? (expiresAt - now) / 1000 : 0;
  const expired = !!pay && remainSec <= 0;
  useEffect(() => {
    if (!pay || paid || expired || !active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [pay, paid, expired, active]);

  const statusQ = useWechatPayStatus(orderNo, active && !!pay && !paid && !expired);

  // 支付成功:成功态停留 ~1.2s 让用户看清,再关窗 + 交回副作用。
  // 🔴 先 onOpenChange(false) 再 onPaid():onPaid 里可能 navigate(价格页就是这么做的),
  // 反过来会让 Radix 在「还 open」的状态下被路由卸载 = body 锁泄漏。
  // 🔴 依赖里**只放 paid 信号**、成功标记走 ref:若把 state 版的 paid 也放进依赖,
  // setPaid 引起的重跑会先执行上一轮 cleanup 把这个 1.2s 定时器清掉,成功态就永远不收尾。
  // 定时器的卸载清理单独放下面那个 mount-only effect 里。
  useEffect(() => {
    if (!statusQ.data?.paid || paidRef.current) return;
    paidRef.current = true;
    setPaid(true);
    successTimerRef.current = window.setTimeout(() => {
      cbRef.current.onOpenChange(false);
      cbRef.current.onPaid();
    }, 1200);
  }, [statusQ.data?.paid]);

  useEffect(() => () => window.clearTimeout(successTimerRef.current), []);

  const amountText = pay ? pay.amount.toFixed(2) : '';
  const loading = !pay && !errMsg;
  const h5Url = pay?.mode === 'h5' ? pay.h5_url : '';
  const jumping = !!h5Url;

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <PayMethodLogo method="wechat" className="size-5" />
          微信支付
        </DialogTitle>
        <DialogDescription>
          {subject ? `${subject} · ` : ''}
          {amountText ? (
            <>
              应付 <b className="text-foreground">¥{amountText}</b>
            </>
          ) : (
            '正在准备支付…'
          )}
        </DialogDescription>
      </DialogHeader>

      {/* ── 失败 ────────────────────────────────────────────────── */}
      {errMsg && (
        <div className="flex flex-col items-center gap-3 py-4">
          <TriangleAlert className="size-8 text-brand-red" />
          <p className="text-center text-12 leading-paragraph text-brand-red">{errMsg}</p>
          <Button size="sm" variant="outline" onClick={() => void create()} disabled={start.isPending}>
            {start.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            重试
          </Button>
        </div>
      )}

      {/* ── 加载中 ──────────────────────────────────────────────── */}
      {loading && (
        <div className="flex flex-col items-center gap-2 py-8">
          <Loader2 className="size-8 animate-spin text-faint" />
          <p className="text-12 text-faint">正在向微信下单…</p>
        </div>
      )}

      {/* ── 已支付 ──────────────────────────────────────────────── */}
      {paid && (
        <div className="flex flex-col items-center gap-2 py-8">
          <CheckCircle2 className="size-10 text-brand-green" />
          <p className="text-14 font-medium text-foreground">支付成功</p>
          <p className="text-12 text-faint">权益马上到账,正在为你刷新…</p>
        </div>
      )}

      {/* ── h5:跳转中(手机浏览器)────────────────────────────── */}
      {!paid && jumping && (
        <div className="flex flex-col items-center gap-2 py-8">
          <Loader2 className="size-8 animate-spin text-faint" />
          <p className="text-12 leading-paragraph text-faint">正在打开微信完成支付…</p>
          <Button size="sm" variant="outline" onClick={() => { window.location.href = h5Url; }}>
            没反应?点这里手动打开
          </Button>
        </div>
      )}

      {/* ── native:二维码 ──────────────────────────────────────── */}
      {!paid && pay && !jumping && pay.code_url && (
        <div className="flex flex-col items-center gap-3">
          <div className="relative rounded-12 border border-border p-3">
            {/* QRCodeCanvas 的前景/背景走它自己的默认值(纯黑纯白)—— 那是**扫码可靠性**要求,
                不是配色选择;降低对比度会让部分机型识别失败,故此处不套设计 token。 */}
            <div className={cn(expired && 'opacity-20')}>
              <QRCodeCanvas value={pay.code_url} size={180} level="M" marginSize={0} />
            </div>
            {expired && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="rounded-8 bg-surface-card px-3 py-1 text-12 font-medium text-brand-red">
                  二维码已过期
                </span>
              </div>
            )}
          </div>

          {expired ? (
            <Button size="sm" onClick={() => void create()} disabled={start.isPending}>
              {start.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              重新获取二维码
            </Button>
          ) : (
            <>
              <p className="flex items-center gap-2 text-12 text-subtle">
                <ScanLine className="size-4 text-brand-green" />
                {inWeChat ? '长按二维码识别付款' : '打开微信扫一扫完成支付'}
              </p>
              <p className="text-12 tabular-nums text-faint">
                二维码 {mmss(remainSec)} 后失效 · 付款后本页会自动更新
              </p>
            </>
          )}

          {/* 微信内:码扫不了自己,必须把出路讲清楚,而不是给一个静默失效的码。 */}
          {inWeChat && !expired && (
            <p className="text-center text-12 leading-paragraph text-brand-amber">
              检测到你在微信内打开。请长按上方二维码识别付款,或点右上角「···」→「在浏览器打开」后再支付。
            </p>
          )}
          {/* h5 回落:如实说明「本该直接跳微信,但商户没开通 h5」,免得用户以为手机端就该扫码。 */}
          {fellBackToQr && !expired && (
            <p className="text-center text-12 leading-paragraph text-faint">
              当前商户未开通手机浏览器直付,请用另一台设备的微信扫码,或长按保存后在微信里识别。
            </p>
          )}
        </div>
      )}
    </DialogContent>
  );
}
