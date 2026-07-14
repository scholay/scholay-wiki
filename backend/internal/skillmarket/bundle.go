// ============================================================================
// Skills 市场 · 多文件 bundle 处理(解析 / 安全校验 / tar.gz 构建)
//
// 我们是「注册中心 + tier-1 执行器」:bundle 里的附带代码(.py/.js 等)**不在我们平台执行**,
// 只存储 + 供外部 agent 下载后在他们自己环境跑。但既然对外服务制品,解析/存储阶段必须硬校验
// (路径穿越 / 符号链接 / 超限 / 扩展名白名单),防止把恶意归档当制品分发或在解压时打穿宿主。
// backend 全程只读取字节 + 打包,绝不执行 bundle 内任何内容。
// ============================================================================

package skillmarket

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"errors"
	"io"
	"path"
	"strings"
)

const (
	MaxSingleFileBytes int64 = 10 << 20 // 单文件 10MB(总量上限 = model.MaxBundleBytes 30MB)
	MaxBundleFiles           = 50
)

// allowedExts 是 bundle 内允许的文件扩展名(文本/代码/常见资源)。拒二进制/可执行。
// 我们不跑这些文件,但只白名单「文本+图片」以防有人把制品当二进制投递面。
var allowedExts = map[string]bool{
	".md": true, ".markdown": true, ".txt": true, ".rst": true,
	".py": true, ".js": true, ".mjs": true, ".cjs": true, ".ts": true, ".tsx": true, ".jsx": true,
	".sh": true, ".bash": true, ".rb": true, ".go": true, ".rs": true, ".java": true, ".php": true,
	".html": true, ".htm": true, ".css": true, ".scss": true,
	".json": true, ".jsonc": true, ".yaml": true, ".yml": true, ".toml": true, ".ini": true, ".cfg": true,
	".xml": true, ".csv": true, ".tsv": true, ".sql": true,
	".svg": true, ".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true, ".ico": true,
}

// isJunkPath —— OS/打包器自动生成的垃圾文件,解析时**静默跳过**(不因它们拒整包)。
// 审计 #2/#16:macOS Finder 压缩 / webkitdirectory 选目录几乎必带 .DS_Store / __MACOSX/ / ._* /
// AppleDouble,这些命中非白名单扩展名会让最普遍的上传路径整包 400。
func isJunkPath(p string) bool {
	p = strings.ReplaceAll(p, "\\", "/")
	base := p
	if i := strings.LastIndex(p, "/"); i >= 0 {
		base = p[i+1:]
	}
	if strings.HasPrefix(p, "__MACOSX/") || strings.Contains(p, "/__MACOSX/") {
		return true
	}
	if strings.HasPrefix(base, "._") { // AppleDouble
		return true
	}
	switch base {
	case ".DS_Store", "Thumbs.db", "desktop.ini", ".gitkeep":
		return true
	}
	return false
}

// BundleFile 是 bundle 内的一份文件(相对路径 + 内容)。
type BundleFile struct {
	Path string // bundle 内相对路径(已规范化,禁 ../ / 绝对路径)
	Data []byte
}

// FileManifestEntry 文件清单项(落库 + 前端展示)。
type FileManifestEntry struct {
	Path string `json:"path"`
	Size int64  `json:"size"`
}

var (
	ErrBundleNoSkillMd    = errors.New("bundle 内未找到 SKILL.md")
	ErrBundleMultiSkillMd = errors.New("bundle 内有多个 SKILL.md,请只保留一个")
	ErrBundlePathEscape   = errors.New("bundle 含非法路径(路径穿越 / 绝对路径 / 符号链接)")
	ErrBundleFileTooLarge = errors.New("bundle 内有文件超过 10MB")
	ErrBundleTooLarge     = errors.New("bundle 总大小超过 30MB")
	ErrBundleTooManyFiles = errors.New("bundle 文件数超过 50")
	ErrBundleBadExt       = errors.New("bundle 含不允许的文件类型(仅支持文本/代码/图片)")
)

// ParseZipBundle 解析 zip 字节为 BundleFile 列表(安全校验)。
func ParseZipBundle(raw []byte) ([]BundleFile, error) {
	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		return nil, ErrBadBundle
	}
	var files []BundleFile
	var total int64
	for _, f := range zr.File {
		// 符号链接 / 非常规文件拒绝(zip mode 高位)。
		if f.Mode()&0o120000 == 0o120000 { // symlink
			return nil, ErrBundlePathEscape
		}
		if f.FileInfo().IsDir() {
			continue
		}
		if isJunkPath(f.Name) {
			continue // OS/打包器垃圾文件:静默跳过,不拒整包
		}
		clean, ok := safeBundlePath(f.Name)
		if !ok {
			return nil, ErrBundlePathEscape
		}
		if !allowedExt(clean) {
			return nil, ErrBundleBadExt
		}
		if int64(f.UncompressedSize64) > MaxSingleFileBytes {
			return nil, ErrBundleFileTooLarge
		}
		rc, oerr := f.Open()
		if oerr != nil {
			return nil, ErrBadBundle
		}
		// 限幅读(防解压炸弹:即便声明的 size 小,也只读到上限)。
		data, rerr := io.ReadAll(io.LimitReader(rc, MaxSingleFileBytes+1))
		rc.Close()
		if rerr != nil || int64(len(data)) > MaxSingleFileBytes {
			return nil, ErrBundleFileTooLarge
		}
		total += int64(len(data))
		if total > MaxBundleBytes {
			return nil, ErrBundleTooLarge
		}
		if len(files) >= MaxBundleFiles {
			return nil, ErrBundleTooManyFiles
		}
		files = append(files, BundleFile{Path: clean, Data: data})
	}
	return files, nil
}

