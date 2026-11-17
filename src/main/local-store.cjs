const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage } = require('electron');

const file = name => path.join(app.getPath('userData'), name);
const builtin = () => ({ formatVersion: 1, id: 'builtin', name: '阿废', author: 'my-life contributors', license: 'MIT', type: 'sprite', aspectRatio: 1, entry: 'petasset://builtin/default.png', states: {idle:0,thinking:1,happy:2,sad:3,angry:4,proud:5,surprised:6,sleepy:7,working:8}, motions: [], expressions: [] });
const vpet = () => JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'assets', 'vpet', 'character.json'), 'utf8'));

function initialProfile() {
  return { auto: false, banned: [], budgetCents: 1000000, trust: 50, cycles: 0, memories: [], lastTradeId: 0, review: null, pendingOrder: null, character: builtin() };
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
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}
function saveProfile(value) {
  fs.writeFileSync(profileFile(session()), JSON.stringify(value, null, 2), 'utf8');
}
function logout() { fs.unlinkSync(file('session.json')); }
module.exports = { file, builtin, vpet, session, saveSession, readProfile, saveProfile, logout };
