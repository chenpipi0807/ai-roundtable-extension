// ============================================================
// 天音 AI 创作助手 — Prompt 模板
// ============================================================

/**
 * 构建系统 Prompt
 * @param {Object} context - 页面上下文
 * @returns {string}
 */
const FIELD_LABEL_MAP = {
  songIdea: '风格描述',
  lyrics: '歌词',
  songName: '歌曲名称',
};

function buildSystemPrompt(context) {
  const styles = context.styles && context.styles.length > 0
    ? context.styles.join('、')
    : '未指定';

  const hasIdea = context.songIdea && context.songIdea.trim();
  const hasLyrics = context.lyrics && context.lyrics.trim();
  const hasName = context.songName && context.songName.trim();

  let contextSummary = '';
  if (hasIdea || hasLyrics || hasName) {
    contextSummary = '\n当前已有内容状态:\n';
    if (hasIdea) contextSummary += '- 风格描述: 已有内容\n';
    else contextSummary += '- 风格描述: 空（需要生成）\n';
    if (hasLyrics) contextSummary += '- 歌词: 已有内容\n';
    else contextSummary += '- 歌词: 空（需要生成）\n';
    if (hasName) contextSummary += '- 歌曲名称: 已有内容\n';
    else contextSummary += '- 歌曲名称: 空（需要生成）\n';
  }

  // 锁定字段约束
  const locked = (context.lockedFields || []).filter((f) => FIELD_LABEL_MAP[f]);
  const lockConstraint = locked.length > 0
    ? `\n⚠️ 以下字段已被用户锁定，【严禁修改，必须原样输出其现有内容】：${locked.map((f) => FIELD_LABEL_MAP[f]).join('、')}\n`
    : '';

  return `你是一位资深音乐创作助手，专注于协助用户创作中文歌词、歌曲概念和歌曲名称。
请根据用户的创作意图，生成高质量、有韵律感、情感真挚的内容。

当前歌曲风格: ${styles}
${contextSummary}${lockConstraint}
输出要求:
- 直接给出完整内容，不要添加额外解释
- 严格按照用户问题中指定的格式输出
- 保持与原文相同的行数结构（如果是对已有内容的修改）
- 如果是完整歌曲创作（同时生成风格描述、歌词、歌曲名称），请使用以下严格格式输出，每部分用明确的标记分隔，标记单独占一行：

=== 风格描述 ===
[对歌曲风格的详细描述，50-200字]

=== 歌词 ===
[完整的歌词正文，按段落分行]

=== 歌曲名称 ===
[建议的歌曲名称]

重要：请根据"已有内容状态"判断哪些部分需要生成。如果某部分已有内容，可以在其基础上优化或保持一致性；如果某部分为空，则需要全新创作。`;
}

/**
 * 构建用户 Prompt — 根据 inputType 和 actionType 分发
 * @param {string} inputType - INPUT_TYPE 枚举值
 * @param {string} actionType - ACTION_TYPE 枚举值
 * @param {Object} context - 页面上下文
 * @param {string} userInput - 用户的额外要求
 * @returns {string}
 */
function buildUserPrompt(inputType, actionType, context, userInput = '') {
  const { songIdea, lyrics, songName, styles } = context;
  const styleStr = styles.length > 0 ? styles.join('、') : '未指定';
  const extra = userInput ? `\n用户额外要求: ${userInput}` : '';

  // 完整创作：同时生成风格描述 + 歌词 + 歌曲名称
  if (actionType === ACTION_TYPE.COMPLETE_CREATE) {
    return buildCompleteCreatePrompt(context, userInput);
  }

  switch (inputType) {
    case INPUT_TYPE.SONG_IDEA:
      return buildIdeaPrompt(context, userInput);

    case INPUT_TYPE.SONG_NAME:
      return buildSongNamePrompt(context, userInput);

    case INPUT_TYPE.LYRICS:
    default:
      return buildLyricsPrompt(actionType, context, userInput);
  }
}

/**
 * 构建完整创作 Prompt — 同时生成风格描述、歌词、歌曲名称
 * @param {Object} context
 * @param {string} userInput
 * @returns {string}
 */
function buildCompleteCreatePrompt(context, userInput = '') {
  const { songIdea, lyrics, songName, styles } = context;
  const styleStr = styles.length > 0 ? styles.join('、') : '未指定';
  const extra = userInput ? `\n用户额外要求: ${userInput}` : '';

  // 构建已有内容描述（哪些字段已有内容，哪些需要生成）
  const existingParts = [];
  if (songIdea && songIdea.trim()) existingParts.push('风格描述');
  if (lyrics && lyrics.trim()) existingParts.push('歌词');
  if (songName && songName.trim()) existingParts.push('歌曲名称');

  const missingParts = [];
  if (!songIdea || !songIdea.trim()) missingParts.push('风格描述');
  if (!lyrics || !lyrics.trim()) missingParts.push('歌词');
  if (!songName || !songName.trim()) missingParts.push('歌曲名称');

  let contextNote = '';
  if (existingParts.length > 0) {
    contextNote = `\n已有内容（请参考并保持一致性）:\n`;
    if (songIdea && songIdea.trim()) contextNote += `风格描述: ${songIdea.trim()}\n`;
    if (lyrics && lyrics.trim()) contextNote += `歌词:\n${lyrics.trim()}\n`;
    if (songName && songName.trim()) contextNote += `歌曲名称: ${songName.trim()}\n`;
  }
  if (missingParts.length > 0) {
    contextNote += `\n需要生成的部分: ${missingParts.join('、')}`;
  }

  return `请根据以下描述，完成一首完整的歌曲创作。

风格: ${styleStr}
创作想法: ${songIdea || '(由用户直接描述)'}
${contextNote}
${extra}

请严格按照以下格式输出，每部分用明确的标记分隔，标记单独占一行：

=== 风格描述 ===
[对歌曲风格的详细描述，50-200字，包括情感基调、节奏特点、乐器搭配等]

=== 歌词 ===
[完整的歌词正文，按段落分行，每段之间空一行]

=== 歌曲名称 ===
[建议的歌曲名称，1个即可]

注意：
1. 风格描述要具体、有画面感，能指导后续的音乐制作
2. 歌词要有韵律感和情感深度
3. 歌曲名称要简洁有力，与歌词主题契合
4. 三个部分缺一不可
5. 如果某部分已有内容，请在其基础上优化或保持一致性；如果某部分需要生成，请全新创作`;
}

