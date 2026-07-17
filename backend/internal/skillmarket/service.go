// ============================================================================
// Skills 市场 —— Service(业务逻辑)
//
// 安全不变式:
//   - 上传的 SKILL.md 一律经 ParseAndNormalize 规范化后入 skill_versions.skill_md(不信原文)。
//   - backend 全程不解压执行 tarball、不跑任何脚本;只解析元数据 + 存原始归档。
//   - public 必须 moderation_status=approved 才对外可见 / 可被他人 install。
//   - MaterializeForUser(建会话钩子)只返回「自建」或「public+approved」的 skill,只走 guides 层。
// ============================================================================

package skillmarket

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/storage"
)

type Service struct {
	repo *Repository
	// skillCap 返回某用户可持有的 skill 数上限;nil → MaxSkillsFree。bootstrap 用 vip 注入。
	skillCap func(userID uint) int
}

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

// SetSkillCapResolver 注入「按用户等级算持有上限」的解析器(免费 10 / Pro 50)。
func (s *Service) SetSkillCapResolver(fn func(userID uint) int) { s.skillCap = fn }

func (s *Service) capFor(userID uint) int {
	if s.skillCap == nil {
		return MaxSkillsFree
	}
	if n := s.skillCap(userID); n > 0 {
		return n
	}
	return MaxSkillsFree
}

var (
	ErrQuotaExceeded   = errors.New("已达 skill 数量上限")
	ErrNotOwner        = errors.New("无权操作该 skill")
	ErrNotInstallable  = errors.New("该 skill 未公开或未过审,无法安装")
	ErrBadBundle       = errors.New("bundle 格式非法")
	ErrTooManyVersions = errors.New("版本数已达上限")
	ErrTooManyEnabled  = errors.New("智能助手单次最多启用 5 个技能,请先关闭一些再启用")
)

// ── 上传 / 创建 ──────────────────────────────────────────────────────────────

// CreateSkill 接收一个 bundle(≥1 文件,含恰好一个 SKILL.md),规范化后建 skill + 首版本。
// contentSource = original|reposted。files 已由 handler 解析+安全校验(见 bundle.go)。
func (s *Service) CreateSkill(ctx context.Context, userID uint, name, tagline, category, contentSource string, files []BundleFile) (*UserSkill, error) {
	cnt, err := s.repo.CountUserSkills(userID)
	if err != nil {
		return nil, err
	}
	if cnt >= int64(s.capFor(userID)) {
		return nil, ErrQuotaExceeded
	}
	skillMd, skillDir, err := FindSkillMd(files)
	if err != nil {
		return nil, err
	}
	parsed, err := ParseAndNormalize(skillMd, name)
	if err != nil {
		return nil, err
	}
	slug, err := s.uniqueSlug(parsed.SlugBase)
	if err != nil {
		return nil, err
	}
	declared, _ := json.Marshal(parsed.DeclaredTools)

	skill := &UserSkill{
		UserID:           userID,
		Slug:             slug,
		Name:             parsed.Name,
		Tagline:          strings.TrimSpace(tagline),
		WhenToUse:        parsed.WhenToUse,
		DeclaredTools:    string(declared),
		Visibility:       VisibilityPrivate,
		ModerationStatus: ModDraft,
		Category:         normalizeCategory(category),
		ContentSource:    normalizeContentSource(contentSource),
		Status:           StatusActive,
	}
	if err := s.repo.CreateSkill(skill); err != nil {
		return nil, err
	}
	if _, err := s.addVersion(ctx, skill, parsed, files, skillDir, "初版"); err != nil {
		return nil, err
	}
	// 自建 skill 默认给作者装上(方便直接在 claw 用)——但仅在未达启用上限时,
	// 否则会静默造成「>5 启用、第 6 个不生效」(审计 #5 的同源路径,别绕过 cap)。
	if s.checkEnableCap(userID, skill.ID) == nil {
		if _, err := s.repo.UpsertEnabled(userID, skill.ID, SourceSelf); err == nil {
			_ = s.repo.IncInstallCount(skill.ID, 1)
		}
	}
	return s.repo.GetSkillByID(skill.ID)
}

