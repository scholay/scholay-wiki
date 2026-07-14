import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';

/**
 * Skills 市场 —— 用户上传/分享 skill + claw 动态加载。
 * 对接后端 /api/v1/user/skills*(我的)、/api/v1/user/skills/market*(浏览)、
 * /api/v1/user/skill-installs*(安装/启用)。
 *
 * ⚠️ skill 的 name/tagline/skillMd 等是**不可信用户内容**:任何渲染都禁 raw HTML
 * (SKILL.md 预览用 MarkdownRenderer,它不开 rehype-raw)。
 *
 * 放在 shared/api 而非 features/skills:claw 启用面板要用 useInstalledSkills,
 * 而 claw 不允许 import features/skills(单向依赖)。
 *
 * queryKey:['skills','market',params] 浏览;['skills','detail',id] 详情;
 * ['skills','mine'] 我的;['skills','installed'] 已安装(claw 面板)。
 * 镜像 Go DTO(internal/skillmarket/model.go)。
 */

// ── 类型(镜像 Go DTO)────────────────────────────────────────────────────────

export type SkillVisibility = 'private' | 'unlisted' | 'public';
export type SkillModeration =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'flagged';

export interface SkillCard {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  category: string;
  authorName: string;
  installCount: number;
  visibility: SkillVisibility;
  updatedAt: string;
  installed: boolean;
  isOwner: boolean;
}

export interface FileManifestEntry {
  path: string;
  size: number;
}

/** 跨 agent 安装命令(public+approved 才有;镜像 Go InstallCommands)。 */
export interface InstallCommands {
  downloadUrl: string;
  claudeCodeCurl: string;
  marketplaceAdd: string;
  installMdUrl: string;
  shareUrl: string;
}

export interface SkillDetail extends SkillCard {
  descriptionMd: string;
  whenToUse: string;
  declaredTools: string[];
  skillMd: string;
  version: number;
  moderationStatus: SkillModeration;
  contentSource: 'original' | 'reposted';
  fileManifest: FileManifestEntry[];
  install: InstallCommands | null;
  createdAt: string;
}

export interface MySkill {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  category: string;
  visibility: SkillVisibility;
  moderationStatus: SkillModeration;
  moderationNote: string;
  status: string;
  installCount: number;
  version: number;
  updatedAt: string;
}

export interface InstalledSkill {
  skillId: number;
  slug: string;
  name: string;
  tagline: string;
  source: 'self' | 'market';
  enabled: boolean;
  available: boolean;
}

export interface MarketQuery {
  q?: string;
  category?: string;
  sort?: 'popular' | 'recent';
  page?: number;
  pageSize?: number;
}

export interface MarketPage {
  list: SkillCard[];
  total: number;
  page: number;
  pageSize: number;
}

export type ReportReason =
  | 'prompt_injection'
  | 'malware'
  | 'data_exfil'
  | 'ip_infringe'
  | 'spam'
  | 'other';

// ── 浏览 / 详情 / 我的 / 已安装 ───────────────────────────────────────────────

export function useSkillMarket(params: MarketQuery) {
  return useQuery({
    queryKey: ['skills', 'market', params],
    queryFn: async (): Promise<MarketPage> => {
      // 公开端点(optional-auth):匿名可浏览(功能广场融合),登录仍返回 installed 标记。
      const { data } = await http.get<{ data: MarketPage }>('/public/skills', {
        params,
      });
      return data.data;
    },
  });
}

export function useSkillDetail(idOrSlug: string | undefined) {
  return useQuery({
    queryKey: ['skills', 'detail', idOrSlug],
    enabled: !!idOrSlug,
    queryFn: async (): Promise<SkillDetail> => {
      const { data } = await http.get<{ data: SkillDetail }>(
        `/user/skills/market/${idOrSlug}`
      );
      return data.data;
    },
  });
}

export function useMySkills() {
  return useQuery({
    queryKey: ['skills', 'mine'],
    queryFn: async (): Promise<MySkill[]> => {
      const { data } = await http.get<{ data: { list: MySkill[] } }>(
        '/user/skills'
      );
      return data.data.list ?? [];
    },
  });
}

export function useInstalledSkills() {
  return useQuery({
    queryKey: ['skills', 'installed'],
    // 列表类 query:切走再回来须重取,避免启用态陈旧(见 claw-history-list-loading 教训)。
    refetchOnMount: 'always',
    queryFn: async (): Promise<InstalledSkill[]> => {
      const { data } = await http.get<{ data: { list: InstalledSkill[] } }>(
        '/user/skill-installs'
      );
      return data.data.list ?? [];
    },
  });
}

// ── 创建 / 编辑 / 发布 / 删除(作者)──────────────────────────────────────────

