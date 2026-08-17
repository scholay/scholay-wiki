import type { WikiArticle } from "../../types";

export const AdminPaymentMerchantsArticle: WikiArticle = {
  slug: "admin-payment-merchants",
  title: "支付商户配置",
  summary: "维护支付宝与微信支付商户凭据、能力开关、测试和激活状态。",
  category: "administration",
  kind: "architecture",
  status: "current",
  audience: ["管理员", "财务运营", "运维人员"],
  aliases: ["Payment Config", "支付宝商户", "微信支付商户"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/PaymentConfigPage.tsx",
    "frontend-user/src/features/admin/components/PaymentConfigParts.tsx",
    "frontend-user/src/features/admin/components/WechatPayPanel.tsx",
    "frontend-user/src/features/admin/api/payment.ts",
    "backend/internal/payment/alipay_service.go",
    "backend/internal/payment/wechat_pay_service.go",
  ],
  related: ["payment-orders", "admin-billing-configuration", "admin-dashboard"],
  sections: [
    {
      id: "alipay",
      title: "支付宝",
      markdown: `支付配置页先汇总支付宝和微信商户及测试、激活状态；打开支付宝编辑器后，可以选择沙箱或生产网关，并填写通知地址、返回地址、应用私钥和支付宝公钥。下图依次展示渠道总览和支付宝编辑器。

支付宝可以保存多套商户配置，但同一时间只有一套 active。激活沙箱配置时会额外警告，避免把测试环境误当成可收款生产渠道。`,
      embeds: [
        { id: "admin-payment-merchants" },
        {
          id: "admin-alipay-editor",
          caption: "支付宝应用、网关、回调与密钥编辑器",
        },
      ],
    },
    {
      id: "wechat",
      title: "微信支付",
      markdown: `切到微信支付后，先查看商户与能力状态，再在编辑器中填写商户号、AppID、证书序列号、APIv3 密钥、商户私钥，并选择平台公钥或平台证书模式。下图依次展示微信支付概览和证书/支付场景编辑器。

Native、H5、JSAPI 至少开启一种。回调地址与加密材料必须配套，单独打开能力开关不会让渠道真正可用。`,
      embeds: [
        { id: "admin-wechat-pay" },
        {
          id: "admin-wechatpay-editor",
          caption: "微信支付证书、验签方式与支付场景编辑器",
        },
      ],
    },
    {
      id: "activation",
      title: "测试与激活",
      markdown: `保存商户配置后先运行连接测试；测试通过再打开激活确认，核对渠道、环境和商户后切换生效配置。下图展示的是最终激活确认状态。

修改关键凭据会使旧测试结果失效并取消激活，必须重新测试。测试最长约 60 秒，只验证配置与渠道连通，不创建真实交易。用户支付入口只使用 active 且 valid 的配置；这里不负责订单履约、退款或对账。`,
      embeds: [
        {
          id: "admin-payment-activation-confirm",
          caption: "测试通过后切换生效商户的最终确认",
        },
      ],
    },
  ],
};
