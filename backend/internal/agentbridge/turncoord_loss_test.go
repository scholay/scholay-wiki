package agentbridge

import (
	"context"
	"errors"
	"testing"

	"scholar-backend/internal/agent"
)

// failingEventLog 只让 BeginTurn 失败(模拟 MySQL 抖动/连接池打满),其余方法都是不会被调到的空壳。
type failingEventLog struct {
	err        error
	appendCnt  int
	beginCalls int
}

func (f *failingEventLog) BeginTurn(context.Context, TurnInput) (*Turn, bool, error) {
	f.beginCalls++
	return nil, false, f.err
}
func (f *failingEventLog) Append(uint64, string, EvType, []byte)               { f.appendCnt++ }
func (f *failingEventLog) FlushTurn(context.Context, uint64) error             { return nil }
func (f *failingEventLog) BumpAttempt(context.Context, uint64, int) error      { return nil }
func (f *failingEventLog) CompleteTurn(context.Context, uint64, string, string, *BillingLedgerRow) error {
	return nil
}
func (f *failingEventLog) RecordBlockedTurn(context.Context, TurnInput, []byte) error { return nil }
func (f *failingEventLog) ReadInFlightEvents(context.Context, string) (*Turn, []Event, error) {
	return nil, nil, nil
}
func (f *failingEventLog) ReadRecentTurns(context.Context, string, int) ([]Event, int, bool, error) {
	return nil, 0, false, nil
}
func (f *failingEventLog) FoldToMessages([]Event) []agent.SessionMessage { return nil }
func (f *failingEventLog) ReconcileStaleRunning(context.Context) error   { return nil }
func (f *failingEventLog) Shutdown(context.Context)                      {}
func (f *failingEventLog) WriteFailures() int64                          { return 0 }

// okEventLog 正常路径:BeginTurn 成功。
type okEventLog struct{ failingEventLog }

func (o *okEventLog) BeginTurn(context.Context, TurnInput) (*Turn, bool, error) {
	o.beginCalls++
	return &Turn{ID: 7}, false, nil
}

// TestBeginTurnFailureIsCountedAsWholeTurnLoss —— BeginTurn 失败 = 整轮 journal 丢失,必须被计数。
//
// 这是 ③ 的核心行为断言:失败时 hub 的 currentTurnID 保持 0,该轮所有帧被 tee 闸门丢弃,
// agent_turns 里连行都没有。此前唯一痕迹是一条写着「live unaffected」的 WARN,搜不到也告不了警。
//
// 变异验证:注释掉 turncoord.go 里的 `journalTurnLossCnt.Add(1)` → 本用例失败。
func TestBeginTurnFailureIsCountedAsWholeTurnLoss(t *testing.T) {
	boom := errors.New("mysql: too many connections")
	log := &failingEventLog{err: boom}
	tc := NewTurnCoordinator(log)

	before := JournalTurnLosses()
	res, err := tc.BeginTurn(context.Background(), TurnInput{
		AgentSessionID: "sess-1", FeatureKey: "claw", UserID: 42,
		ClientTurnID: "ct-1", RoleUserText: "hi",
	})

	if !errors.Is(err, boom) {
		t.Fatalf("错误必须原样上抛给调用方(hub 据此决定不落 turnID),得到 %v", err)
	}
	if res.TurnID != 0 {
		t.Fatalf("失败时不得返回可用 turnID,否则后续事件会写到不存在的轮上,得到 %d", res.TurnID)
	}
	if got := JournalTurnLosses() - before; got != 1 {
		t.Fatalf("整轮丢失计数应 +1,实际 +%d —— 「journal 丢了一整轮」这件事将再次无法被告警", got)
	}
	if log.appendCnt != 0 {
		t.Fatalf("BeginTurn 失败后不得再 Append 事件(无归属的轮),实际 %d 次", log.appendCnt)
	}
}

// TestBeginTurnSuccessDoesNotCountLoss —— 正常轮绝不能记丢失,否则计数器变成噪声、失去告警价值。
func TestBeginTurnSuccessDoesNotCountLoss(t *testing.T) {
	tc := NewTurnCoordinator(&okEventLog{})
	before := JournalTurnLosses()
	res, err := tc.BeginTurn(context.Background(), TurnInput{AgentSessionID: "s", ClientTurnID: "c"})
	if err != nil || res.TurnID != 7 {
		t.Fatalf("正常路径行为不得改变,得到 turnID=%d err=%v", res.TurnID, err)
	}
	if got := JournalTurnLosses() - before; got != 0 {
		t.Fatalf("成功轮不得计入丢失,实际 +%d", got)
	}
}

// TestBeginTurnUnwiredIsNotALoss —— 未接线(测试/AGENT_TURN_JOURNAL=off)时是 no-op,不是丢失。
// 把它算成丢失会让计数器在任何没接 journal 的环境里恒定报警,人就会开始忽略它。
func TestBeginTurnUnwiredIsNotALoss(t *testing.T) {
	var tc *TurnCoordinator // nil 接收者:nil-guard 路径
	before := JournalTurnLosses()
	if _, err := tc.BeginTurn(context.Background(), TurnInput{}); err != nil {
		t.Fatalf("未接线应 no-op,得到 %v", err)
	}
	if _, err := NewTurnCoordinator(nil).BeginTurn(context.Background(), TurnInput{}); err != nil {
		t.Fatalf("log 为 nil 应 no-op,得到 %v", err)
	}
	if got := JournalTurnLosses() - before; got != 0 {
		t.Fatalf("未接线不得计入丢失,实际 +%d", got)
	}
}
