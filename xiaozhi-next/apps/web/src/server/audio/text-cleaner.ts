/**
 * ============================================================
 * TTS 文本清洗工具 — Markdown清理 + 表情过滤 + 纠错词替换
 * 对标旧Python: core/utils/tts.py → MarkdownCleaner + check_emoji
 *
 * 职责：
 * 1. 移除Markdown格式（代码块/标题/粗斜体/链接/图片/引用/表格/公式）
 * 2. 表格→可读文本转换
 * 3. 内联公式→纯文本提取
 * 4. Emoji表情过滤
 * 5. 纠错词正则替换
 * ============================================================
 */

// ==============================
// 标点集（对标Python punctuation_set）
// ==============================

/** TTS分句标点（首句用，含逗号，保证快速首响） */
export const FIRST_SENTENCE_PUNCTUATIONS = new Set([
  '，', ',', '。', '.',
  '！', '!', '？', '?',
  '；', ';', '：', ':',
  '~', '～',
  '…', '...',
]);

/** TTS分句标点（后续句用，不含逗号，确保语义完整） */
export const PUNCTUATIONS = new Set([
  '。', '.',
  '！', '!', '？', '?',
  '；', ';', '：', ':',
  '\n',
]);

/** 中文逗号+英文逗号 */
export const COMMA_SET = new Set(['，', ',']);
/** 所有可触发TTS的标点（用于流式检测） */
export const TTS_TRIGGER_PUNCTUATIONS = new Set([
  '。', '.', '！', '!', '？', '?',
  '；', ';', '：', ':',
  '，', ',', '\n',
  '~', '～', '…',
]);

// ==============================
// Markdown 清洗器
// ==============================

/**
 * MarkdownCleaner — 清洗Markdown格式化为纯文本
 *
 * 对标旧Python: MarkdownCleaner 类
 *
 * 处理顺序（按正则执行频率排列）：
 *   代码块 → 标题 → 粗体 → 斜体 → 图片 → 链接 → 引用 → 表格 → 列表 → 公式 → 多余空行
 */
export class MarkdownCleaner {
  /** 公式字符检测 */
  private static readonly FORMULA_CHARS = /[a-zA-Z\\^_{}+\-()[\]=\d]/;

