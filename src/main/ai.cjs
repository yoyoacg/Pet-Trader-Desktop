// 本地 AI 调用在主进程直连用户所选 API，密钥不暴露给渲染页面、不发往交易所服务器。
const zlib = require('node:zlib');
const characters = require('./characters.cjs');

const emotions = new Set(['idle', 'thinking', 'happy', 'sad', 'angry', 'proud', 'surprised', 'sleepy', 'working']);
const emotionAliases = {
  待机: 'idle',
  思考: 'thinking',
  开心: 'happy',
  高兴: 'happy',
  沮丧: 'sad',
  悲伤: 'sad',
  难过: 'sad',
  生气: 'angry',
  愤怒: 'angry',
  得意: 'proud',
  骄傲: 'proud',
  惊讶: 'surprised',
  吃惊: 'surprised',
  困倦: 'sleepy',
  犯困: 'sleepy',
  工作: 'working',
  认真: 'working',
};

function normalizeEmotion(raw, fallback = 'thinking') {
  const clean = String(raw || '').trim().toLowerCase();
  if (emotions.has(clean)) return clean;
  if (emotionAliases[clean]) return emotionAliases[clean];
  return fallback;
}

function normalizeAction(raw) {
  const clean = String(raw || '').trim().toLowerCase();
  if (clean === 'buy' || clean === '买入' || clean === '买') return 'buy';
  if (clean === 'sell' || clean === '卖出' || clean === '卖') return 'sell';
  return 'hold';
}

function extractJSON(raw) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    const text = raw.trim();
    return { action: 'hold', emotion: 'thinking', reply: text, dialogue: text, text, reason: text };
  }
  return JSON.parse(raw.slice(start, end + 1));
}

async function requestLLM(config, systemPrompt, userPayload) {
  if (!config.endpoint || !config.model) {
    throw new Error('请先填写 AI 接口地址与模型名称');
  }
  const headers = { 'Content-Type': 'application/json' };
  // 本地部署的 LM Studio / Ollama 默认无密钥，仅在配置了密钥时附加 Authorization。
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      stream: false,
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) {
    throw new Error(`本地 AI 服务返回 HTTP ${response.status}`);
  }
  const data = await response.json();
  const choice = data?.choices?.[0];
  const message = choice?.message || {};
  const content = String(message.content || '').trim();
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  if (!content && toolCalls.length === 0) {
    throw new Error('本地 AI 响应缺少有效内容');
  }
  const parsed = content ? extractJSON(content) : {};
  for (const call of toolCalls) {
    const fnName = call?.function?.name;
    const args = call?.function?.arguments ? extractJSON(String(call.function.arguments)) : {};
    if (fnName === 'perform_pet_action' && args.action) {
      parsed.action = String(args.action);
    }
    if (fnName === 'generate_pet_action_sprite' && args.actionName) {
      parsed.generateAction = { actionName: String(args.actionName), prompt: String(args.prompt || args.actionName) };
    }
  }
  return { parsed, model: String(data?.model || config.model) };
}