// UpdateContent 传新版本(改内容 = 追加不可变版本;若已 public 则重置为 pending 待重审)。
func (s *Service) UpdateContent(ctx context.Context, userID, skillID uint, files []BundleFile, changelog string) (*SkillVersion, error) {
	skill, err := s.ownedSkill(userID, skillID)
	if err != nil {
		return nil, err
	}
	n, err := s.repo.CountVersions(skillID)
	if err != nil {
		return nil, err
	}
	if n >= int64(MaxVersionsPerSkill) {
		return nil, ErrTooManyVersions
	}
	skillMd, skillDir, err := FindSkillMd(files)
	if err != nil {
		return nil, err
	}
	parsed, err := ParseAndNormalize(skillMd, skill.Name)
	if err != nil {
		return nil, err
	}
	ver, err := s.addVersion(ctx, skill, parsed, files, skillDir, changelog)
	if err != nil {
		return nil, err
	}
	// 改内容后:若已公开,退回 pending 重审(版本级审核)。
	if skill.Visibility == VisibilityPublic {
		_ = s.repo.UpdateSkillFields(skillID, map[string]any{"moderation_status": ModPending})
	}
	return ver, nil
}

// addVersion 建一条不可变版本:claw 用 namespaced SKILL.md(DB skill_md);外部下载用干净 slug 的
// tar.gz(根=<slug>/,存 MinIO)。文件清单落库。
func (s *Service) addVersion(ctx context.Context, skill *UserSkill, parsed *ParsedSkill, files []BundleFile, skillDir string, changelog string) (*SkillVersion, error) {
	next, err := s.repo.MaxVersion(skill.ID)
	if err != nil {
		return nil, err
	}
	next++

	// 两种渲染:claw 用命名空间名(防会话内撞名);下载给外部用干净 slug(外部文件夹名=slug)。
	clawSkillMd := RenderNormalizedSkillMd(parsed, GuideName(skill.UserID, skill.Slug))
	downloadSkillMd := RenderNormalizedSkillMd(parsed, skill.Slug)

	// 构建供外部下载的 tar.gz(根=<slug>/,含干净 SKILL.md + 附带文件)并存 MinIO。
	tarball, terr := BuildDownloadTarball(skill.Slug, files, skillDir, downloadSkillMd)
	if terr != nil {
		return nil, ErrBadBundle
	}
	sum := sha256.Sum256(tarball)
	sha := hex.EncodeToString(sum[:])
	downloadKey := fmt.Sprintf("skills/%d/%d/v%d/%s.tar.gz", skill.UserID, skill.ID, next, sha)
	if storage.IsEnabled() {
		if _, perr := storage.PutObject(ctx, storage.SkillBundlesBucket(), downloadKey,
			bytes.NewReader(tarball), int64(len(tarball)),
			storage.PutOptions{ContentType: "application/gzip"}); perr != nil {
			downloadKey = "" // 存失败 → download 端点回退(见 GetDownloadTarball)
		}
	} else {
		downloadKey = ""
	}

	fileManifest := Manifest(files, skillDir)
	fileManifestJSON, _ := json.Marshal(fileManifest)
	manifest, _ := json.Marshal(map[string]any{
		"name": parsed.Name, "description": parsed.Description, "menu": parsed.Menu,
		"when_to_use": parsed.WhenToUse, "axis": parsed.Axis, "declared_tools": parsed.DeclaredTools,
	})
	scanStatus, scanReport := staticScan(parsed.Body)
	scanReportJSON, _ := json.Marshal(scanReport)

	ver := &SkillVersion{
		SkillID:           skill.ID,
		Version:           next,
		ObjectKey:         downloadKey,
		DownloadObjectKey: downloadKey,
		BundleSha256:      sha,
		BundleSize:        int64(len(tarball)),
		ManifestJSON:      string(manifest),
		FileManifest:      string(fileManifestJSON),
		SkillMD:           clawSkillMd,
		EntryCount:        len(files),
		ScanStatus:        scanStatus,
		ScanReport:        string(scanReportJSON),
		ModerationStatus:  ModPending,
		Changelog:         truncateRunes(changelog, 512),
	}
	if err := s.repo.CreateVersion(ver); err != nil {
		return nil, err
	}
	// 指向新版本 + 同步展示元数据(name/description → tagline 若空)。
	fields := map[string]any{"current_version_id": ver.ID}
	if strings.TrimSpace(skill.Tagline) == "" && parsed.Description != "" {
		fields["tagline"] = truncateRunes(parsed.Description, 255)
	}
	fields["when_to_use"] = parsed.WhenToUse
	declared, _ := json.Marshal(parsed.DeclaredTools)
	fields["declared_tools"] = string(declared)
	if err := s.repo.UpdateSkillFields(skill.ID, fields); err != nil {
		return nil, err
	}
	return ver, nil
}

