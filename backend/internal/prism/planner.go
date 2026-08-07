// ============================================================================
// Prism 写作画像 · 选择路径(Phase 3)
//   ① GetWritingProfileView —— 当前画像(缺省回落)+ 人格花名册,供前端 picker。
//   ② SetWritingProfileFromUser —— 用户覆盖 base/genre(最高优先级);落库后令活会话失效重建。
//   ③ PlanWritingProfile —— throwaway agent 轮读稿 + 花名册 → 选 base/genre(JSON)→ 落库(source=planner)。
//      镜像 peerreview runMethodologyPhase(CreateSession → ServerSideChatStreaming → 解析 → 删会话)。
//   画像变更(user/planner)后必须失效活会话:hub seed 只在字段空时回填、不覆盖活会话,故须删会话+清映射,
//   下次 ensureProjectSession 重建 + 重新 seed 含新画像(见设计 §画像变更失效)。
// ============================================================================

package prism

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/llmusage"
	"scholar-backend/internal/modelcatalog"
)

// ErrInvalidPersona —— 用户/planner 给的 base 人格 slug 未知或非法。
var ErrInvalidPersona = errors.New("未知的写作人格")

// GetWritingProfileView —— 当前画像(解析,NULL/坏 → 确定性缺省)+ 可选人格花名册,供前端 picker。
func (s *Service) GetWritingProfileView(proj *Project) (WritingProfile, []personaMenuEntry) {
	profile, ok := parseProfile(proj.WritingProfile)
	if !ok {
		profile = deterministicWritingProfile(proj.VenueTemplateKey)
	}
	return profile, availablePersonas()
}

// SetWritingProfileFromUser —— 用户覆盖 base(+可选 genre)。校验人格存在 → 落库(source=user)→ 失效活会话。
func (s *Service) SetWritingProfileFromUser(ctx context.Context, proj *Project, baseSlug, genre string) (WritingProfile, error) {
	baseSlug = strings.TrimSpace(baseSlug)
	if _, _, _, ok := loadWritingPersona(baseSlug); !ok {
		return WritingProfile{}, ErrInvalidPersona
	}
	profile := WritingProfile{BaseSlug: baseSlug, Genre: strings.TrimSpace(genre), Source: "user", NeedsRefine: false}
	if err := s.repo.SetWritingProfile(proj.ID, marshalProfile(profile)); err != nil {
		return WritingProfile{}, err
	}
	s.invalidateSessionForProfile(ctx, proj.ID)
	return profile, nil
}

// invalidateSessionForProfile —— 画像变更后,令活会话下次连接用新画像重建 seed。
//
// 🔴 2026-08-07 线上事故修复:本函数**绝不能改变 session id**。
//
// 旧实现除了删 executor 会话,还做了两件致命的事:
//
//	_ = s.repo.SetProjectSession(projectID, "")            // 清空项目指针
//	_ = s.feature.UnbindOwnerSession("project", projectID) // 删 agent_sessions 映射行
//
// 于是下次 ensureProjectSession 会建一条**全新 id 的空会话**。而会话历史在 journal 里是
// **按 session id 索引**的(agent_turns.agent_session_id)—— id 一换,旧 id 下的全部历史
// 就再也没有任何东西指向它,对用户就是「对话历史凭空消失」。
//
// 旧注释写着「下次 hub seedHistoryFromJournal 重放历史并注入新画像」—— 这句话是错的:
// seed 是按 **新** session id 去 journal 取的,当然取到 0 条。线上日志留下了铁证:
//
//	agentbridge hub: seeded executor history  session_id=<新id>  messages=0
//
// 实测代价:用户 1248 / 项目 367 丢了 4 轮全文润色(14:30–14:59);全库 **64 个 prism 会话**
// 处于「有轮次、无映射行」的孤儿态。
//
// ⚠️ 这与 2026-07-18 删掉 recreateProjectSession 时记录的是**同一个 bug**(见 edit.go 那条注释:
// 「agent 404 时应重连同一 session_id …绝不换新会话」)。那次只删掉了一个调用点,
// 本函数在做一模一样的事却没人发现 —— 所以这次补了机械防线(planner_session_test.go)。
//
// 现在的做法:**只删 executor 侧的会话,不动任何 id/指针/映射**。这在架构上是充分的 ——
// hub.seedHistoryFromJournal 的注释自陈「executor 无状态、不自持久化历史(H1)」,
// 每次建连都会用 journal 历史 + 当前画像(spec.SessionProfile)重新 seed。
// 也就是说「让新画像生效」这件事**本来就不需要换会话**,删 executor 会话只是让它更干净地重建。
func (s *Service) invalidateSessionForProfile(_ context.Context, projectID uint) {
	sid, _ := s.repo.GetProjectSession(projectID)
	if sid == "" {
		return
	}
	// best-effort:删失败仅意味着 executor 侧旧上下文多活一会,下次建连的 seed 仍会覆盖它。
	s.deleteSessionBestEffort(sid)
	// 🔴 到此为止。**不要**在这里清 SetProjectSession 或 UnbindOwnerSession —— 见上方长注释。
}