  /**
   * 主入口：清洗Markdown文本为TTS友好格式
   *
   * @param text 原始文本
   * @returns 清洗后的纯文本
   */
  static clean(text: string): string {
    if (!text) return '';

    let result = text;

    // 1. 代码块 ```...```
    result = result.replace(/```[\s\S]*?```/g, '');

    // 2. 行内代码 `code`
    result = result.replace(/`([^`]+)`/g, '$1');

    // 3. 标题 # ## ###
    result = result.replace(/^#{1,6}\s+/gm, '');

    // 4. 粗体 **text** 或 __text__
    result = result.replace(/(\*\*|__)(.*?)\1/g, '$2');

    // 5. 斜体 *text* 或 _text_
    result = result.replace(/(\*|_)(?=\S)(.*?)(?<=\S)\1/g, '$2');

    // 6. 图片 ![alt](url)
    result = result.replace(/!\[.*?\]\(.*?\)/g, '');

    // 7. 链接 [text](url)
    result = result.replace(/\[(.*?)\]\(.*?\)/g, '$1');

    // 7b. 裸URL
    result = result.replace(/https?:\/\/[^\s]+/g, '');

    // 8. 引用 > text
    result = result.replace(/^\s*>\s*/gm, '');

    // 9. Markdown表格 → 可读文本
    result = MarkdownCleaner._cleanTable(result);

    // 10. 块级公式 $$...$$
    result = result.replace(/\$\$[\s\S]*?\$\$/g, '');

    // 11. 内联公式 $...$
    result = result.replace(/(?<!\$)\$([^$\n]+)\$(?!\$)/g, (_, content) => {
      if (MarkdownCleaner.FORMULA_CHARS.test(content)) {
        return content; // 公式内容，保留纯文本
      }
      return `$${content}$`; // 非公式（如货币），保留
    });

    // 12. 无序列表标记 * - +
    result = result.replace(/^\s*[*\-+]\s+/gm, '');

    // 13. 有序列表 1. 2.
    result = result.replace(/^\s*\d+\.\s+/gm, '');

    // 14. 水平线 --- ***
    result = result.replace(/^[-*_]{3,}\s*$/gm, '');

    // 15. 多余空行 → 单换行
    result = result.replace(/\n{3,}/g, '\n\n');

    // 16. 去Emoji表情
    result = MarkdownCleaner._removeEmoji(result);

    // 17. 收尾去空白
    result = result.trim();

    return result;
  }

  /**
   * 清洗Markdown表格为可读文本
   *
   * 对标旧Python: _replace_table_block
   *
   * 输入:
   *   | 姓名 | 年龄 |
   *   |------|------|
   *   | 张三 | 25   |
   *
   * 输出:
   *   表头是：姓名, 年龄
   *   第1行：姓名 = 张三, 年龄 = 25
   */
  private static _cleanTable(text: string): string {
    // 检测连续几行都是管道分隔符的表格
    const tableRegex = /(?:^[^\n]*\|[^\n]*\n)+/gm;

    return text.replace(tableRegex, (block) => {
      const lines = block.trim().split('\n');
      const parsedRows: string[][] = [];

      for (const line of lines) {
        // 跳过分隔行 (| --- | --- |)
        if (/^\|?\s*[-:]+\s*(\|\s*[-:]+\s*)+\|?\s*$/.test(line)) continue;

        const cols = line
          .split('|')
          .map((c) => c.trim())
          .filter((c) => c !== '');
        if (cols.length > 0) {
          parsedRows.push(cols);
        }
      }

      if (parsedRows.length === 0) return '';

      if (parsedRows.length === 1) {
        return `单行表格：${parsedRows[0]!.join(', ')}\n`;
      }

      const headers = parsedRows[0]!;
      const dataRows = parsedRows.slice(1);
      const resultLines: string[] = [];

      resultLines.push(`表头是：${headers.join(', ')}`);
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i]!;
        const rowStr = headers
          .map((h, j) => `${h} = ${row[j] || '无'}`)
          .join(', ');
        resultLines.push(`第 ${i + 1} 行：${rowStr}`);
      }

      return resultLines.join('\n') + '\n';
    });
  }

  /**
   * 移除 Emoji 表情
   * 对标旧Python: check_emoji()
   */
  private static _removeEmoji(text: string): string {
    // 匹配大部分Emoji字符（含肤色修饰符、国旗等）
    return text.replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu,
      '',
    );
  }

  /**
   * 判断文本是否全为英文+基本标点
   * 用于决定是否保留原始空格
   */
  static isAllAsciiOrPunctuation(text: string): boolean {
    const punctuationSet = new Set([
      ',', '.', '!', '?', '"', "'", ':', '-', '[', ']',
      '，', '。', '！', '？', '"', '"', '：', '、', '【', '】', '~',
      '(', ')', '（', '）',
    ]);
    for (const c of text) {
      if (c.charCodeAt(0) > 127 && !punctuationSet.has(c) && c !== ' ') {
        return false;
      }
    }
    return true;
  }
}

// ==============================
// 纠错词替换
// ==============================

/**
 * 应用纠错词（正则替换）
 *
 * 对标旧Python: correct_words 配置项
 *
 * @param text 原始TTS文本
 * @param correctWords 纠错词映射 { 原文: 替换 }
 * @returns 替换后的文本
 */
export function applyCorrectWords(
  text: string,
  correctWords: Record<string, string> | undefined,
): string {
  if (!correctWords || Object.keys(correctWords).length === 0) return text;

  let result = text;
  for (const [pattern, replacement] of Object.entries(correctWords)) {
    try {
      const regex = new RegExp(pattern, 'g');
      result = result.replace(regex, replacement);
    } catch {
      // 非正则字符串，直接替换
      result = result.split(pattern).join(replacement);
    }
  }
  return result;
}

// ==============================
// 文本分句器
// ==============================

/**
 * TTS文本分句器
 *
 * 对标旧Python: TTSProviderBase._get_segment_text()
 *
 * 策略：
 * - 首句：允许逗号分割，确保快速响应用户
 * - 后续句：只使用句末标点分割，确保语义完整
 * - 末尾文本：即使无标点也全部输出
 */
export class TextSegmenter {
  private processedChars = 0;
  private isFirstSentence = true;
  private buffer: string[] = [];

  /** 重置状态（新句子开始） */
  reset(): void {
    this.processedChars = 0;
    this.isFirstSentence = true;
    this.buffer = [];
  }

  /** 追加文本 */
  append(text: string): void {
    this.buffer.push(text);
  }

  /** 尝试提取一个完整句子 */
  tryExtractSentence(force: boolean = false): string | null {
    const fullText = this.buffer.join('');
    const remaining = fullText.slice(this.processedChars);

    if (!remaining) return null;

    // 如果强制输出，返回所有剩余文本
    if (force) {
      const result = remaining;
      this.processedChars = fullText.length;
      this.isFirstSentence = false;
      return result;
    }

    // 查找最近标点
    const punctSet = this.isFirstSentence
      ? FIRST_SENTENCE_PUNCTUATIONS
      : PUNCTUATIONS;

    let bestIdx = -1;
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (punctSet.has(remaining[i]!)) {
        bestIdx = i;
        break;
      }
    }

    if (bestIdx >= 0) {
      const sentence = remaining.slice(0, bestIdx + 1);
      this.processedChars += bestIdx + 1;
      this.isFirstSentence = false;

      // 如果句子为空（仅标点），跳过
      const trimmed = sentence.replace(/[，,。\.！!？?；;：:~\n]/g, '').trim();
      if (!trimmed) return null;

      return sentence;
    }

    return null;
  }
}

// ==============================
// 情绪表情提取
// ==============================

/**
 * 从LLM流式文本中提取情绪表情（首个非空token）
 *
 * 对标旧Python: textUtils.get_emotion()
 *
 * 策略：检测文本开头的emoji，分离出表情和实际文本
 *
 * @param text LLM输出的首个文本token
 * @returns { emotion: 表情字符, text: 不含表情的文本 }
 */
export function extractEmotion(text: string): { emotion: string; text: string } {
  // Emoji检测正则
  const emojiRegex =
    /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+/u;

  const match = text.match(emojiRegex);
  if (match && match[0]) {
    return {
      emotion: match[0],
      text: text.slice(match[0].length),
    };
  }

  return { emotion: '', text };
}
