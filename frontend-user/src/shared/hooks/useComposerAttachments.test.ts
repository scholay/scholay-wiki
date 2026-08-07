import { describe, expect, it } from 'vitest';
import { classifyFile } from './useComposerAttachments';

/**
 * 🔴 统计软件的专有数据格式必须给出**可执行的出路**。
 *
 * 实测事故(2026-08-06,AG-09):用户往「数据分析」卡片拖进 .sav,
 * 它落进通用拒收分支,文案是「可上传图片、PDF、Office 文档 (docx/xlsx/pptx)」——
 * 对这张卡片是误导(用户要传的就是数据),而且**不给 SPSS 用户任何出路**。
 * 随后模型宣称「.sav 我这边可以直接读取,不需要转成 Excel」,把用户推进无限重传的死循环。
 *
 * 这类用户恰恰是这张卡片最想接的人 —— 他们手里就是 SPSS 数据。
 * 拒绝时给不给路,决定了他是去转个格式还是直接走人。
 */
describe('附件分类 · 统计软件专有格式', () => {
  const cases = ['data.sav', 'data.zsav', 'data.por', 'data.dta', 'x.sas7bdat', 'x.xpt'];

  it.each(cases)('%s 被拒,且文案给出转换路径', (name) => {
    const r = classifyFile({ name, type: '', size: 1024 } as File);
    expect(r.kind).toBe('unsupported');
    const reason = 'reason' in r ? r.reason : '';
    expect(reason).toContain('另存为');
    expect(reason).toMatch(/CSV|Excel/);
    // 不许再落到那句对数据分析卡毫无意义的通用文案
    expect(reason).not.toContain('可上传图片、PDF');
  });

  it('SPSS 用户拿到的是具体到菜单路径的指引,不是泛泛的「转个格式」', () => {
    const r = classifyFile({ name: '导师的数据.sav', type: '', size: 2048 } as File);
    const reason = 'reason' in r ? r.reason : '';
    expect(reason).toContain('SPSS');
    expect(reason).toContain('文件-另存为');
    // 中文 Windows 导出默认 GBK —— 引擎能读,但要让用户心里有数
    expect(reason).toContain('GBK');
  });

  it('csv / xlsx 照常放行,不许被这一支误伤', () => {
    for (const name of ['data.csv', 'data.xlsx', '实验数据.CSV']) {
      expect(classifyFile({ name, type: '', size: 1024 } as File).kind).not.toBe('unsupported');
    }
  });
});