/**
 * 构建歌词相关 Prompt
 * @param {string} actionType
 * @param {Object} context
 * @param {string} userInput
 * @returns {string}
 */
function buildLyricsPrompt(actionType, context, userInput = '') {
  const { songIdea, lyrics, songName, styles } = context;
  const styleStr = styles.length > 0 ? styles.join('、') : '未指定';
  const extra = userInput ? `\n用户额外要求: ${userInput}` : '';

  // 补充上下文信息（歌曲名称等）
  let contextNote = '';
  if (songName && songName.trim()) {
    contextNote += `\n歌曲名称: ${songName.trim()}`;
  }

  const templates = {
    [ACTION_TYPE.POLISH]: `请润色以下歌词，提升文学性和韵律感，保持原有主题和情感。

风格: ${styleStr}
歌曲想法: ${songIdea || '(无)'}${contextNote}
当前歌词:
${lyrics || '(无内容)'}
${extra}

请直接输出润色后的完整歌词。`,

    [ACTION_TYPE.REWRITE]: `请用不同的表达方式重写以下歌词，保持主题不变。

风格: ${styleStr}
歌曲想法: ${songIdea || '(无)'}${contextNote}
当前歌词:
${lyrics || '(无内容)'}
${extra}

请直接输出重写后的完整歌词。`,

    [ACTION_TYPE.CONTINUE]: `请根据已有内容续写歌词，保持风格一致。

风格: ${styleStr}
歌曲想法: ${songIdea || '(无)'}${contextNote}
已有歌词:
${lyrics || '(无内容)'}
${extra}

请直接输出续写后的完整歌词（包含已有内容 + 续写部分）。`,

    [ACTION_TYPE.GENERATE]: `请根据以下描述创作歌词。

风格: ${styleStr}
歌曲想法: ${songIdea || '(无)'}${contextNote}
${extra}

请直接输出创作的完整歌词。`,
  };

  return templates[actionType] || templates[ACTION_TYPE.GENERATE];
}

/**
 * 构建歌曲名称 Prompt
 * @param {Object} context
 * @param {string} userInput
 * @returns {string}
 */
function buildSongNamePrompt(context, userInput = '') {
  const { songIdea, lyrics, songName, styles } = context;
  const styleStr = styles.length > 0 ? styles.join('、') : '未指定';
  const extra = userInput ? `\n用户额外要求: ${userInput}` : '';

  let contextNote = '';
  if (songName && songName.trim()) {
    contextNote = `\n已有歌曲名称（可参考或改进）: ${songName.trim()}`;
  }

  return `请为这首歌起 3-5 个有创意的歌曲名称。

风格: ${styleStr}
歌曲想法: ${songIdea || '(无)'}
歌词:
${lyrics || '(无)'}${contextNote}
${extra}

请直接输出歌曲名称列表，每行一个。`;
}

/**
 * 构建歌曲想法/风格描述优化 Prompt
 * @param {Object} context
 * @param {string} userInput
 * @returns {string}
 */
function buildIdeaPrompt(context, userInput = '') {
  const { songIdea, lyrics, songName, styles } = context;
  const styleStr = styles.length > 0 ? styles.join('、') : '未指定';
  const extra = userInput ? `\n用户额外要求: ${userInput}` : '';

  let contextNote = '';
  if (lyrics && lyrics.trim()) {
    contextNote += `\n已有歌词（可参考）:\n${lyrics.trim()}`;
  }
  if (songName && songName.trim()) {
    contextNote += `\n歌曲名称: ${songName.trim()}`;
  }

  return `请优化以下歌曲创作想法，使其更具体、更有画面感、更具音乐性。

风格: ${styleStr}
当前想法: ${songIdea || '(无)'}${contextNote}
${extra}

请直接输出优化后的歌曲想法。`;
}

/**
 * 根据输入框类型和操作类型选择合适的 Prompt 构建函数
 * @param {string} inputType - INPUT_TYPE 枚举值
 * @param {string} actionType - ACTION_TYPE 枚举值
 * @param {Object} context - 页面上下文
 * @param {string} userInput - 用户额外要求
 * @returns {{ system: string, user: string }}
 */
function buildPrompt(inputType, actionType, context, userInput = '') {
  const system = buildSystemPrompt(context);
  const user = buildUserPrompt(inputType, actionType, context, userInput);
  return { system, user };
}