// NewBundleFromFiles 从「文件夹上传」的多份 (相对路径, 内容) 构造 bundle(同样安全校验)。
func NewBundleFromFiles(paths []string, datas [][]byte) ([]BundleFile, error) {
	if len(paths) != len(datas) {
		return nil, ErrBadBundle
	}
	var files []BundleFile
	var total int64
	for i, p := range paths {
		if isJunkPath(p) {
			continue // OS/打包器垃圾文件:静默跳过
		}
		clean, ok := safeBundlePath(p)
		if !ok {
			return nil, ErrBundlePathEscape
		}
		if !allowedExt(clean) {
			return nil, ErrBundleBadExt
		}
		d := datas[i]
		if int64(len(d)) > MaxSingleFileBytes {
			return nil, ErrBundleFileTooLarge
		}
		total += int64(len(d))
		if total > MaxBundleBytes {
			return nil, ErrBundleTooLarge
		}
		if len(files) >= MaxBundleFiles {
			return nil, ErrBundleTooManyFiles
		}
		files = append(files, BundleFile{Path: clean, Data: d})
	}
	return files, nil
}

// FindSkillMd 在 bundle 里定位唯一的 SKILL.md(根或任意层,大小写不敏感文件名==SKILL.md)。
// 返回其内容 + 该文件在 bundle 内的相对路径(用于把附带文件重定位到与它同层)。
func FindSkillMd(files []BundleFile) (content string, dir string, err error) {
	var found *BundleFile
	for i := range files {
		if strings.EqualFold(path.Base(files[i].Path), "SKILL.md") {
			if found != nil {
				return "", "", ErrBundleMultiSkillMd
			}
			found = &files[i]
		}
	}
	if found == nil {
		return "", "", ErrBundleNoSkillMd
	}
	return string(found.Data), path.Dir(found.Path), nil
}

// Manifest 生成文件清单(相对 SKILL.md 所在目录的路径),供落库/展示。
func Manifest(files []BundleFile, skillDir string) []FileManifestEntry {
	out := make([]FileManifestEntry, 0, len(files))
	for _, f := range files {
		out = append(out, FileManifestEntry{Path: relTo(skillDir, f.Path), Size: int64(len(f.Data))})
	}
	return out
}

// BuildDownloadTarball 打包供外部下载的 tar.gz:根目录 = <slug>/,含干净 SKILL.md(cleanSkillMd,name=slug)
// + 其余附带文件(重定位到 <slug>/ 下,相对 SKILL.md 原目录)。任何 agent 解压进 skills 目录即用。
func BuildDownloadTarball(slug string, files []BundleFile, skillDir string, cleanSkillMd string) ([]byte, error) {
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)

	writeEntry := func(name string, data []byte) error {
		if err := tw.WriteHeader(&tar.Header{
			Name: slug + "/" + name,
			Mode: 0o644,
			Size: int64(len(data)),
		}); err != nil {
			return err
		}
		_, err := tw.Write(data)
		return err
	}

	// 干净 SKILL.md(替换原始那份)。
	if err := writeEntry("SKILL.md", []byte(cleanSkillMd)); err != nil {
		return nil, err
	}
	// 其余附带文件(排除原始 SKILL.md)。
	for _, f := range files {
		if strings.EqualFold(path.Base(f.Path), "SKILL.md") {
			continue
		}
		if err := writeEntry(relTo(skillDir, f.Path), f.Data); err != nil {
			return nil, err
		}
	}
	if err := tw.Close(); err != nil {
		return nil, err
	}
	if err := gz.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// ── 内部 ─────────────────────────────────────────────────────────────────────

// safeBundlePath 规范化 bundle 内路径并断言安全(禁绝对路径 / .. 穿越 / 空)。
func safeBundlePath(p string) (string, bool) {
	p = strings.ReplaceAll(p, "\\", "/")
	p = strings.TrimPrefix(p, "./")
	if p == "" || strings.HasPrefix(p, "/") {
		return "", false
	}
	clean := path.Clean(p)
	if clean == "." || clean == ".." || strings.HasPrefix(clean, "../") || strings.Contains(clean, "/../") {
		return "", false
	}
	// 单段过长防御。
	if len(clean) > 255 {
		return "", false
	}
	return clean, true
}

func allowedExt(p string) bool {
	i := strings.LastIndex(p, ".")
	if i < 0 {
		return false
	}
	return allowedExts[strings.ToLower(p[i:])]
}

// relTo 把 bundle 内路径转成「相对 SKILL.md 所在目录」的路径,使下载包以 SKILL.md 为根。
// 审计 #8:SKILL.md 子树**外**的文件不能退化成 basename(会与其它文件撞名 → tar 重复头 → 解压覆盖丢文件)。
// 改为**保留完整相对路径**(仍在 <slug>/ 内,唯一不撞名),让下载制品 = 作者上传的完整内容。
func relTo(dir, p string) string {
	if dir == "." || dir == "" {
		return p
	}
	prefix := dir + "/"
	if strings.HasPrefix(p, prefix) {
		return p[len(prefix):]
	}
	return p // 子树外文件:保留完整相对路径(已过 safeBundlePath,不会逃出 <slug>/)
}