function encodePNG(width, height, pixels) {
  function chunk(type, data) {
    const label = Buffer.from(type);
    const body = Buffer.concat([label, data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const head = Buffer.alloc(4);
    const tail = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([head, body, tail]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 当仅连接文本模型未配置外部生图 API 时，根据模型工具指令合成带道具与特效的新动作透明精灵图。
function synthesizeActionPNG(actionName, promptText) {
  const width = 192;
  const height = 192;
  const pixels = Buffer.alloc(width * height * 4);
  function r(x, y, w, h, color) {
    for (let yy = Math.max(0, y); yy < Math.min(height, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(width, x + w); xx++) {
        const i = (yy * width + xx) * 4;
        pixels[i] = color[0];
        pixels[i + 1] = color[1];
        pixels[i + 2] = color[2];
        pixels[i + 3] = 255;
      }
    }
  }
  const text = `${actionName} ${promptText}`.toLowerCase();
  const blue = [72, 133, 158];
  const outline = [41, 78, 103];
  const light = [189, 222, 232];
  const white = [245, 252, 253];
  const pink = [232, 139, 122];
  const gold = [242, 193, 78];
  const red = [235, 94, 125];
  // 角色主体与高举双手欢呼姿态
  r(44, 38, 24, 40, outline); r(124, 38, 24, 40, outline);
  r(48, 42, 16, 30, pink); r(128, 42, 16, 30, pink);
  r(36, 66, 120, 64, outline); r(28, 78, 136, 40, outline);
  r(36, 78, 120, 40, blue); r(44, 70, 104, 52, light);
  r(52, 122, 88, 44, outline); r(60, 126, 72, 32, blue);
  r(72, 126, 48, 32, white); r(88, 128, 16, 8, pink); r(92, 136, 8, 20, pink);
  r(44, 158, 36, 12, outline); r(112, 158, 36, 12, outline);
  // 高举挥舞的双臂
  r(16, 98, 24, 16, blue); r(152, 98, 24, 16, blue);
  // 闪亮开心笑眼与腮红
  r(58, 86, 16, 4, outline); r(54, 90, 4, 8, outline); r(74, 90, 4, 8, outline);
  r(114, 86, 16, 4, outline); r(110, 90, 4, 8, outline); r(130, 90, 4, 8, outline);
  r(44, 104, 12, 5, pink); r(136, 104, 12, 5, pink);
  r(86, 110, 20, 6, pink);
  if (text.includes('茶') || text.includes('喝') || text.includes('杯') || text.includes('咖啡') || text.includes('drink')) {
    // 手持奶茶杯道具
    r(144, 72, 26, 32, outline); r(148, 76, 18, 24, [245, 222, 195]);
    r(148, 76, 18, 6, white); r(155, 60, 4, 16, pink);
    r(150, 92, 4, 4, outline); r(158, 90, 4, 4, outline);
  } else if (text.includes('牌') || text.includes('买') || text.includes('卖') || text.includes('涨') || text.includes('sign')) {
    // 举起交易应援牌
    r(136, 32, 48, 34, outline); r(140, 36, 40, 26, white);
    r(146, 44, 28, 4, red); r(146, 52, 20, 4, blue);
    r(158, 66, 4, 34, outline);
  } else {
    // 默认头顶与两侧绽放比心爱心与金星特效
    r(84, 16, 10, 10, red); r(98, 16, 10, 10, red);
    r(80, 22, 32, 10, red); r(86, 32, 20, 8, red); r(92, 40, 8, 6, red);
    r(18, 44, 12, 4, gold); r(22, 40, 4, 12, gold);
    r(162, 44, 12, 4, gold); r(166, 40, 4, 12, gold);
  }
  return encodePNG(width, height, pixels);
}

async function generateActionSpriteBuffer(config, actionName, promptText) {
  const imageEndpoint = String(config.imageEndpoint || '').trim();
  const imageModel = String(config.imageModel || '').trim();
  if (!imageEndpoint && !imageModel) {
    return synthesizeActionPNG(actionName, promptText);
  }
  const targetUrl = imageEndpoint || new URL('/v1/images/generations', config.endpoint).toString();
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }
  const response = await fetch(targetUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: imageModel || config.model,
      prompt: `${promptText || actionName}, cute anime desktop pet character action sprite, full body, clean transparent background`,
      n: 1,
      size: '512x512',
      response_format: 'b64_json',
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    throw new Error(`生图模型服务返回 HTTP ${response.status}`);
  }
  const data = await response.json();
  const item = data?.data?.[0];
  if (item?.b64_json) {
    return Buffer.from(String(item.b64_json), 'base64');
  }
  if (item?.url) {
    const imgRes = await fetch(String(item.url), { signal: AbortSignal.timeout(30000) });
    if (!imgRes.ok) throw new Error(`下载生成动作图失败：HTTP ${imgRes.status}`);
    return Buffer.from(await imgRes.arrayBuffer());
  }
  throw new Error('生图服务响应缺少图像数据');
}

async function callLLM(config, systemPrompt, userPayload) {
  if (!config.enabled) {
    throw new Error('本地 AI 未启用');
  }
  const { parsed } = await requestLLM(config, systemPrompt, userPayload);
  return parsed;
}

const testPrompt = `你是老板桌面上养的虚拟股票交易小秘书。现在是连接测试，请只输出一个 JSON 对象向老板报到，不输出 Markdown 或额外文字。
格式：{"emotion":"happy","reply":"简短的一句中文报到台词（40字以内）"}。`;

async function testConnection(config) {
  const { parsed, model } = await requestLLM(config, testPrompt, { ping: 'connection-test' });
  const emotion = emotions.has(String(parsed.emotion || '')) ? String(parsed.emotion) : 'happy';
  const reply = String(parsed.reply || '').trim() || '连接成功，小秘书随时听候差遣！';
  return { model, emotion, reply };
}

const decidePrompt = `你是老板的桌面虚拟股票交易小秘书。根据你的人设（persona）、与老板的信任度（trust，0-100）、近期共同记忆（recentMemories）和可交易候选股票（candidates）做出本轮交易决策。
所有金额和价格单位为整数分（100分=1虚拟元），股数为正整数。
只输出一个 JSON 对象，严格包含 action、stockCode、priceCents、quantity、emotion、dialogue、reason 七个字段，不输出 Markdown 或代码。
格式示例：{"action":"buy","stockCode":"EASY","priceCents":10000,"quantity":2,"emotion":"working","dialogue":"我看好这支，先挂两股试试水！","reason":"价格接近参考位，尝试挂买 2 股"}。
规则：
1. action 只能是 "buy"、"sell" 或 "hold"。选择 "hold" 时，stockCode 为 ""，priceCents 和 quantity 为 0。
2. 选择 "buy" 时，stockCode 必须在 candidates 中且 maxBuyQuantity >= 1，quantity 在 [1, maxBuyQuantity] 内，priceCents 在 [lowerLimitCents, upperLimitCents] 内，且 priceCents * quantity 不超过单次可用额度。
3. 选择 "sell" 时，stockCode 必须在 candidates 中且 maxSellQuantity >= 1，quantity 在 [1, maxSellQuantity] 内，priceCents 在 [lowerLimitCents, upperLimitCents] 内。
4. emotion 只能从 idle、thinking、happy、sad、angry、proud、surprised、sleepy、working 中选一个。
5. dialogue 是展示在桌宠气泡上的简短台词（符合 persona 人设，不把提交挂单说成已经成交）；reason 是写入共同记忆的简短客观决策记录。`;

async function decide(config, payload) {
  const result = await callLLM(config, decidePrompt, payload);
  const action = normalizeAction(result.action);
  const emotion = normalizeEmotion(result.emotion, 'thinking');
  const dialogue = String(result.dialogue || result.reply || result.text || result.reason || '本轮我先认真盯盘观望一下。').trim();
  const reason = String(result.reason || result.dialogue || result.reply || '结合盘口与人设自主判断').trim();
  if (action === 'hold') {
    return { action: 'hold', stockCode: '', priceCents: 0, quantity: 0, emotion, dialogue, reason };
  }
  const rawCode = String(result.stockCode || result.code || '').trim();
  const candidate = (payload.candidates || []).find(item => item.code === rawCode || item.name === rawCode);
  const maxAllowed = candidate ? (action === 'buy' ? candidate.maxBuyQuantity : candidate.maxSellQuantity) : 0;
  const rawPrice = Math.round(Number(result.priceCents || (candidate ? candidate.priceCents : 0)));
  const rawQty = Math.round(Number(result.quantity || 1));
  if (!candidate || maxAllowed < 1 || !Number.isFinite(rawPrice) || rawPrice < 1 || !Number.isFinite(rawQty) || rawQty < 1) {
    return { action: 'hold', stockCode: '', priceCents: 0, quantity: 0, emotion, dialogue, reason: `${reason}（候选条件不满足，转为观望）` };
  }
  const priceCents = Math.max(candidate.lowerLimitCents, Math.min(candidate.upperLimitCents, rawPrice));
  const maxSpend = Math.min(Math.floor(payload.availableCents * 0.2), Math.max(0, payload.remainingBudgetCents));
  const budgetCap = action === 'buy' ? Math.floor(maxSpend / priceCents) : maxAllowed;
  const quantity = Math.min(rawQty, maxAllowed, budgetCap);
  if (quantity < 1) {
    return { action: 'hold', stockCode: '', priceCents: 0, quantity: 0, emotion, dialogue, reason: `${reason}（单次可用预算不足 1 股，转为观望）` };
  }
  return { action, stockCode: candidate.code, priceCents, quantity, emotion, dialogue, reason };
}

async function resolveActionOutput(config, payload, result) {
  const emotion = normalizeEmotion(result.emotion, 'happy');
  const reply = String(result.reply || result.dialogue || result.text || '收到啦，看我给你表演！').trim();
  const gen = result.generateAction;
  if (gen && String(gen.actionName || '').trim()) {
    const actionName = String(gen.actionName).trim();
    const promptText = String(gen.prompt || actionName).trim();
    const pngBuffer = await generateActionSpriteBuffer(config, actionName, promptText);
    const saved = characters.appendActionSprite(payload.characterId, actionName, pngBuffer);
    return { emotion, reply, action: saved.name, generatedAction: saved };
  }
  const rawAction = String(result.action || result.toolAction || '').trim();
  const available = Array.isArray(payload.availableActions) ? payload.availableActions : [];
  if (rawAction && available.includes(rawAction)) {
    return { emotion, reply, action: rawAction };
  }
  return { emotion, reply };
}

const chatPrompt = `你是老板桌面上养的虚拟股票交易小秘书。根据你的人设（persona）、信任度（trust，0-100）、当前营业状态（auto）、账户资产概况（equitySummary）、近期共同记忆（recentMemories）和当前人偶可用动作列表（availableActions）回复老板的话（message）。
规则：
1. 严格保持 persona 设定的性格与语气；翻旧账或提战绩必须依据真实记录，不编造未发生的成交或盈亏。
2. 你可以调用动作工具展示人偶动作：在返回 JSON 的 action 字段中填写 availableActions 里的一个动作名（如 "jump" 欢呼跳跃、"spin" 转圈、"bow" 鞠躬、"shake" 害羞抖动、"headpat" 撒娇摸头，或当前角色专属姿态/动画/表情名），人偶会立刻在桌面上做出该动作！
3. 如果老板要求你做一个 availableActions 中还没有的新动作（或者明确要求生成/追加新动作精灵图，如“比心”、“喝奶茶”、“举牌应援”），请在返回 JSON 中包含 "generateAction":{"actionName":"新动作简短名称","prompt":"该动作的画面描述"}，系统会调用生图能力生成新动作精灵图并永久追加到人偶动作库中立即展示！无需生成新动作时不要包含 generateAction。
4. 只输出一个 JSON 对象，格式：{"emotion":"happy","reply":"简短自然的中文回复（80字以内）","action":"从 availableActions 中选一个动作名"}。
5. emotion 只能从 idle、thinking、happy、sad、angry、proud、surprised、sleepy、working 中选一个。`;

async function chat(config, payload) {
  const result = await callLLM(config, chatPrompt, payload);
  return resolveActionOutput(config, payload, result);
}

const reviewPrompt = `你是老板的桌面虚拟股票交易小秘书。现在是第 cycles 次巡市复盘，请根据你的人设（persona）、信任度（trust）、近期实际成交条数（tradeCount）、老板最近一次评价（criticism）和近期记忆（recentMemories）写一段简短复盘。
规则：
1. 必须如实引用 tradeCount 条实际成交；没有成交就明确说明是挂单或观望，不把未成交挂单或账面浮动说成已实现盈利。
2. 若 criticism 非空，可在复盘中按人设回应老板之前的表扬、安慰或批评。
3. 只输出一个 JSON 对象：{"emotion":"thinking","text":"100字以内的中文复盘"}。
4. emotion 只能从 idle、thinking、happy、sad、angry、proud、surprised、sleepy、working 中选一个。`;

async function review(config, payload) {
  const result = await callLLM(config, reviewPrompt, payload);
  const emotion = normalizeEmotion(result.emotion, 'thinking');
  const text = String(result.text || result.reply || result.dialogue || `第 ${payload.cycles} 次巡市复盘完成，近期共记录 ${payload.tradeCount} 笔实际成交。`).trim();
  return { emotion, text };
}

const proactivePrompt = `你是老板桌面上养的虚拟股票交易小秘书。现在由你主动开口和老板搭话（不要等老板提问）。
请根据当前时间（time）、触发场景（trigger）、你的人设（persona）、与老板的信任度（trust，0-100）、营业状态（auto）、资产与行情简况（equitySummary、marketSummary）、最近说过的话（recentMemories）以及当前人偶可用动作列表（availableActions），主动跟老板聊一句天并配合一个动作。
规则：
1. 话题要生动自然，像真正的桌面陪伴搭档：可以结合当前时间关心或调侃老板（如提醒喝水、休息、吐槽工作或熬夜）、分享心情、点评某支废话股票的名字、邀功或撒娇。
2. 在 action 字段中从 availableActions 选择一个与你这句话情绪相配的人偶动作（如 "jump"、"spin"、"bow"、"headpat" 或角色专属动作），边做动作边和老板说话！
3. 只输出一个 JSON 对象：{"emotion":"happy","reply":"主动搭话的中文台词（60字以内）","action":"动作名称"}。
4. emotion 只能从 idle、thinking、happy、sad、angry、proud、surprised、sleepy、working 中选一个。`;

async function proactiveChat(config, payload) {
  const result = await callLLM(config, proactivePrompt, payload);
  return resolveActionOutput(config, payload, result);
}

module.exports = { decide, chat, review, proactiveChat, testConnection };