// ResetProjectSession(V3-4.6-1)手动「重开会话」:真源在 DB,重开只丢对话连续性(文稿/画像/文献库零损失)。
// 这是长会话上下文撞墙(N≈8-9 轮撞窗)的当日止血,也是会话可弃化的第一步;**不自动重建**
// (尊重 auto-reset 下线的历史决策),只响应用户显式点击。AI 回答进行中拒绝(别删 agent 脚下的会话)。
func (s *Service) ResetProjectSession(ctx context.Context, proj *Project) error {
	sid, _ := s.repo.GetProjectSession(proj.ID)
	if sid != "" && s.feature != nil && s.feature.SessionBusy(sid) {
		return ErrRoundBusy
	}
	// 🔴 2026-08-07:这里从 invalidateSessionForProfile 改成 newConversation。
	//
	//    用户点「重开会话」要的是**一段不带旧上下文的新对话**(长会话撞窗的当日止血),
	//    而不是「把上一段对话删掉」。旧实现走的是清指针 + 解绑 —— 那会让上一段对话
	//    连同它的全部历史变成孤儿(journal 里还在,但再没有任何东西指向它)。
	//    prism 本来就是多对话模型(owner_kind=project 可挂多条),新建一条即可:
	//    旧对话仍然绑定、仍然出现在对话列表里,用户随时能切回去看。
	newSID, err := s.newConversation(ctx, proj.ID, proj.UserID)
	if err != nil {
		return err
	}
	slog.Info("prism_session_reset", "project_id", proj.ID, "old_session", sid, "new_session", newSID)
	return nil
}

// plannerSelection —— planner 轮末选择 JSON 的解析目标。
type plannerSelection struct {
	Base      string `json:"base"`
	Genre     string `json:"genre"`
	WhyChosen string `json:"why_chosen"`
}

