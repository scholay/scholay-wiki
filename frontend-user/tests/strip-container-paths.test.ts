import { describe, expect, it } from 'vitest';
import { stripContainerPaths } from '@/shared/lib/strip-container-paths';

// 出口清洗的行为矩阵(2026-08-07 · A11)。
//
// 生产实测:221 个「正文出现 out/」的轮里只有 4 轮是带 `./` 的形态 ——
// 旧规则的命中率约 1.8%,是一条几乎永远绿的规则。本族钉两件事:
//   ① deliver 档真的能清掉裸 `out/x.ext`(占泄漏形态的 98.2%);
//   ② verbatim 档(prism / Bash chip / 工具语义)行为逐字不变 —— 那两处误伤的代价更高。

describe('stripContainerPaths · verbatim(默认,= 改造前行为)', () => {
  it('清带 ./ 的交付路径与容器绝对根', () => {
    expect(stripContainerPaths('已保存到 ./out/综述.md')).toBe('已保存到 综述.md');
    expect(stripContainerPaths('见 /home/bun/sessions/abc/out/a.csv')).toBe('见 a.csv');
  });

  it('🔴 不碰裸 out/ —— prism 的文件树路径是合法用户概念,Bash chip 改了会显示没跑过的命令', () => {
    expect(stripContainerPaths('out/报告.docx')).toBe('out/报告.docx');
    expect(stripContainerPaths('python3 out/plot.py')).toBe('python3 out/plot.py');
  });
});

describe('stripContainerPaths · deliver(仅 claw 助手正文)', () => {
  const s = (t: string) => stripContainerPaths(t, 'deliver');

  it('🔴 清掉裸 out/x.ext(实测 98.2% 的泄漏形态)', () => {
    expect(s('已生成 out/综述.md,可下载')).toBe('已生成 综述.md,可下载');
    expect(s('文件已保存到 out/三线表.docx。')).toBe('文件已保存到 三线表.docx。');
    expect(s('见 `out/analysis.py`')).toBe('见 analysis.py');
  });

  it('覆盖各类交付扩展名', () => {
    for (const ext of ['md', 'csv', 'docx', 'xlsx', 'pptx', 'pdf', 'svg', 'png', 'html', 'zip', 'py']) {
      expect(s(`产物 out/x.${ext} 好了`)).toBe(`产物 x.${ext} 好了`);
    }
  });

  it('🔴 不误伤 checkout/ layout/ 这类以 out 结尾的词(左侧锚定)', () => {
    expect(s('运行 git checkout/main.md 分支')).toBe('运行 git checkout/main.md 分支');
    expect(s('看 layout/page.html 的实现')).toBe('看 layout/page.html 的实现');
    expect(s('路径 src/out/x.md')).toBe('路径 src/out/x.md');
  });

  it('🔴 不误伤没有交付扩展名的内容(右侧锚定)', () => {
    expect(s('about/us 页面')).toBe('about/us 页面');
    expect(s('out/subdir/ 这种')).toBe('out/subdir/ 这种');
  });

  it('中文目录词组换成用户语汇(清洗不出文件名,只能整体替换)', () => {
    expect(s('文件在工作目录下')).toBe('文件在下方卡片');
    expect(s('已放到 out 目录中')).toBe('已放到 下方卡片');
    expect(s('见根目录里的那份')).toBe('见下方卡片的那份');
  });

  it('普通正文零改动(快路径)', () => {
    const plain = '已为你生成《锂电池固态电解质综述》,可在下方查看或下载。';
    expect(s(plain)).toBe(plain);
  });
});
