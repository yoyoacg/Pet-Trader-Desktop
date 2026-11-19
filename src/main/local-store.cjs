const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage } = require('electron');

const file = name => path.join(app.getPath('userData'), name);
const builtin = () => ({ formatVersion: 1, id: 'builtin', name: '阿废', author: 'my-life contributors', license: 'MIT', type: 'sprite', aspectRatio: 1, entry: 'petasset://builtin/default.png', states: {idle:0,thinking:1,happy:2,sad:3,angry:4,proud:5,surprised:6,sleepy:7,working:8}, motions: [], expressions: [] });
const vpet = () => JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'assets', 'vpet', 'character.json'), 'utf8'));

const defaultPersona = '嘴硬、爱邀功、实际对老板非常负责的交易小秘书';

function initialProfile() {
  return { auto: false, banned: [], budgetCents: 1000000, trust: 50, cycles: 0, persona: defaultPersona, memories: [], lastTradeId: 0, review: null, pendingOrder: null, character: builtin() };
}
function session() {
  const target = file('session.json');
  if (!fs.existsSync(target)) return null; // 首次启动尚无登录会话。
  const saved = JSON.parse(fs.readFileSync(target, 'utf8'));
  saved.token = safeStorage.decryptString(Buffer.from(saved.token, 'base64'));
  return saved;
}
function saveSession(value) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统无法加密保存登录凭据');
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(file('session.json'), JSON.stringify({...value, token: safeStorage.encryptString(value.token).toString('base64')}), 'utf8');
}
function profileFile(current) {
  // 用服务器地址和用户编号隔离本地记忆，切换账号不会混用角色关系。
  return file(`profile-${Buffer.from(`${current.url}:${current.userId}`).toString('base64url')}.json`);
}
function readProfile(current) {
  const target = profileFile(current);
  if (!fs.existsSync(target)) return initialProfile();
  const saved = JSON.parse(fs.readFileSync(target, 'utf8'));
  return { ...saved, persona: saved.persona || defaultPersona };
}
function saveProfile(value) {
  fs.writeFileSync(profileFile(session()), JSON.stringify(value, null, 2), 'utf8');
}
function readAIConfig() {
  const target = file('ai-config.json');
  if (!fs.existsSync(target)) return { enabled: false, endpoint: '', model: '', imageEndpoint: '', imageModel: '', apiKey: '' };
  const saved = JSON.parse(fs.readFileSync(target, 'utf8'));
  const apiKey = saved.apiKey ? safeStorage.decryptString(Buffer.from(saved.apiKey, 'base64')) : '';
  return {
    enabled: Boolean(saved.enabled),
    endpoint: String(saved.endpoint || ''),
    model: String(saved.model || ''),
    imageEndpoint: String(saved.imageEndpoint || ''),
    imageModel: String(saved.imageModel || ''),
    apiKey,
  };
}
function publicAIConfig() {
  const config = readAIConfig();
  return {
    enabled: config.enabled,
    endpoint: config.endpoint,
    model: config.model,
    imageEndpoint: config.imageEndpoint,
    imageModel: config.imageModel,
    hasApiKey: config.apiKey !== '',
  };
}
function normalizeAIEndpoint(raw, defaultSuffix = '/v1/chat/completions') {
  const trimmed = String(raw || '').trim();
  if (trimmed === '') return '';
  const parsed = new URL(trimmed);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('AI 接口地址必须为不含凭据的 HTTP 或 HTTPS 完整 URL');
  }
  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  if (cleanPath === '' || cleanPath === '/v1') {
    parsed.pathname = defaultSuffix;
  }
  return parsed.toString();
}
function saveAIConfig(input) {
  const existing = fs.existsSync(file('ai-config.json')) ? JSON.parse(fs.readFileSync(file('ai-config.json'), 'utf8')) : { apiKey: '' };
  const endpoint = normalizeAIEndpoint(input.endpoint, '/v1/chat/completions');
  const model = String(input.model || '').trim();
  const imageEndpoint = normalizeAIEndpoint(input.imageEndpoint, '/v1/images/generations');
  const imageModel = String(input.imageModel || '').trim();
  const rawKey = String(input.apiKey || '').trim();
  let encryptedKey = String(existing.apiKey || '');
  if (rawKey !== '') {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统无法加密保存 AI 密钥');
    encryptedKey = safeStorage.encryptString(rawKey).toString('base64');
  }
  const enabled = Boolean(input.enabled);
  // 本地模型（如 LM Studio / Ollama）不需要密钥，只要求填写接口地址与模型名称。
  if (enabled && (endpoint === '' || model === '')) {
    throw new Error('启用本地 AI 前请填写接口地址与模型名称（本地无密钥模型可不填 API Key）');
  }
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(file('ai-config.json'), JSON.stringify({ enabled, endpoint, model, imageEndpoint, imageModel, apiKey: encryptedKey }, null, 2), 'utf8');
  return publicAIConfig();
}
function logout() { fs.unlinkSync(file('session.json')); }
module.exports = { file, builtin, vpet, session, saveSession, readProfile, saveProfile, readAIConfig, publicAIConfig, saveAIConfig, normalizeAIEndpoint, logout };
