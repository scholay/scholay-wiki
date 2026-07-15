// input_json_delta 按 content_block index 累积(探针 #4 已证 DeepSeek 流式 tool_use 可组装)。
// 仅用于流式期间 emit tool_use_complete 帧;最终执行用 stream.finalMessage() 的已解析 input。

export interface AssembledTool {
  id: string;
  name: string;
  input: unknown;
}

export class ToolUseAssembler {
  private blocks = new Map<number, { id: string; name: string; json: string }>();

  open(index: number, block: { id: string; name: string }): void {
    this.blocks.set(index, { id: block.id, name: block.name, json: "" });
  }

  push(index: number, partialJson: string): void {
    const b = this.blocks.get(index);
    if (b) b.json += partialJson;
  }

  isTool(index: number): boolean {
    return this.blocks.has(index);
  }

  /** peek:不关闭地读当前累积状态(工具名 + 已累积的 partial JSON),供流式明文预览抽取。 */
  peek(index: number): { name: string; json: string } | null {
    const b = this.blocks.get(index);
    return b ? { name: b.name, json: b.json } : null;
  }

  close(index: number): AssembledTool | null {
    const b = this.blocks.get(index);
    if (!b) return null;
    this.blocks.delete(index);
    let input: unknown = {};
    if (b.json) {
      try {
        input = JSON.parse(b.json);
      } catch {
        input = {};
      }
    }
    return { id: b.id, name: b.name, input };
  }
}