export interface CreateSkillInput {
  name: string;
  tagline?: string;
  category?: string;
  contentSource?: 'original' | 'reposted';
  /** 三选一:纯文本 SKILL.md / 单个 zip / 文件夹多文件(File[] with webkitRelativePath) */
  content?: string;
  zip?: File;
  files?: File[];
}

function buildSkillForm(input: {
  name?: string;
  tagline?: string;
  category?: string;
  contentSource?: string;
  content?: string;
  zip?: File;
  files?: File[];
  changelog?: string;
}): FormData {
  const fd = new FormData();
  if (input.name != null) fd.append('name', input.name);
  if (input.tagline != null) fd.append('tagline', input.tagline);
  if (input.category != null) fd.append('category', input.category);
  if (input.contentSource != null) fd.append('contentSource', input.contentSource);
  if (input.changelog != null) fd.append('changelog', input.changelog);
  if (input.zip) {
    fd.append('zip', input.zip);
  } else if (input.files && input.files.length > 0) {
    // 文件夹上传:第三参传 webkitRelativePath,让后端拿到相对路径重建目录树。
    for (const f of input.files) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
      fd.append('files', f, rel && rel.length > 0 ? rel : f.name);
    }
  } else if (input.content != null) {
    fd.append('content', input.content);
  }
  return fd;
}

/** 公开下载 URL(同源直链,浏览器可直接导航;供「下载」按钮 + 匿名使用)。 */
export function downloadSkillUrl(slug: string): string {
  return `/api/v1/skills/${encodeURIComponent(slug)}/download`;
}

/** 匿名/分享落地页:公开详情(只返回 public+approved)。 */
export function usePublicSkill(slug: string | undefined) {
  return useQuery({
    queryKey: ['skills', 'public', slug],
    enabled: !!slug,
    queryFn: async (): Promise<SkillDetail> => {
      const { data } = await http.get<{ data: SkillDetail }>(
        `/skills/${slug}`
      );
      return data.data;
    },
  });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: CreateSkillInput
    ): Promise<{ id: number; slug: string }> => {
      try {
        const { data } = await http.post<{ data: { id: number; slug: string } }>(
          '/user/skills',
          buildSkillForm(input)
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills', 'mine'] });
      qc.invalidateQueries({ queryKey: ['skills', 'installed'] });
    },
  });
}

export function useUpdateSkillContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: number;
      content?: string;
      zip?: File;
      files?: File[];
      changelog?: string;
    }) => {
      try {
        await http.put(`/user/skills/${args.id}/content`, buildSkillForm(args));
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills', 'mine'] });
      qc.invalidateQueries({ queryKey: ['skills', 'detail'] });
    },
  });
}

export function useUpdateSkillMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: number;
      name?: string;
      tagline?: string;
      category?: string;
    }) => {
      try {
        await http.patch(`/user/skills/${args.id}`, args);
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['skills', 'mine'] }),
  });
}

export function usePublishSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: number; visibility: 'unlisted' | 'public' }) => {
      try {
        await http.post(`/user/skills/${args.id}/publish`, {
          visibility: args.visibility,
        });
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['skills', 'mine'] }),
  });
}

export function useUnpublishSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      try {
        await http.post(`/user/skills/${id}/unpublish`);
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['skills', 'mine'] }),
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      try {
        await http.delete(`/user/skills/${id}`);
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills', 'mine'] });
      qc.invalidateQueries({ queryKey: ['skills', 'installed'] });
    },
  });
}

// ── 安装 / 启用(claw 面板)────────────────────────────────────────────────────

export function useInstallSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (skillId: number) => {
      try {
        await http.post('/user/skill-installs', { skillId });
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills', 'installed'] });
      qc.invalidateQueries({ queryKey: ['skills', 'market'] });
      qc.invalidateQueries({ queryKey: ['skills', 'detail'] }); // 详情页按钮态跟随(审计 #6)
    },
  });
}

export function useSetSkillEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { skillId: number; enabled: boolean }) => {
      try {
        await http.patch(`/user/skill-installs/${args.skillId}`, {
          enabled: args.enabled,
        });
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['skills', 'installed'] }),
  });
}

export function useUninstallSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (skillId: number) => {
      try {
        await http.delete(`/user/skill-installs/${skillId}`);
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills', 'installed'] });
      qc.invalidateQueries({ queryKey: ['skills', 'market'] });
      qc.invalidateQueries({ queryKey: ['skills', 'detail'] }); // 详情页按钮态跟随(审计 #6)
    },
  });
}

export function useReportSkill() {
  return useMutation({
    mutationFn: async (args: {
      id: number;
      reason: ReportReason;
      detail?: string;
    }) => {
      try {
        await http.post(`/user/skills/report/${args.id}`, {
          reason: args.reason,
          detail: args.detail,
        });
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}