func normalizeContentSource(s string) string {
	if s == "reposted" {
		return "reposted"
	}
	return "original"
}

// uniqueSlug 在 base 上加数字后缀直到唯一。
func (s *Service) uniqueSlug(base string) (string, error) {
	for i := 0; i < 50; i++ {
		cand := base
		if i > 0 {
			cand = fmt.Sprintf("%s-%d", base, i+1)
		}
		exists, err := s.repo.SlugExists(cand)
		if err != nil {
			return "", err
		}
		if !exists {
			return cand, nil
		}
	}
	return fmt.Sprintf("%s-%d", base, time.Now().UnixNano()%100000), nil
}

// ── 元数据 / 可见性 / 删除 ───────────────────────────────────────────────────

func (s *Service) UpdateMeta(userID, skillID uint, req UpdateSkillMetaRequest) error {
	if _, err := s.ownedSkill(userID, skillID); err != nil {
		return err
	}
	fields := map[string]any{}
	if req.Name != "" {
		fields["name"] = truncateRunes(sanitizeText(req.Name), 120)
	}
	if req.Tagline != "" {
		fields["tagline"] = truncateRunes(sanitizeText(req.Tagline), 255)
	}
	if req.Category != "" {
		fields["category"] = normalizeCategory(req.Category)
	}
	// 注:可见性经 Publish/Unpublish 专门管;此处不改 visibility。
	if len(fields) == 0 {
		return nil
	}
	return s.repo.UpdateSkillFields(skillID, fields)
}

// Publish 转 unlisted / public。public → moderation_status=pending 进审核队列;unlisted 不必过审。
func (s *Service) Publish(userID, skillID uint, visibility string) error {
	if _, err := s.ownedSkill(userID, skillID); err != nil {
		return err
	}
	fields := map[string]any{"visibility": visibility}
	if visibility == VisibilityPublic {
		fields["moderation_status"] = ModPending
	} else {
		fields["moderation_status"] = ModDraft
	}
	return s.repo.UpdateSkillFields(skillID, fields)
}

// Unpublish 转回 private。
func (s *Service) Unpublish(userID, skillID uint) error {
	if _, err := s.ownedSkill(userID, skillID); err != nil {
		return err
	}
	return s.repo.UpdateSkillFields(skillID, map[string]any{
		"visibility": VisibilityPrivate, "moderation_status": ModDraft,
	})
}

func (s *Service) DeleteSkill(userID, skillID uint) error {
	if _, err := s.ownedSkill(userID, skillID); err != nil {
		return err
	}
	// 软删 + 移除所有人的启用(避免继续物化)。
	if err := s.repo.UpdateSkillFields(skillID, map[string]any{"status": StatusDeleted, "visibility": VisibilityPrivate}); err != nil {
		return err
	}
	return nil
}

// ── 浏览 / 详情 / 我的 ───────────────────────────────────────────────────────

func (s *Service) ListMarket(userID uint, req ListMarketRequest) (*ListMarketResponse, error) {
	if req.Page < 1 {
		req.Page = 1
	}
	if req.PageSize < 1 || req.PageSize > 48 {
		req.PageSize = 24
	}
	rows, total, err := s.repo.ListMarket(req)
	if err != nil {
		return nil, err
	}
	authorIDs := make([]uint, 0, len(rows))
	for _, r := range rows {
		authorIDs = append(authorIDs, r.UserID)
	}
	names := s.repo.GetUsernames(authorIDs)
	installed := s.installedSet(userID)
	list := make([]SkillCardDTO, 0, len(rows))
	for _, r := range rows {
		list = append(list, s.toCard(&r, names, installed, userID))
	}
	return &ListMarketResponse{List: list, Total: total, Page: req.Page, PageSize: req.PageSize}, nil
}

func (s *Service) GetDetail(userID uint, idOrSlug, host string) (*SkillDetailDTO, error) {
	skill, err := s.resolveSkill(idOrSlug)
	if err != nil {
		return nil, err
	}
	isOwner := skill.UserID == userID
	// 非作者只能看 public+approved(或 unlisted 直链)。private 仅作者可见。
	if !isOwner {
		if skill.Status != StatusActive {
			return nil, ErrNotFound
		}
		if skill.Visibility == VisibilityPrivate {
			return nil, ErrNotFound
		}
		if skill.Visibility == VisibilityPublic && skill.ModerationStatus != ModApproved {
			return nil, ErrNotFound
		}
	}
	return s.buildDetailDTO(skill, userID, host), nil
}

