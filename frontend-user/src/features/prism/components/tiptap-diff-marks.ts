// DiffMarks:在编辑器里**原地**渲染「本次 AI 改动」痕迹的 ProseMirror 插件(Tiptap 扩展)。
//
// 关键设计(对齐 prosemirror-changeset / Tiptap 官方 decorations 用法):装饰在插件的 `decorations(state)`
// prop 里**按当前 doc 现算**,插件 state 只存一个 baseline(改动前的正文块 DocBlock[])。这样无论 baseline
// 何时设置、新内容何时 setContent 进来,ProseMirror 每次视图更新都用**当前 doc** 重算装饰 —— 彻底消除
// 旧版「effect 预算好装饰再 dispatch」引入的一整类问题(装饰算在旧 doc 上 / 声明顺序时序竞争 / remount 丢装饰)。
//
// baseline 通过事务 meta 设置:传 DocBlock[] → 开启痕迹;传 null → 关闭(用户一开始编辑即关)。
// 装饰是纯视觉覆盖,绝不进文档、不被保存;编辑器正文永远等于结构体真源。
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { buildDiffDecorations } from '../lib/struct-diff-decorations';
import type { DocBlock } from '../api/prism';

// 插件 state = baseline(改动前正文块);null = 无痕迹。
export const diffMarksKey = new PluginKey<DocBlock[] | null>('prismDiffMarks');

export const DiffMarks = Extension.create({
  name: 'prismDiffMarks',
  addProseMirrorPlugins() {
    // memo:装饰只在 (doc, baseline) 真变时重算 —— 选区/点击等纯 selection 事务直接复用上次结果,
    // 避免 review 期间频繁重跑 diff 造成卡顿。doc 不可变,引用相等即内容相等。
    let cache: { doc: ProseNode; baseline: DocBlock[]; set: DecorationSet | null } | null = null;
    return [
      new Plugin<DocBlock[] | null>({
        key: diffMarksKey,
        state: {
          init: () => null,
          apply(tr, value) {
            const meta = tr.getMeta(diffMarksKey);
            // meta===undefined:非本插件的事务 → 保留 baseline 不变;否则用 meta 覆盖(DocBlock[] 或 null)。
            return meta === undefined ? value : (meta as DocBlock[] | null);
          },
        },
        props: {
          decorations(state) {
            const baseline = diffMarksKey.getState(state);
            if (baseline == null) {
              cache = null;
              return null;
            }
            if (cache && cache.doc === state.doc && cache.baseline === baseline) return cache.set;
            let set: DecorationSet | null = null;
            try {
              const decos = buildDiffDecorations(state.doc, baseline);
              set = decos.length ? DecorationSet.create(state.doc, decos) : null;
            } catch {
              set = null; // 装饰计算异常绝不能拖垮编辑器
            }
            cache = { doc: state.doc, baseline, set };
            return set;
          },
        },
      }),
    ];
  },
});
