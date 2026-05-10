// ============================================================
// 天音 AI 创作助手 — LCS 行级 Diff 引擎
// ============================================================

/**
 * Diff 操作类型
 */
const DiffOp = {
  EQUAL: 'equal',
  DELETE: 'delete',
  INSERT: 'insert',
};

/**
 * Diff 块（连续相同操作的行组）
 */
class DiffChunk {
  /**
   * @param {string} op - DiffOp
   * @param {number[]} oldLines - 原文行索引数组
   * @param {number[]} newLines - 新文行索引数组
   * @param {string[]} oldText - 原文行内容
   * @param {string[]} newText - 新文行内容
   */
  constructor(op, oldLines, newLines, oldText, newText) {
    this.op = op;
    this.oldLines = oldLines;
    this.newLines = newLines;
    this.oldText = oldText;
    this.newText = newText;
    this.id = generateId();
    this.accepted = false;
    this.rejected = false;
  }

  /** 是否为变更块（删除或新增） */
  get isChanged() {
    return this.op !== DiffOp.EQUAL;
  }

  /** 获取变更类型标签 */
  get label() {
    switch (this.op) {
      case DiffOp.DELETE: return '删除';
      case DiffOp.INSERT: return '新增';
      default: return '';
    }
  }
}

/**
 * Diff 结果
 */
class DiffResult {
  constructor(chunks, oldLines, newLines) {
    this.chunks = chunks;
    this.oldLines = oldLines;
    this.newLines = newLines;
  }

  /** 是否有变更 */
  get hasChanges() {
    return this.chunks.some(c => c.isChanged);
  }

  /** 变更块数量 */
  get changeCount() {
    return this.chunks.filter(c => c.isChanged).length;
  }

  /** 获取已接受的最终文本 */
  getAcceptedText() {
    const result = [];
    for (const chunk of this.chunks) {
      if (chunk.op === DiffOp.EQUAL) {
        result.push(...chunk.oldText);
      } else if (chunk.op === DiffOp.INSERT) {
        if (chunk.accepted) {
          result.push(...chunk.newText);
        } else {
          result.push(...chunk.oldText);
        }
      } else if (chunk.op === DiffOp.DELETE) {
        if (!chunk.accepted) {
          result.push(...chunk.oldText);
        }
        // 如果 accepted，则删除（不添加）
      }
    }
    return result.join('\n');
  }
}

/**
 * 计算 LCS（最长公共子序列）表
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number[][]}
 */
function computeLcsTable(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

/**
 * 从 LCS 表回溯生成 Diff 操作序列
 * @param {string[]} a - 原文行数组
 * @param {string[]} b - 新文行数组
 * @param {number[][]} dp - LCS 表
 * @param {number} i
 * @param {number} j
 * @param {Array<{op: string, oldLine: number|null, newLine: number|null, text: string}>} ops
 */
function backtrack(a, b, dp, i, j, ops) {
  if (i === 0 && j === 0) return;

  if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
    backtrack(a, b, dp, i - 1, j - 1, ops);
    ops.push({ op: DiffOp.EQUAL, oldLine: i - 1, newLine: j - 1, text: a[i - 1] });
  } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
    backtrack(a, b, dp, i, j - 1, ops);
    ops.push({ op: DiffOp.INSERT, oldLine: null, newLine: j - 1, text: b[j - 1] });
  } else if (i > 0) {
    backtrack(a, b, dp, i - 1, j, ops);
    ops.push({ op: DiffOp.DELETE, oldLine: i - 1, newLine: null, text: a[i - 1] });
  }
}

/**
 * 将操作序列合并为 Chunk 块
 * @param {Array} ops
 * @param {string[]} a
 * @param {string[]} b
 * @returns {DiffChunk[]}
 */
function mergeOpsToChunks(ops, a, b) {
  if (ops.length === 0) {
    return [new DiffChunk(DiffOp.EQUAL, [], [], [], [])];
  }

  const chunks = [];
  let currentOp = ops[0].op;
  let oldLines = [];
  let newLines = [];
  let oldText = [];
  let newText = [];

  function flush() {
    if (oldLines.length > 0 || newLines.length > 0) {
      chunks.push(new DiffChunk(currentOp, oldLines, newLines, oldText, newText));
    }
    oldLines = [];
    newLines = [];
    oldText = [];
    newText = [];
  }

  for (const op of ops) {
    if (op.op !== currentOp) {
      flush();
      currentOp = op.op;
    }
    if (op.oldLine !== null) {
      oldLines.push(op.oldLine);
      oldText.push(a[op.oldLine]);
    }
    if (op.newLine !== null) {
      newLines.push(op.newLine);
      newText.push(b[op.newLine]);
    }
  }
  flush();

  return chunks;
}

/**
 * 计算两个文本的行级 Diff
 * @param {string} oldText - 原文
 * @param {string} newText - 新文
 * @returns {DiffResult}
 */
function computeDiff(oldText, newText) {
  const a = splitLines(oldText);
  const b = splitLines(newText);

  const dp = computeLcsTable(a, b);
  const ops = [];
  backtrack(a, b, dp, a.length, b.length, ops);
  const chunks = mergeOpsToChunks(ops, a, b);

  return new DiffResult(chunks, a, b);
}
