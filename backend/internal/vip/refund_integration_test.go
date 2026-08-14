//go:build integration

// 管理台退款 —— 账目不变量的集成测试(直连 compose 的真 MySQL,自造用户,不碰真实数据)。
//
// 退款是全后台唯一一个「点一下就把钱转出去 + 回收用户权益」的动作,光靠读代码确认不够:
// 幂等、累计校验、按比例回收、余额不足扣到 0、会员撤销,每一条错了都是真金白银的事故。
// 这里对**真 MySQL**跑,因为要验的东西(唯一索引挡幂等、事务回滚、行锁)在内存 mock 里全是假的。
//
// 运行:
//   docker run --rm --network scholar_scholar-network \
//     -v "$PWD":/src -w /src -e CGO_ENABLED=0 \
//     -e BILL_DSN='scholar_user:scholar_pass@tcp(mysql:3306)/scholar?charset=utf8mb4&parseTime=True&loc=Local' \
//     -e BILL_REDIS_HOST=redis golang:1.24 go test -tags integration ./internal/vip/ -run IntegrationRefund -v

package vip

import (
	"context"
	"errors"
	"testing"

	"gorm.io/gorm"
)

// cleanupRefunds 退款单不挂外键(刻意的:用户注销不该带走财务留档),所以要单独清。
func cleanupRefunds(db *gorm.DB, userID uint) {
	db.Exec("DELETE FROM order_refunds WHERE user_id = ?", userID)
}