// GetPublicDetail 匿名/分享落地页用:只返回 public+approved+active 的 skill(否则 404 防枚举)。
func (s *Service) GetPublicDetail(slug, host string) (*SkillDetailDTO, error) {
	skill, err := s.repo.GetSkillBySlug(slug)
	if err != nil {
		return nil, err
	}
	if !s.isPublicAvailable(skill) {
		return nil, ErrNotFound
	}
	return s.buildDetailDTO(skill, 0, host), nil
}

// buildDetailDTO 组装详情 DTO(SKILL.md 预览 + 文件清单 + 跨 agent 安装命令)。
func (s *Service) buildDetailDTO(skill *UserSkill, userID uint, host string) *SkillDetailDTO {
	names := s.repo.GetUsernames([]uint{skill.UserID})
	installed := s.installedSet(userID)
	card := s.toCard(skill, names, installed, userID)

	var body string
	var ver int
	var fileManifest []FileManifestEntry
	if skill.CurrentVersionID != nil {
		if v, verr := s.repo.GetVersionByID(*skill.CurrentVersionID); verr == nil {
			// 预览用干净 slug 名,不泄漏内部 namespaced 名 u<userId>-<slug>(审计 #18,与 raw/tar 一致)。
			body = renameSkillMdName(v.SkillMD, skill.Slug)
			ver = v.Version
			_ = json.Unmarshal([]byte(nonEmptyJSON(v.FileManifest)), &fileManifest)
		}
	}
	var declared []string
	_ = json.Unmarshal([]byte(nonEmptyJSON(skill.DeclaredTools)), &declared)

	dto := &SkillDetailDTO{
		SkillCardDTO:     card,
		DescriptionMD:    skill.DescriptionMD,
		WhenToUse:        skill.WhenToUse,
		DeclaredTools:    declared,
		SkillMD:          body,
		Version:          ver,
		ModerationStatus: skill.ModerationStatus,
		ContentSource:    skill.ContentSource,
		FileManifest:     fileManifest,
		CreatedAt:        skill.CreatedAt,
	}
	// 只有 public+approved 才对外提供安装命令(未过审的不给外链)。
	if s.isPublicAvailable(skill) && host != "" {
		dto.Install = installCommandsFor(skill.Slug, host)
	}
	return dto
}

// isPublicAvailable:public + approved + active(可被外部下载/安装/匿名查看)。
func (s *Service) isPublicAvailable(skill *UserSkill) bool {
	return skill.Status == StatusActive && skill.Visibility == VisibilityPublic && skill.ModerationStatus == ModApproved
}

func (s *Service) ListMySkills(userID uint) ([]MySkillDTO, error) {
	rows, err := s.repo.ListMySkills(userID)
	if err != nil {
		return nil, err
	}
	out := make([]MySkillDTO, 0, len(rows))
	for _, r := range rows {
		ver := 0
		if r.CurrentVersionID != nil {
			if v, e := s.repo.GetVersionByID(*r.CurrentVersionID); e == nil {
				ver = v.Version
			}
		}
		out = append(out, MySkillDTO{
			ID: r.ID, Slug: r.Slug, Name: r.Name, Tagline: r.Tagline, Category: r.Category,
			Visibility: r.Visibility, ModerationStatus: r.ModerationStatus, ModerationNote: r.ModerationNote,
			Status: r.Status, InstallCount: r.InstallCount, Version: ver, UpdatedAt: r.UpdatedAt,
		})
	}
	return out, nil
}

// ── 安装(install)/ 启用 ────────────────────────────────────────────────────

func (s *Service) Install(userID, skillID uint) error {
	skill, err := s.repo.GetSkillByID(skillID)
	if err != nil {
		return err
	}
	source := SourceMarket
	if skill.UserID == userID {
		source = SourceSelf
	} else {
		// 装别人的:必须 public + approved + active。
		if skill.Status != StatusActive || skill.Visibility != VisibilityPublic || skill.ModerationStatus != ModApproved {
			return ErrNotInstallable
		}
	}
	// 启用上限(审计 #5):单会话只物化最近 MaxEnabledPerSession 个,超出会静默不加载 →
	// 安装即启用,故在此处拦,让用户在点击那刻就得到反馈,而不是「装了却在 claw 不生效」。
	if err := s.checkEnableCap(userID, skillID); err != nil {
		return err
	}
	created, err := s.repo.UpsertEnabled(userID, skillID, source)
	if err != nil {
		return err
	}
	if created {
		_ = s.repo.IncInstallCount(skillID, 1)
	}
	return nil
}

