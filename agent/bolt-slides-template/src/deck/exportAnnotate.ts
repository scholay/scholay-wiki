/* 导出注解 —— 白名单组件在根元素 spread 这个,给「可编辑 pptx 导出」采集器留下语义标记。
   role = 组件类型;model = 结构化数据(props 的纯子集,免像素反推)。
   平时(非导出)只是几个 data-* 属性,零副作用;导出时被 exportModel.ts 采集。

   用法(组件根元素):<div className="slide" {...exportAttrs('cover', { kicker, title, subtitle })}>

   role 约定:
     - 语义原生:'cover' 'section' 'bignumber' 'quote' 'statgrid' 'steps' 'contrast'
       'table' 'comparison' 'chart' 'agenda' 'timeline' 'references' 'team' 'pricing' 'chat'
     - 'image' = 命令式/自绘,导出走截图(Globe / VisualDashboard / Math / CodeWindow)
     - 'container' = 透传容器,采集器继续下钻其子节点(Figure / Split / SpotlightCard) */
export function exportAttrs(role: string, model?: unknown): Record<string, string> {
  const attrs: Record<string, string> = { 'data-export-role': role };
  if (model !== undefined) {
    try {
      // 转义 < 防 JSON 里出现 </script> 破坏 blob;采集器/Node 都按普通 JSON 解析。
      attrs['data-export-model'] = JSON.stringify(model).replace(/</g, '\\u003c');
    } catch {
      /* 不可序列化就只留 role,采集器回退文本提取 */
    }
  }
  return attrs;
}