// PlanWritingProfile —— 一次性 planner 轮:读稿 title/abstract/首段 + 人格花名册 → 选 base/genre → 落库。
// 失败(不可用/解析坏/人格非法)→ 返回 err,调用方保持原画像(前端可退回用户手选)。
// V3-4.1-4 双漏修:①此前绕过配额 → 手放严格日额度闸(镜像 peerreview Submit 先例);
// ②server-side 记账归属取 llmusage.CallFromCtx,此前无 ctx 归属 → user_id=NULL、feature 兜底
// peer_review(ws_serverside.go)→ 注入 {FeaturePrism, userID} 修正账目归属。
func (s *Service) PlanWritingProfile(ctx context.Context, proj *Project) (WritingProfile, error) {
	if s.agent == nil || s.feature == nil {
		return WritingProfile{}, errors.New("planner 暂不可用")
	}
	if vipChecker != nil {
		if err := vipChecker.CheckDailyQuota(ctx, proj.UserID); err != nil {
			return WritingProfile{}, err
		}
	}
	uid := proj.UserID
	ctx = llmusage.WithCall(ctx, llmusage.Call{Feature: llmusage.FeaturePrism, UserID: &uid})
	roster := availablePersonas()
	if len(roster) == 0 {
		return WritingProfile{}, errors.New("无可选写作人格")
	}
	brief := s.docBriefForPlanner(proj.ID)
	// throwaway 会话:纯选择,不挂写作 skill / 画像(与主会话隔离);禁 Bash 等与主会话一致。
	created, err := s.agent.CreateSession(ctx, &agent.CreateSessionOptions{
		DisallowedTools: agentbridge.SessionDisallowedTools(prismDisallowedTools, false),
	})
	if err != nil {
		return WritingProfile{}, err
	}
	sessID := created.SessionID
	defer s.deleteSessionBestEffort(sessID)

	// 模型目录化 P1:planner 是纯选择任务,按 prism.planner 绑定取便宜模型(空=不切,跑默认主模型)。
	plannerModel := ""
	if modelResolver != nil {
		plannerModel = modelResolver.Resolve(modelcatalog.PurposePrismPlanner)
	}
	reply, _, cerr := s.feature.ServerSideChatStreaming(ctx, sessID,
		buildPlannerPrompt(brief, roster), func(string) {}, func(string) {}, plannerModel)
	if cerr != nil {
		return WritingProfile{}, cerr
	}
	profile, ok := parsePlannerSelection(reply)
	if !ok {
		return WritingProfile{}, errors.New("planner 未产出可解析的选择")
	}
	profile.Source = "planner"
	profile.NeedsRefine = false
	if err := s.repo.SetWritingProfile(proj.ID, marshalProfile(profile)); err != nil {
		return WritingProfile{}, err
	}
	s.invalidateSessionForProfile(ctx, proj.ID)
	return profile, nil
}

// docBriefForPlanner —— 取稿件轻量摘要(标题/摘要/关键词 + 前 2 个正文块文本,~上限几百字)供 planner 判断学科/文体。
// 只读前置 + 头部,故成本可控(planner 不需全文)。读失败 → 空串(planner 仍可据花名册给通用默认)。
func (s *Service) docBriefForPlanner(projectID uint) string {
	js, err := s.GetStruct(projectID)
	if err != nil {
		return ""
	}
	d, err := ParseDocStruct(js)
	if err != nil {
		return ""
	}
	var b strings.Builder
	fm := d.FrontMatter
	if strings.TrimSpace(fm.Title) != "" {
		b.WriteString("标题: " + fm.Title + "\n")
	}
	if strings.TrimSpace(fm.Abstract) != "" {
		b.WriteString("摘要: " + clip(fm.Abstract, 800) + "\n")
	}
	if len(fm.Keywords) > 0 {
		b.WriteString("关键词: " + strings.Join(fm.Keywords, ", ") + "\n")
	}
	// 前 2 个段落块的文本(figure/table/math 跳过)。
	paras := 0
	for _, blk := range d.Body {
		if blk.Type == BlockHeading {
			b.WriteString("# " + blk.Text + "\n")
			continue
		}
		if blk.Type != BlockParagraph {
			continue
		}
		var line strings.Builder
		for _, in := range blk.Inlines {
			if in.V != "" {
				line.WriteString(in.V)
			}
		}
		if t := strings.TrimSpace(line.String()); t != "" {
			b.WriteString(clip(t, 500) + "\n")
			paras++
			if paras >= 2 {
				break
			}
		}
	}
	return clip(strings.TrimSpace(b.String()), 2000)
}