func (s *Service) SetEnabled(userID, skillID uint, enabled bool) error {
	if _, err := s.repo.GetEnabled(userID, skillID); err != nil {
		return err
	}
	if enabled {
		if err := s.checkEnableCap(userID, skillID); err != nil {
			return err
		}
	}
	return s.repo.SetEnabled(userID, skillID, enabled)
}

// checkEnableCap:启用会使 enabled 数超过 MaxEnabledPerSession 时报错(该 skill 已启用则放行,幂等)。
func (s *Service) checkEnableCap(userID, skillID uint) error {
	if e, err := s.repo.GetEnabled(userID, skillID); err == nil && e.Enabled {
		return nil // 已启用,重复操作不占新额度
	}
	n, err := s.repo.CountEnabled(userID)
	if err != nil {
		return nil // 计数失败 fail-open,不阻断
	}
	if n >= int64(MaxEnabledPerSession) {
		return ErrTooManyEnabled
	}
	return nil
}

func (s *Service) Uninstall(userID, skillID uint) error {
	if _, err := s.repo.GetEnabled(userID, skillID); err != nil {
		return err
	}
	if err := s.repo.RemoveEnabled(userID, skillID); err != nil {
		return err
	}
	_ = s.repo.IncInstallCount(skillID, -1)
	return nil
}

// ListInstalled claw 启用面板:我已安装的 skill(自建 + 装的别人的)。
func (s *Service) ListInstalled(userID uint) ([]InstalledSkillDTO, error) {
	enabled, err := s.repo.ListEnabledByUser(userID)
	if err != nil {
		return nil, err
	}
	out := make([]InstalledSkillDTO, 0, len(enabled))
	for _, e := range enabled {
		skill, serr := s.repo.GetSkillByID(e.SkillID)
		if serr != nil {
			continue
		}
		out = append(out, InstalledSkillDTO{
			SkillID: skill.ID, Slug: skill.Slug, Name: skill.Name, Tagline: skill.Tagline,
			GuideName: GuideName(skill.UserID, skill.Slug), // u<作者uid>-<slug>,与会话内 Skill 帧的 input.name 对齐
			Source:    e.Source, Enabled: e.Enabled, Available: s.materializable(userID, skill),
		})
	}
	return out, nil
}

// ── 举报 ─────────────────────────────────────────────────────────────────────

// Report 举报一个**已公开**的 skill。
// 反 griefing(审计 #1):① 只能举报 public+approved+active 的 skill(不可举报私有/未列出/自己看不到的);
// ② 排除作者自举报;③ **一个举报人对一个 skill 只计一次**(不因 reason 不同刷多行);
// ④ **举报绝不自动改 moderation_status / 下架** —— 只累加计数进人工队列,由 admin takedown 决定。
// 这样单账号无法把他人内容武器化下架。
func (s *Service) Report(userID, skillID uint, req ReportRequest) error {
	skill, err := s.repo.GetSkillByID(skillID)
	if err != nil {
		return err
	}
	if !s.isPublicAvailable(skill) {
		return ErrNotFound // 只能举报公开可见的;其余一律当不存在(防枚举 + 防举报私有)
	}
	if skill.UserID == userID {
		return ErrNotInstallable // 复用「不可操作」语义:不能举报自己的 skill
	}
	// 一人一 skill 只计一次(与 reason 无关):已举报过 → 幂等成功,不再累加计数。
	if reported, _ := s.repo.HasReported(skillID, userID); reported {
		return nil
	}
	rep := &SkillReport{
		SkillID: skillID, ReporterUserID: userID, Reason: req.Reason,
		Detail: truncateRunes(req.Detail, 1024), Status: ReportOpen,
	}
	if err := s.repo.CreateReport(rep); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate") {
			return nil // 并发下的唯一键冲突,视作幂等成功
		}
		return err
	}
	_, _ = s.repo.IncReportCount(skillID) // 仅供 admin 排序/优先级;**不**据此自动下架
	return nil
}

// ── 管理端审核 ───────────────────────────────────────────────────────────────

func (s *Service) AdminList(status string) ([]MySkillDTO, error) {
	rows, err := s.repo.ListForModeration(status)
	if err != nil {
		return nil, err
	}
	out := make([]MySkillDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, MySkillDTO{
			ID: r.ID, Slug: r.Slug, Name: r.Name, Tagline: r.Tagline, Category: r.Category,
			Visibility: r.Visibility, ModerationStatus: r.ModerationStatus, ModerationNote: r.ModerationNote,
			Status: r.Status, InstallCount: r.InstallCount, UpdatedAt: r.UpdatedAt,
		})
	}
	return out, nil
}

