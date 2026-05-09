/**
 * TemplateVariablePanel — 模板变量字典 + 实时预览
 *
 * 通用面板,用于消息模板 / Prompt 模板的"渲染后效果"预览。
 *
 * 用户操作流:
 *   1. 看到变量字典(平台支持哪些占位符)
 *   2. 修改示例值
 *   3. 实时看到模板渲染后的样子(${var} 被替换)
 */

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Eye } from 'lucide-react';

export interface VarDef {
  key: string;
  label: string;
  sample: string;
}

export const MESSAGE_VARS: VarDef[] = [
  { key: 'user_name', label: '用户名', sample: '张三' },
  { key: 'user_email', label: '用户邮箱', sample: 'zhang@example.com' },
  { key: 'nickname', label: '昵称', sample: '小张' },
  { key: 'plan_name', label: '订阅名称', sample: 'Pro' },
  { key: 'order_no', label: '订单号', sample: 'ORD202604010001' },
  { key: 'amount', label: '金额', sample: '99.00' },
  { key: 'verify_code', label: '验证码', sample: '123456' },
  { key: 'date', label: '日期', sample: '2026-04-01' },
  { key: 'platform_name', label: '平台名', sample: 'Scholay' },
];

export const PROMPT_VARS: VarDef[] = [
  { key: 'paper_text', label: '论文全文', sample: 'This is the abstract of the paper...' },
  { key: 'paper_title', label: '论文标题', sample: 'Attention Is All You Need' },
  { key: 'paper_abstract', label: '论文摘要', sample: 'We propose a new architecture...' },
  { key: 'user_query', label: '用户查询', sample: '这篇论文的主要贡献是什么?' },
  { key: 'language', label: '回复语言', sample: '中文' },
  { key: 'context', label: '上下文', sample: '...' },
];

/** 用提供的变量值替换 ${var}; 缺失变量保留原 ${var} 表示"未替换" */
export function renderTemplate(template: string, values: Record<string, string>): string {
  if (!template) return '';
  return template.replace(/\$\{(\w+)\}/g, (_, name) => {
    return values[name] !== undefined ? values[name] : `\${${name}}`;
  });
}

/** 提取模板中实际用到的变量名(去重) */
export function extractVars(template: string): string[] {
  if (!template) return [];
  const set = new Set<string>();
  template.replace(/\$\{(\w+)\}/g, (_, name) => {
    set.add(name);
    return _;
  });
  return Array.from(set);
}

interface Props {
  /** 显示给字典的全部变量 */
  vars: VarDef[];
  /** 模板字段:{ label, value } 数组,会逐个渲染预览 */
  templates: { label: string; value: string }[];
}

export function TemplateVariablePanel({ vars, templates }: Props) {
  // 默认值:每个 var 用 sample
  const [values, setValues] = useState<Record<string, string>>(() =>
    vars.reduce<Record<string, string>>((acc, v) => {
      acc[v.key] = v.sample;
      return acc;
    }, {}),
  );

  // 找出模板里实际用到的变量(显示在字典上方,标"已使用")
  const usedSet = useMemo(() => {
    const u = new Set<string>();
    templates.forEach((t) => extractVars(t.value).forEach((k) => u.add(k)));
    return u;
  }, [templates]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Eye className="h-4 w-4 text-blue-500" />
            渲染预览
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {templates.map((t, i) => (
            <div key={i}>
              <Label className="text-xs text-muted-foreground">{t.label}</Label>
              <div className="mt-1 whitespace-pre-wrap rounded-md border bg-muted/30 px-3 py-2 text-sm">
                {renderTemplate(t.value, values) || (
                  <span className="text-muted-foreground">(未填写)</span>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">变量字典 / 示例值</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {vars.map((v) => {
            const used = usedSet.has(v.key);
            return (
              <div key={v.key} className="grid grid-cols-[180px_1fr] items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{`\${${v.key}}`}</code>
                  {used && <Badge variant="success">已使用</Badge>}
                </div>
                <Input
                  className="h-8 text-sm"
                  value={values[v.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [v.key]: e.target.value })}
                  placeholder={v.label}
                />
              </div>
            );
          })}
          <p className="pt-1 text-xs text-muted-foreground">
            修改示例值后,左侧渲染预览会实时更新。仅前端展示,不会保存。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
