import { listTransactions, listOrders, CreditTxn, Order } from '../../services/api/membership'
import { errMsg } from '../../lib/feedback'
import { relativeTime } from '../../lib/format'

interface TxnVM {
  id: number
  label: string
  amount: string
  positive: boolean
  time: string
}
interface OrderVM {
  orderNo: string
  name: string
  amount: string
  status: string
  time: string
}

const STATUS_LABEL: Record<string, string> = {
  paid: '已支付',
  pending: '待支付',
  cancelled: '已取消',
  refunded: '已退款',
  failed: '失败',
}

// 0098 起流水金额可带小数(payg 日聚合行)。整数原样;小数最多 4 位去尾零。
function fmtCredit(v: number): string {
  return Number.isInteger(v) ? String(v) : String(parseFloat(v.toFixed(4)))
}

function txnVM(t: CreditTxn): TxnVM {
  return {
    id: t.id,
    label: t.note || t.type || '经费变动',
    amount: (t.amount >= 0 ? '+' : '') + fmtCredit(t.amount),
    positive: t.amount >= 0,
    time: relativeTime(t.created_at),
  }
}
function orderVM(o: Order): OrderVM {
  return {
    orderNo: o.order_no,
    name: o.plan_name || (o.order_type === 'recharge' ? '经费充值' : '会员订阅'),
    amount: '¥' + (o.final_amount || o.amount || 0).toFixed(2), // 后端金额单位是元(不是分),不除 100
    status: STATUS_LABEL[o.status] || o.status,
    time: relativeTime(o.created_at),
  }
}

Page({
  data: {
    tab: 'txn' as 'txn' | 'orders',
    txns: [] as TxnVM[],
    orders: [] as OrderVM[],
    loading: true,
    error: '',
  },

  onLoad() {
    this.load('txn')
  },

  switchTab(e: WechatMiniprogram.TouchEvent) {
    const tab = e.currentTarget.dataset.tab as 'txn' | 'orders'
    if (tab === this.data.tab) return
    this.setData({ tab })
    this.load(tab)
  },

  async load(tab: 'txn' | 'orders') {
    this.setData({ loading: true, error: '' })
    try {
      if (tab === 'txn') {
        const items = await listTransactions(1, 50)
        this.setData({ txns: items.map(txnVM) })
      } else {
        const items = await listOrders()
        this.setData({ orders: items.map(orderVM) })
      }
    } catch (e) {
      this.setData({ error: errMsg(e, '加载失败') })
    }
    this.setData({ loading: false })
  },
})