func (s *Service) Approve(skillID uint) error {
	fields := map[string]any{"moderation_status": ModApproved, "moderation_note": ""}
	if err := s.repo.UpdateSkillFields(skillID, fields); err != nil {
		return err
	}
	if sk, err := s.repo.GetSkillByID(skillID); err == nil && sk.CurrentVersionID != nil {
		_ = s.repo.UpdateVersionFields(*sk.CurrentVersionID, map[string]any{"moderation_status": ModApproved})
	}
	return nil
}

func (s *Service) Reject(skillID uint, note string) error {
	return s.repo.UpdateSkillFields(skillID, map[string]any{
		"moderation_status": ModRejected, "moderation_note": truncateRunes(sanitizeText(note), 512),
	})
}

// Takedown 全局 kill-switch:下架 + 转 private(已装用户下次建会话物化时跳过)。
func (s *Service) Takedown(skillID uint, note string) error {
	return s.repo.UpdateSkillFields(skillID, map[string]any{
		"status": StatusDisabledByAdmin, "visibility": VisibilityPrivate,
		"moderation_status": ModRejected, "moderation_note": truncateRunes(sanitizeText(note), 512),
	})
}

func (s *Service) ListReports(status string) ([]SkillReport, error) { return s.repo.ListReports(status) }

func (s *Service) ResolveReport(id, adminID uint, action string) error {
	status := ReportDismissed
	if action == "actioned" {
		status = ReportActioned
	}
	return s.repo.ResolveReport(id, adminID, status)
}

// ── 建会话钩子:MaterializeForUser(agentbridge.SessionSkillsProvider)────────
//
// 返回该用户在 claw 建会话时要物化的 skill(≤MaxEnabledPerSession)。只走 guides 层:内容是规范化后
// 的 SKILL.md 正文,executor 写 <sid>.skills/guides/<name>/SKILL.md。绝不返回未过审的他人 skill。
func (s *Service) MaterializeForUser(ctx context.Context, userID uint) ([]agent.SessionSkill, error) {
	enabled, err := s.repo.ListEnabledByUser(userID)
	if err != nil {
		return nil, err
	}
	out := make([]agent.SessionSkill, 0, MaxEnabledPerSession)
	for _, e := range enabled {
		if !e.Enabled {
			continue
		}
		skill, serr := s.repo.GetSkillByID(e.SkillID)
		if serr != nil || !s.materializable(userID, skill) {
			continue
		}
		verID := skill.CurrentVersionID
		if e.PinnedVersionID != nil {
			verID = e.PinnedVersionID
		}
		if verID == nil {
			continue
		}
		ver, verr := s.repo.GetVersionByID(*verID)
		if verr != nil || strings.TrimSpace(ver.SkillMD) == "" {
			continue
		}
		out = append(out, agent.SessionSkill{
			Name:    GuideName(skill.UserID, skill.Slug),
			SkillMD: ver.SkillMD,
		})
		if len(out) >= MaxEnabledPerSession {
			break
		}
	}
	return out, nil
}

// ── 跨 agent 分发:安装命令 / 下载 / install.md / marketplace.json ────────────

var ErrDownloadUnavailable = errors.New("下载暂不可用")

// installCommandsFor 按 baseURL(如 https://host)生成某 skill 的跨 agent 安装命令。
func installCommandsFor(slug, baseURL string) *InstallCommands {
	baseURL = strings.TrimRight(baseURL, "/")
	dl := baseURL + "/api/v1/skills/" + slug + "/download"
	return &InstallCommands{
		DownloadURL:    dl,
		ClaudeCodeCurl: fmt.Sprintf("mkdir -p ~/.claude/skills && curl -fsSL '%s' | tar -xz -C ~/.claude/skills", dl),
		MarketplaceAdd: "", // 原生 /plugin install 需 git 托管,当前主推 curl(见 install.md)
		InstallMdURL:   baseURL + "/api/v1/skills/install.md",
		ShareURL:       baseURL + "/skills/" + slug,
	}
}