func TestIntegrationRefund(t *testing.T) {
	db := openDB(t)
	initRedis(t)
	svc := NewService(NewRepository(db))
	ctx := context.Background()

	// ── 充值单:按比例回收经费 + 幂等 + 累计不超额 ────────────────────────────
	t.Run("RechargeProportionalReclaim", func(t *testing.T) {
		id := mkUser(t, db)
		defer func() { cleanupRefunds(db, id); cleanup(db, id) }()

		ord, err := svc.Order().CreateRecharge(id, 1000) // 1000 分 = ¥10 // ¥10
		if err != nil {
			t.Fatal(err)
		}
		if err := svc.Order().ProcessAlipayCallback(ord.OrderNo, "txn-r1", ord.FinalAmount, nil); err != nil {
			t.Fatalf("fulfill: %v", err)
		}
		ov, _ := svc.GetOverview(ctx, id)
		granted := int(ov.Credit.Total)
		if granted <= 0 {
			t.Fatalf("充值应入账经费,得到 %v", ov.Credit.Total)
		}
		t.Logf("充值 ¥%.2f → %d 经费", ord.FinalAmount, granted)

		// 退一半 → 应回收一半经费
		half := ord.FinalAmount / 2
		res, err := svc.Order().Refund(ctx, RefundRequest{
			OrderNo: ord.OrderNo, AmountYuan: half,
			Reason: "e2e 部分退款", OperatorID: 0, OperatorName: "e2e",
		})
		if err != nil {
			t.Fatalf("部分退款失败: %v", err)
		}
		if res.RefundStatus != RefundStatusPartial {
			t.Fatalf("退一半应为 partial,得到 %s", res.RefundStatus)
		}
		wantReclaim := granted / 2
		if res.Refund.CreditsReclaimed != wantReclaim {
			t.Fatalf("按比例回收错: want %d got %d", wantReclaim, res.Refund.CreditsReclaimed)
		}
		ov, _ = svc.GetOverview(ctx, id)
		if int(ov.Credit.Total) != granted-wantReclaim {
			t.Fatalf("余额应为 %d,得到 %v", granted-wantReclaim, ov.Credit.Total)
		}

		// 🔴 累计不超额:再退一个「比剩余多」的金额必须被拒
		if _, err := svc.Order().Refund(ctx, RefundRequest{
			OrderNo: ord.OrderNo, AmountYuan: ord.FinalAmount, Reason: "超额",
		}); !errors.Is(err, ErrRefundAmountInvalid) {
			t.Fatalf("超额退款应被拒(ErrRefundAmountInvalid),得到 %v", err)
		}

		// 退掉剩余 → full
		res2, err := svc.Order().Refund(ctx, RefundRequest{
			OrderNo: ord.OrderNo, AmountYuan: 0, Reason: "退完剩余", // 0 = 剩余全额
		})
		if err != nil {
			t.Fatalf("退剩余失败: %v", err)
		}
		if res2.RefundStatus != RefundStatusFull {
			t.Fatalf("退完应为 full,得到 %s", res2.RefundStatus)
		}
		if yuanToCents(res2.RefundedTotal) != yuanToCents(ord.FinalAmount) {
			t.Fatalf("累计已退应等于实付: %v vs %v", res2.RefundedTotal, ord.FinalAmount)
		}

		// 退完之后不能再退
		if _, err := svc.Order().Refund(ctx, RefundRequest{
			OrderNo: ord.OrderNo, AmountYuan: 1, Reason: "再退",
		}); !errors.Is(err, ErrOrderNotRefundable) {
			t.Fatalf("退完后再退应被拒(ErrOrderNotRefundable),得到 %v", err)
		}
	})

	// ── 余额已花光:扣到 0 为止,差额记 shortfall,退款照常成功 ────────────────
	t.Run("ReclaimClampsAtZeroNotNegative", func(t *testing.T) {
		id := mkUser(t, db)
		defer func() { cleanupRefunds(db, id); cleanup(db, id) }()

		ord, err := svc.Order().CreateRecharge(id, 1000) // 1000 分 = ¥10
		if err != nil {
			t.Fatal(err)
		}
		if err := svc.Order().ProcessAlipayCallback(ord.OrderNo, "txn-r2", ord.FinalAmount, nil); err != nil {
			t.Fatal(err)
		}
		ov, _ := svc.GetOverview(ctx, id)
		granted := int(ov.Credit.Total)

		// 把经费花掉绝大部分,只留 10
		spend := granted - 10
		if err := svc.Wallet().ConsumePerm(id, spend, TxAdminAdjust, "test", "e2e", "花掉"); err != nil {
			t.Fatalf("消费失败: %v", err)
		}

		res, err := svc.Order().Refund(ctx, RefundRequest{
			OrderNo: ord.OrderNo, AmountYuan: 0, Reason: "全额退但用户已消费",
		})
		// 🔴 核心断言:退款**不能**因为余额不足而失败(那是改造前 ConsumePerm 的「全有或全无」口径)
		if err != nil {
			t.Fatalf("余额不足时退款不应失败,得到 %v", err)
		}
		if res.Refund.CreditsExpected != granted {
			t.Fatalf("应回收 %d,记录为 %d", granted, res.Refund.CreditsExpected)
		}
		if res.Refund.CreditsReclaimed != 10 {
			t.Fatalf("实际只能收回 10,得到 %d", res.Refund.CreditsReclaimed)
		}
		if res.Refund.CreditsShortfall != granted-10 {
			t.Fatalf("差额应为 %d,得到 %d", granted-10, res.Refund.CreditsShortfall)
		}
		// 🔴 余额必须归 0,**不能为负**:负余额会让用户此后一直被额度闸拦住
		ov, _ = svc.GetOverview(ctx, id)
		if ov.Credit.Total != 0 {
			t.Fatalf("余额应被扣到 0(不为负),得到 %v", ov.Credit.Total)
		}
		var micro int64
		db.Raw("SELECT perm_balance_micro FROM user_wallets WHERE user_id = ?", id).Scan(&micro)
		if micro < 0 {
			t.Fatalf("perm_balance_micro 不得为负,得到 %d", micro)
		}
	})

	// ── 🔴 分多次退款必须精确收干净经费(整数截断回归) ────────────────────────
	//
	// 曾经的写法 `granted * thisCents / paidCents` 对每笔独立取整,比例非整数时会系统性少收:
	// 实测 600 经费/¥10 的历史订单分 3 次退只收回 598,而每次退 1 分则一个都收不回来 ——
	// 等于给了一条「分多次退款保留全部经费」的套利路径。现在按累计量做差,各笔之和恒等于总额。
	t.Run("MultiPartRefundReclaimsExactly", func(t *testing.T) {
		id := mkUser(t, db)
		defer func() { cleanupRefunds(db, id); cleanup(db, id) }()

		ord, err := svc.Order().CreateRecharge(id, 1000) // ¥10
		if err != nil {
			t.Fatal(err)
		}
		if err := svc.Order().ProcessAlipayCallback(ord.OrderNo, "txn-mp", ord.FinalAmount, nil); err != nil {
			t.Fatal(err)
		}
		ov, _ := svc.GetOverview(ctx, id)
		granted := int(ov.Credit.Total)

		// 分 7 笔退完(金额刻意不能整除),每笔 ¥1.42 / 最后一笔补齐
		chunks := []float64{1.42, 1.42, 1.42, 1.42, 1.42, 1.42, 1.48}
		totalReclaimed := 0
		for i, amt := range chunks {
			res, err := svc.Order().Refund(ctx, RefundRequest{
				OrderNo: ord.OrderNo, AmountYuan: amt, Reason: "分笔退",
			})
			if err != nil {
				t.Fatalf("第 %d 笔退款失败: %v", i+1, err)
			}
			totalReclaimed += res.Refund.CreditsReclaimed
		}
		if totalReclaimed != granted {
			t.Fatalf("分 7 笔退完应精确收回 %d 经费,实际只收回 %d(少收 %d)",
				granted, totalReclaimed, granted-totalReclaimed)
		}
		ov, _ = svc.GetOverview(ctx, id)
		if ov.Credit.Total != 0 {
			t.Fatalf("退完后余额应为 0,得到 %v", ov.Credit.Total)
		}
	})

	// ── 订阅单:撤销会员 ─────────────────────────────────────────────────────
	t.Run("SubscriptionRevokesMembership", func(t *testing.T) {
		id := mkUser(t, db)
		defer func() { cleanupRefunds(db, id); cleanup(db, id) }()

		ord, err := svc.Order().CreateSubscription(id, TierPro, CycleMonthly)
		if err != nil {
			t.Fatal(err)
		}
		if err := svc.Order().ProcessAlipayCallback(ord.OrderNo, "txn-s1", ord.FinalAmount, nil); err != nil {
			t.Fatal(err)
		}
		if ov, _ := svc.GetOverview(ctx, id); ov.Tier != TierPro {
			t.Fatalf("履约后应 pro,得到 %s", ov.Tier)
		}

		// 不勾撤销 → 会员保持
		if _, err := svc.Order().Refund(ctx, RefundRequest{
			OrderNo: ord.OrderNo, AmountYuan: 1, Reason: "只退钱不动会员", RevokeMembership: false,
		}); err != nil {
			t.Fatalf("退款失败: %v", err)
		}
		if ov, _ := svc.GetOverview(ctx, id); ov.Tier != TierPro {
			t.Fatalf("未勾撤销时会员应保持 pro,得到 %s", ov.Tier)
		}

		// 勾撤销 → 打回 free
		if _, err := svc.Order().Refund(ctx, RefundRequest{
			OrderNo: ord.OrderNo, AmountYuan: 0, Reason: "全额退并撤会员", RevokeMembership: true,
		}); err != nil {
			t.Fatalf("退款失败: %v", err)
		}
		ov, _ := svc.GetOverview(ctx, id)
		if ov.Tier != TierFree {
			t.Fatalf("撤销后应 free,得到 %s", ov.Tier)
		}
	})

	// ── 未支付的单不可退 ─────────────────────────────────────────────────────
	t.Run("UnpaidOrderNotRefundable", func(t *testing.T) {
		id := mkUser(t, db)
		defer func() { cleanupRefunds(db, id); cleanup(db, id) }()

		ord, err := svc.Order().CreateRecharge(id, 1000) // 1000 分 = ¥10
		if err != nil {
			t.Fatal(err)
		}
		// 刻意不履约 —— 这单还是 pending
		if _, err := svc.Order().Refund(ctx, RefundRequest{
			OrderNo: ord.OrderNo, AmountYuan: 1, Reason: "退一个没付过的单",
		}); !errors.Is(err, ErrOrderNotRefundable) {
			t.Fatalf("未支付单应不可退,得到 %v", err)
		}
	})

	// ── 🔴 真幂等:同一个 IdempotencyKey 重复提交只生效一次 ────────────────────
	//
	// 这是退款最要命的一条。曾经的实现拿 "RF{订单号}-{已有笔数+1}" 当幂等键,
	// 但事务第一步就 FOR UPDATE 锁订单行,两次提交必然**串行**,第二次读到的笔数已经是 1、
	// 序号前进成 -2,唯一索引永远撞不上 —— 那种"幂等"在结构上不可能生效。
	// 真实危险场景不是并发而是**重试**:请求已提交但响应丢失(nginx 读超时/网络抖动),
	// 弹窗保留输入让管理员再点一次 → 同一笔钱登记两次、经费回收两次、用户收到两封通知。
	t.Run("SameIdempotencyKeyReplaysNotDoubleRefunds", func(t *testing.T) {
		id := mkUser(t, db)
		defer func() { cleanupRefunds(db, id); cleanup(db, id) }()

		ord, err := svc.Order().CreateRecharge(id, 1000) // ¥10
		if err != nil {
			t.Fatal(err)
		}
		if err := svc.Order().ProcessAlipayCallback(ord.OrderNo, "txn-idem", ord.FinalAmount, nil); err != nil {
			t.Fatal(err)
		}
		ov, _ := svc.GetOverview(ctx, id)
		granted := int(ov.Credit.Total)

		key := "e2e-idem-" + ord.OrderNo
		req := RefundRequest{
			OrderNo: ord.OrderNo, AmountYuan: 5, Reason: "部分退",
			IdempotencyKey: key,
		}

		r1, err := svc.Order().Refund(ctx, req)
		if err != nil {
			t.Fatalf("第一次退款失败: %v", err)
		}
		// 完全相同的请求再来一次(模拟响应丢失后的重试)
		r2, err := svc.Order().Refund(ctx, req)
		if err != nil {
			t.Fatalf("同键重试不应报错(应回放上一次结果): %v", err)
		}

		// 回放:拿到的是同一笔退款单
		if r1.Refund.RefundNo != r2.Refund.RefundNo {
			t.Fatalf("同键重试应回放同一笔,got %s vs %s", r1.Refund.RefundNo, r2.Refund.RefundNo)
		}
		// 只登记了一条
		var cnt int64
		db.Model(&OrderRefund{}).Where("order_no = ?", ord.OrderNo).Count(&cnt)
		if cnt != 1 {
			t.Fatalf("同键重试只应有 1 条退款记录,得到 %d", cnt)
		}
		// 累计已退没有翻倍
		if yuanToCents(r2.RefundedTotal) != 500 {
			t.Fatalf("累计已退应仍为 ¥5,得到 %v", r2.RefundedTotal)
		}
		// 🔴 经费只被回收一次
		ov, _ = svc.GetOverview(ctx, id)
		wantLeft := granted - granted/2
		if int(ov.Credit.Total) != wantLeft {
			t.Fatalf("经费应只被回收一次(余 %d),得到 %v —— 说明退了两次", wantLeft, ov.Credit.Total)
		}

		// 换一个 key 才是新的一笔(正常的第二次部分退款不受影响)
		if _, err := svc.Order().Refund(ctx, RefundRequest{
			OrderNo: ord.OrderNo, AmountYuan: 1, Reason: "第二笔", IdempotencyKey: key + "-2",
		}); err != nil {
			t.Fatalf("不同 key 的合法第二笔不应被拦: %v", err)
		}
		db.Model(&OrderRefund{}).Where("order_no = ?", ord.OrderNo).Count(&cnt)
		if cnt != 2 {
			t.Fatalf("换 key 后应有 2 条记录,得到 %d", cnt)
		}
	})
}