func clip(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

// buildPlannerPrompt —— 组 planner 选择 prompt:稿件摘要 + 人格花名册(照抄用) + 输出规则(末尾 JSON)。
func buildPlannerPrompt(brief string, roster []personaMenuEntry) string {
	var b strings.Builder
	b.WriteString("你在为一篇学术稿件挑选**最合适的 1 个写作画像(base 人格)**。画像定调这篇稿子的文体/学科骨架" +
		"(结构、时态、引用风格、该领域严谨底线)。下面是稿件的头部信息与可选画像花名册。\n\n")
	b.WriteString("【稿件头部】\n")
	if strings.TrimSpace(brief) == "" {
		b.WriteString("(暂无正文,按最通用的实证论文处理)\n")
	} else {
		b.WriteString(brief + "\n")
	}
	b.WriteString("\n【可选写作画像花名册】(kind=genre 是文体基座如回复函/投稿信/基金;kind=discipline 是论文的学科人格)\n")
	for _, e := range roster {
		b.WriteString("- `" + e.Slug + "` [" + e.Kind + "] " + e.Name)
		if strings.TrimSpace(e.Desc) != "" {
			b.WriteString(" —— " + clip(e.Desc, 160))
		}
		b.WriteString("\n")
	}
	b.WriteString("\n【怎么选】\n" +
		"1. 若稿件本身是回复函/投稿信/基金/注册报告/学位论文章节等**特殊文体**,直接选对应的 genre 基座。\n" +
		"2. 否则它是一篇**论文**:判断其学科/方法,选最匹配的 discipline 人格;拿不准就选通用实证 `pw-experimental-stem`。\n" +
		"3. 只选**花名册里真实存在**的一个 slug,别自造。\n\n" +
		"先用一两句说明你的判断,然后在**回复末尾**输出一个 ```json 代码块(必须是最后一个 json 块):\n" +
		"```json\n{\"base\":\"pw-...\",\"genre\":\"paper|rebuttal|cover-letter|grant|registered-report|thesis-chapter\",\"why_chosen\":\"一句话\"}\n```\n" +
		"base 必须是花名册里的 slug;若选了 discipline 人格,genre 填 \"paper\"。")
	return b.String()
}

// parsePlannerSelection —— 从 planner reply 取末尾 JSON,校验 base 人格真实存在 → WritingProfile。坏/非法 → ok=false。
func parsePlannerSelection(reply string) (WritingProfile, bool) {
	raw := extractLastFencedJSON(reply)
	if raw == nil {
		return WritingProfile{}, false
	}
	var sel plannerSelection
	if err := json.Unmarshal(raw, &sel); err != nil {
		return WritingProfile{}, false
	}
	base := strings.TrimSpace(sel.Base)
	if _, _, _, ok := loadWritingPersona(base); !ok {
		return WritingProfile{}, false // agent 编了个不存在的 slug → 判失败(调用方保持原画像)
	}
	genre := strings.TrimSpace(sel.Genre)
	if genre == "" {
		genre = "paper"
	}
	return WritingProfile{BaseSlug: base, Genre: genre}, true
}

// ── 末尾 JSON 提取(与 peerreview 同形,包隔离各留一份)────────────────────────

func extractLastFencedJSON(reply string) []byte {
	if idx := strings.LastIndex(reply, "```json"); idx >= 0 {
		rest := reply[idx+len("```json"):]
		if end := strings.Index(rest, "```"); end >= 0 {
			if obj := lastBalancedObject(rest[:end]); obj != nil {
				return obj
			}
		}
	}
	return lastBalancedObject(reply)
}

func lastBalancedObject(s string) []byte {
	var last []byte
	for i := 0; i < len(s); {
		if s[i] != '{' {
			i++
			continue
		}
		if obj, end := balancedObjectFrom(s, i); obj != nil {
			last = obj
			i = end
		} else {
			i++
		}
	}
	return last
}

func balancedObjectFrom(s string, start int) ([]byte, int) {
	depth := 0
	inString := false
	escape := false
	for i := start; i < len(s); i++ {
		c := s[i]
		if escape {
			escape = false
			continue
		}
		if inString {
			if c == '\\' {
				escape = true
			} else if c == '"' {
				inString = false
			}
			continue
		}
		switch c {
		case '"':
			inString = true
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return []byte(s[start : i+1]), i + 1
			}
		}
	}
	return nil, start + 1
}