// OpenDownload 打开某 public+approved skill 的下载 tar.gz 流(供 handler 流式回传)。
func (s *Service) OpenDownload(ctx context.Context, slug string) (io.ReadCloser, int64, error) {
	skill, err := s.repo.GetSkillBySlug(slug)
	if err != nil {
		return nil, 0, err
	}
	if !s.isPublicAvailable(skill) || skill.CurrentVersionID == nil {
		return nil, 0, ErrNotFound
	}
	v, err := s.repo.GetVersionByID(*skill.CurrentVersionID)
	if err != nil {
		return nil, 0, err
	}
	if v.DownloadObjectKey == "" || !storage.IsEnabled() {
		return nil, 0, ErrDownloadUnavailable
	}
	rc, info, err := storage.GetObject(ctx, storage.SkillBundlesBucket(), v.DownloadObjectKey)
	if err != nil {
		return nil, 0, err
	}
	var size int64
	if info != nil {
		size = info.Size
	}
	return rc, size, nil
}

// GetPublicSkillMd 返回某 public+approved skill 的干净 SKILL.md 文本(供 raw 端点)。
func (s *Service) GetPublicSkillMd(slug string) (string, error) {
	skill, err := s.repo.GetSkillBySlug(slug)
	if err != nil {
		return "", err
	}
	if !s.isPublicAvailable(skill) || skill.CurrentVersionID == nil {
		return "", ErrNotFound
	}
	v, err := s.repo.GetVersionByID(*skill.CurrentVersionID)
	if err != nil {
		return "", err
	}
	// v.SkillMD 是 namespaced(claw 用);对外换成干净 slug 名。简单做法:把首行 name 替换。
	return renameSkillMdName(v.SkillMD, skill.Slug), nil
}

// BuildInstallManifest 生成商店 install.md(Markdown,像 Red Skill 的安装说明)。
func (s *Service) BuildInstallManifest(baseURL string) string {
	baseURL = strings.TrimRight(baseURL, "/")
	var b strings.Builder
	b.WriteString("# Scholay Skills 安装说明\n\n")
	b.WriteString("Scholay Skills 是学术智能体技能的开放注册中心。技能是标准的 **Agent Skill**(一个含 `SKILL.md` 的文件夹),\n")
	b.WriteString("可用于 Claude Code / Claude 家族及任何支持 Agent Skills 的智能体。\n\n")
	b.WriteString("## 安装某个技能(通用 · 推荐)\n\n")
	b.WriteString("把技能下载解压进你的 skills 目录即可。`<slug>` 是技能页地址里的短名:\n\n")
	b.WriteString("```bash\n")
	b.WriteString("mkdir -p ~/.claude/skills\n")
	b.WriteString("curl -fsSL '" + baseURL + "/api/v1/skills/<slug>/download' | tar -xz -C ~/.claude/skills\n")
	b.WriteString("```\n\n")
	b.WriteString("Claude Code 会自动发现 `~/.claude/skills/` 下的技能 —— **重开一个会话即可生效**(无需额外命令)。\n\n")
	b.WriteString("## 浏览可用技能\n\n")
	b.WriteString("- 网页:" + baseURL + "/skills\n")
	b.WriteString("- 机器可读的技能发现目录(JSON;便于工具批量索引,非 Claude Code 原生插件市场):" + baseURL + "/api/v1/skills/marketplace.json\n\n")
	b.WriteString("## 其他智能体\n\n")
	b.WriteString("任意智能体:下载 `.../skills/<slug>/download`(tar.gz,解压后是一个 `<slug>/` 文件夹),放到该智能体的 skills 目录即可。\n\n")
	b.WriteString("> ⚠️ 社区技能由用户上传。请在使用前审阅其 `SKILL.md` 与附带文件;附带脚本会在**你自己的环境**中运行,风险自负。\n")
	return b.String()
}

// BuildMarketplaceJSON 生成 Claude Code marketplace 目录(approved public skills)。
// 注:原生 `/plugin marketplace add` 吃 git 源;当前 plugins[].source 指向我们的下载 URL(url 源),
// 主推的仍是 install.md 里的 curl 一行。此清单先供发现/未来 git 镜像。
func (s *Service) BuildMarketplaceJSON(baseURL string) ([]byte, error) {
	baseURL = strings.TrimRight(baseURL, "/")
	rows, err := s.repo.ListApprovedPublic(500)
	if err != nil {
		return nil, err
	}
	type mpPlugin struct {
		Name        string   `json:"name"`
		Source      string   `json:"source"`
		Description string   `json:"description"`
		Homepage    string   `json:"homepage,omitempty"`
		Keywords    []string `json:"keywords,omitempty"`
	}
	plugins := make([]mpPlugin, 0, len(rows))
	for _, r := range rows {
		plugins = append(plugins, mpPlugin{
			Name:        r.Slug,
			Source:      baseURL + "/api/v1/skills/" + r.Slug + "/download",
			Description: r.Tagline,
			Homepage:    baseURL + "/skills/" + r.Slug,
		})
	}
	out := map[string]any{
		"name":        "scholay-skills",
		"owner":       map[string]string{"name": "Scholay"},
		"description": "Scholay 学术智能体技能开放注册中心",
		"plugins":     plugins,
	}
	return json.MarshalIndent(out, "", "  ")
}

