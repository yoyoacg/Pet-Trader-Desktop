const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { app, dialog, nativeImage } = require('electron');
const { builtin, vpet } = require('./local-store.cjs');

const emotions = ['idle','thinking','happy','sad','angry','proud','surprised','sleepy','working'];
const root = () => path.join(app.getPath('userData'), 'characters');
const packagedIds = ['whale-cat-maid', 'ds-whale-girl', 'jyn'];
const packagedRoot = () => path.join(app.getAppPath(), 'assets', 'pets');
// 导入的女仆鲸鱼娘使用 WebP 连续帧，通过同一角色资源协议读取。
const allowed = new Set(['.json','.moc3','.png','.webp','.jpg','.jpeg','.wav','.mp3']);

function contained(base, relative) {
  const resolved = fs.realpathSync(path.resolve(base, relative));
  const prefix = fs.realpathSync(base) + path.sep;
  if (!resolved.startsWith(prefix)) throw new Error(`角色资源越出目录：${relative}`);
  return resolved;
}
function copyResources(base, source, destination) {
  fs.mkdirSync(destination, {recursive: true});
  for (const entry of fs.readdirSync(source, {withFileTypes: true})) {
    const sourceFile = path.join(source, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`角色目录不允许符号链接：${entry.name}`);
    if (entry.isDirectory()) copyResources(base, sourceFile, path.join(destination, entry.name));
    else if (allowed.has(path.extname(entry.name).toLowerCase())) fs.copyFileSync(contained(base, path.relative(base, sourceFile)), path.join(destination, entry.name));
  }
}
function list() {
  const characters = [vpet(), builtin(), ...packagedIds.map(id => JSON.parse(fs.readFileSync(path.join(packagedRoot(),id,'pet.json'),'utf8')))];
  if (!fs.existsSync(root())) return characters; // 新安装还没有用户角色配置。
  // 素材随 assets 分发，用户修改过的同名角色配置仍优先保留，列表不重复显示。
  const byId = new Map(characters.map(character => [character.id, character]));
  for (const id of fs.readdirSync(root()).filter(id => fs.existsSync(path.join(root(),id,'pet.json')))) {
    const saved = JSON.parse(fs.readFileSync(path.join(root(),id,'pet.json'),'utf8'));
    const base = byId.get(saved.id);
    if (base) {
      // 内置角色包随客户端升级，保留用户自定义名称与合法状态映射，刷新最新的动画与姿态清单。
      const states = {...base.states};
      if (saved.states) {
        for (const emotion of emotions) {
          const val = saved.states[emotion];
          if (base.type !== 'puppet' || (typeof val === 'string' && base.puppet?.poses?.[val])) states[emotion] = val;
        }
      }
      byId.set(saved.id, {...base, name: saved.name || base.name, author: saved.author || base.author, license: saved.license || base.license, states});
    } else {
      byId.set(saved.id, saved);
    }
  }
  return [...byId.values()];
}
async function importCharacter() {
  const choice = await dialog.showOpenDialog({ title: '导入九宫格 PNG 或 Live2D 模型', properties: ['openFile'], filters: [{name:'角色资源',extensions:['png','json']}] });
  if (choice.canceled) return null;
  const source = choice.filePaths[0];
  const id = randomUUID();
  const target = path.join(root(),id);
  const result = {formatVersion:1,id,name:path.basename(source,path.extname(source)),author:'用户导入',license:'由素材作者授权决定',type:'sprite',aspectRatio:1,entry:`petasset://characters/${id}/${encodeURIComponent(path.basename(source))}`,states:{},motions:[],expressions:[]};
  if (path.extname(source).toLowerCase() === '.png') {
    const image = nativeImage.createFromPath(source);
    const {width,height} = image.getSize();
    if (image.isEmpty() || width%3!==0 || height%3!==0) throw new Error('PNG 必须是宽高均可被 3 整除的九宫格图片');
    result.aspectRatio=width/height;
    fs.mkdirSync(target,{recursive:true});
    fs.copyFileSync(source,path.join(target,path.basename(source)));
    emotions.forEach((emotion,index) => {result.states[emotion]=index;});
  } else {
    if (!source.endsWith('.model3.json')) throw new Error('请选择 .model3.json，不能导入模型编辑工程或其他 JSON');
    const model = JSON.parse(fs.readFileSync(source,'utf8'));
    const refs = model.FileReferences;
    const base = path.dirname(source);
    const references = [refs.Moc,...refs.Textures];
    for (const key of ['Physics','Pose','DisplayInfo']) if (refs[key]) references.push(refs[key]);
    for (const item of Object.values(refs.Motions ?? {}).flat()) {references.push(item.File);if(item.Sound) references.push(item.Sound);}
    for (const item of refs.Expressions ?? []) references.push(item.File);
    for (const reference of references) {
      if (!allowed.has(path.extname(reference).toLowerCase())) throw new Error(`模型资源类型不支持：${reference}`);
      contained(base,reference);
    }
    copyResources(base,base,target);
    result.type='live2d';
    result.motions=Object.entries(refs.Motions ?? {}).flatMap(([group,items]) => items.map((_,index)=>({group,index})));
    result.expressions=(refs.Expressions ?? []).map(item=>item.Name);
    emotions.forEach(emotion => {result.states[emotion]={kind:'bubbleOnly'};});
  }
  fs.writeFileSync(path.join(target,'pet.json'),JSON.stringify(result,null,2),'utf8');
  return result;
}
function saveCharacter(character) {
  if (['builtin','builtin-vpet'].includes(character.id)) throw new Error('内置示例只读，请导入自己的角色后配置');
  const packaged=packagedIds.includes(character.id);
  const directory=packaged?path.join(root(),character.id):contained(root(),character.id);
  if(packaged) fs.mkdirSync(directory,{recursive:true});
  // 配置来自导入界面；这里只接收既有角色编号，不能把 IPC 变成任意文件写入。
  for(const emotion of emotions) {
    const mapping=character.states[emotion];
    if(character.type==='sprite' && (!Number.isInteger(mapping)||mapping<0||mapping>8)) throw new Error(`精灵图映射无效：${emotion}`);
    if(character.type==='live2d') {
      const valid=mapping.kind==='bubbleOnly' || (mapping.kind==='motion' && character.motions.some(item=>item.group===mapping.group&&item.index===mapping.index)) || (mapping.kind==='expression'&&character.expressions.includes(mapping.name));
      if(!valid) throw new Error(`Live2D 映射无效：${emotion}`);
    }
    if(character.type==='puppet') {
      const poses=character.puppet?.poses;
      if(!poses || typeof mapping!=='string' || !(mapping in poses)) throw new Error(`动态人偶映射无效：${emotion}`);
    }
  }
  fs.writeFileSync(path.join(directory,'pet.json'),JSON.stringify(character,null,2),'utf8');
}
function resource(url) {
  const parsed=new URL(url);
  if(parsed.hostname==='builtin' && parsed.pathname==='/default.png') return path.join(app.getAppPath(),'assets','default.png');
  // VPet 只允许读取随应用分发的动画 PNG，继续限制目录越界。
  if(parsed.hostname==='vpet') {
    const relative=decodeURIComponent(parsed.pathname.slice(1));
    if(path.extname(relative).toLowerCase()!=='.png') throw new Error('VPet 资源仅允许 PNG 动画帧');
    return contained(path.join(app.getAppPath(),'assets','vpet'),relative);
  }
  if(parsed.hostname==='runtime' && parsed.pathname==='/live2dcubismcore.min.js') return path.join(app.getAppPath(),'vendor','live2dcubismcore.min.js');
  if(parsed.hostname!=='characters') throw new Error('未知角色资源域');
  const relative=decodeURIComponent(parsed.pathname.slice(1));
  if(!allowed.has(path.extname(relative).toLowerCase())) throw new Error('该文件类型不能通过角色协议访问');
  const id=relative.split('/')[0];
  return contained(packagedIds.includes(id)?packagedRoot():root(),relative);
}
module.exports={list,importCharacter,saveCharacter,resource};