// renameSkillMdName 把 SKILL.md frontmatter 里的 `name: <x>` 换成干净 slug(对外展示)。
func renameSkillMdName(md, slug string) string {
	lines := strings.Split(md, "\n")
	for i, ln := range lines {
		if strings.HasPrefix(strings.TrimSpace(ln), "name:") {
			lines[i] = "name: " + slug
			break
		}
	}
	return strings.Join(lines, "\n")
}

// ── 内部辅助 ─────────────────────────────────────────────────────────────────

// materializable 判定一份 skill 能否被 userID 物化进会话:
//   - 作者本人(self):active 即可(含 private,自用不可信但仍是自己的)。
//   - 他人:必须 active + public + approved。
func (s *Service) materializable(userID uint, skill *UserSkill) bool {
	if skill.Status != StatusActive {
		return false
	}
	if skill.UserID == userID {
		return true
	}
	return skill.Visibility == VisibilityPublic && skill.ModerationStatus == ModApproved
}

func (s *Service) ownedSkill(userID, skillID uint) (*UserSkill, error) {
	skill, err := s.repo.GetSkillByID(skillID)
	if err != nil {
		return nil, err
	}
	if skill.UserID != userID {
		return nil, ErrNotOwner
	}
	if skill.Status == StatusDeleted {
		return nil, ErrNotFound
	}
	return skill, nil
}

func (s *Service) resolveSkill(idOrSlug string) (*UserSkill, error) {
	if id := parseUint(idOrSlug); id > 0 {
		return s.repo.GetSkillByID(id)
	}
	return s.repo.GetSkillBySlug(idOrSlug)
}

func (s *Service) installedSet(userID uint) map[uint]bool {
	set := map[uint]bool{}
	if userID == 0 {
		return set
	}
	rows, _ := s.repo.ListEnabledByUser(userID)
	for _, e := range rows {
		set[e.SkillID] = true
	}
	return set
}

func (s *Service) toCard(r *UserSkill, names map[uint]string, installed map[uint]bool, userID uint) SkillCardDTO {
	author := names[r.UserID]
	if author == "" {
		author = fmt.Sprintf("用户#%d", r.UserID)
	}
	return SkillCardDTO{
		ID: r.ID, Slug: r.Slug, Name: r.Name, Tagline: r.Tagline, Category: r.Category,
		AuthorName: author, InstallCount: r.InstallCount, Visibility: r.Visibility,
		UpdatedAt: r.UpdatedAt, Installed: installed[r.ID], IsOwner: r.UserID == userID,
	}
}

func normalizeCategory(c string) string {
	c = strings.ToLower(strings.TrimSpace(c))
	if c == "" || len([]rune(c)) > 40 || !skillNameRe.MatchString(c) {
		return "other"
	}
	return c
}

func nonEmptyJSON(s string) string {
	if strings.TrimSpace(s) == "" {
		return "[]"
	}
	return s
}

func parseUint(s string) uint {
	var n uint
	for _, ch := range s {
		if ch < '0' || ch > '9' {
			return 0
		}
		n = n*10 + uint(ch-'0')
	}
	return n
}

// staticScan 降噪层(非信任边界):命中已知注入模式 → suspect。
func staticScan(body string) (status string, report map[string]any) {
	lower := strings.ToLower(body)
	hits := []string{}
	patterns := map[string]string{
		"ignore previous":       "ignore previous instructions",
		"disregard above":       "disregard above",
		"you are now":           "role hijack",
		"system prompt":         "system prompt reference",
		"api_key":               "hardcoded secret ref",
		"minicod_api_key":       "key exfil ref",
		"executor_auth_token":   "internal token ref",
	}
	for k, label := range patterns {
		if strings.Contains(lower, k) {
			hits = append(hits, label)
		}
	}
	if len(hits) > 0 {
		return ScanSuspect, map[string]any{"hits": hits}
	}
	return ScanClean, map[string]any{"hits": []string{}}
}
