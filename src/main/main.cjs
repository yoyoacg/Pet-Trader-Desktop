// 窗口和托盘组织方式改编自 Lumi Deskpet，保留上游许可于 THIRD_PARTY_NOTICES.md。
const {app,BrowserWindow,Menu,Tray,ipcMain,nativeImage,screen,protocol,net,shell} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');
const local = require('./local-store.cjs');
const characters = require('./characters.cjs');
const {startRoaming} = require('./roaming.cjs');
const {PET_SIZE,PET_DOCK_SIZE,PET_BODY_SIZE,petBodyBounds,movePetBody} = require('./pet-window.cjs');

// 同一台电脑的两个进程会共用本地档案，必须阻止跨账号串用会话和记忆。
if(!app.requestSingleInstanceLock()) app.exit(0);
if(process.platform==='win32') app.setAppUserModelId('org.mylife.exchange');
app.on('second-instance',()=>{void app.whenReady().then(()=>showPanel());});
protocol.registerSchemesAsPrivileged([{scheme:'petasset',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
let panel,pet,tray,showPanel;
let visual={character:local.builtin(),emotion:'idle',text:'老板，先连接交易所。今天的行情还等着我呢。'};
const runtimeReady=()=>fs.existsSync(path.join(app.getAppPath(),'vendor','live2dcubismcore.min.js'));

function bootstrap() {
  const session=local.session();
  return {session:session?{url:session.url,username:session.username,userId:session.userId}:null,profile:session?local.readProfile(session):null,characters:characters.list(),live2dReady:runtimeReady()};
}
async function request(url,token,method,route,body) {
  if(!/^(GET|POST|DELETE)$/.test(method) || !/^\/api\/(auth\/(login|register)|market|stocks\/[A-Z]+\/(book|trades|chart)|me\/(account|orders|trades(?:\/history)?)|me\/orders\/by-client\/[a-zA-Z0-9-]+|orders(?:\/(?:\d+|abandon))?)(?:\?[^#]*)?$/.test(route)) throw new Error('不允许的交易所请求');
  const headers={'Content-Type':'application/json'};
  if(token) headers.Authorization=`Bearer ${token}`;
  const response=await fetch(new URL(route,url),{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  return {ok:response.ok,status:response.status,body:await response.json()};
}
function handle(channel,fn,petAllowed=false) {
  ipcMain.handle(channel,async(event,...args)=>{
    // 只允许本应用自己的窗口调用桥接，不向模型资源开放系统接口。
    if(event.sender!==panel.webContents && !(petAllowed&&event.sender===pet.webContents)) throw new Error(`拒绝外部窗口调用：${channel}`);
    try {return await fn(...args);} catch(error) {console.error(`桌面边界 ${channel}`,error);throw error;}
  });
}
function load(window,view) {
  const devURL=process.env.MY_LIFE_DEV_URL;
  if(devURL) return window.loadURL(`${devURL}/?view=${view}`);
  return window.loadFile(path.join(app.getAppPath(),'dist','index.html'),{query:{view}});
}
app.whenReady().then(async()=>{
  protocol.handle('petasset',request=>net.fetch(pathToFileURL(characters.resource(request.url)).href));
  const preload=path.join(__dirname,'../preload/preload.cjs');
  const work=screen.getPrimaryDisplay().workArea;
  const iconPath=path.join(app.getAppPath(),'assets',process.platform==='win32'&&fs.existsSync(path.join(app.getAppPath(),'assets','icon.ico'))?'icon.ico':'icon.png');
  const icon=nativeImage.createFromPath(iconPath);
  // 三栏行情和右侧人偶共用内容区，默认宽度为图表和盘口留出空间。
  panel=new BrowserWindow({icon:iconPath,width:Math.min(1560,work.width),height:Math.min(920,work.height),minWidth:Math.min(1080,work.width),minHeight:Math.min(660,work.height),useContentSize:true,frame:false,transparent:true,hasShadow:false,show:false,backgroundColor:'#00000000',title:'废话交易所',webPreferences:{preload,nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  pet=new BrowserWindow({...PET_SIZE,icon:iconPath,useContentSize:true,x:work.x+work.width-PET_SIZE.width-20,y:work.y+work.height-PET_SIZE.height-20,frame:false,transparent:true,backgroundColor:'#00000000',resizable:false,alwaysOnTop:true,skipTaskbar:true,hasShadow:false,webPreferences:{preload,nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  let petSize={...PET_SIZE};
  let bodySize={...PET_BODY_SIZE};
  let roamingEnabled=true;
  let idleTimer;
  const motion=startRoaming(pet,screen,()=>({size:petSize,body:bodySize}));
  const setRoaming=value=>motion.setEnabled(value);
  const renewPanelActivity=()=>{
    clearTimeout(idleTimer);
    idleTimer=setTimeout(()=>panel.hide(),120000);
  };
  showPanel=()=>{
    // 气泡在桌宠所在屏幕展开，位置限制在工作区内，避开任务栏。
    if(!panel.isVisible()) {
      const anchor=petBodyBounds(pet.getContentBounds(),petSize,bodySize);
      const area=screen.getDisplayMatching({x:Math.round(anchor.x),y:Math.round(anchor.y),width:anchor.width,height:anchor.height}).workArea;
      const size=panel.getContentBounds();
      const width=Math.min(size.width,area.width),height=Math.min(size.height,area.height);
      panel.setMinimumSize(Math.min(1080,area.width),Math.min(660,area.height));
      const dock=petBodyBounds({x:width-PET_DOCK_SIZE.width,y:height-PET_DOCK_SIZE.height},PET_DOCK_SIZE,bodySize);
      panel.setContentBounds({width,height,x:Math.round(Math.max(area.x,Math.min(anchor.x-dock.x,area.x+area.width-width))),y:Math.round(Math.max(area.y,Math.min(anchor.y-dock.y,area.y+area.height-height)))});
    }
    panel.show();
    panel.focus();
    renewPanelActivity();
  };
  // 展开时由气泡内的角色负责交互，避免桌面上出现两只宠物。
  panel.on('show',()=>{setRoaming(false);pet.hide();renewPanelActivity();});
  panel.on('hide',()=>{
    clearTimeout(idleTimer);
    const bounds=panel.getContentBounds();
    const dock=petBodyBounds({x:bounds.x+bounds.width-PET_DOCK_SIZE.width,y:bounds.y+bounds.height-PET_DOCK_SIZE.height},PET_DOCK_SIZE,bodySize);
    movePetBody(pet,dock.x,dock.y,petSize,bodySize);
    pet.showInactive();
    setRoaming(roamingEnabled);
  });
  // 原生拖动标题栏和调整大小也属于操作，不让气泡在拖动过程中超时。
  panel.on('move',renewPanelActivity);
  panel.on('resize',renewPanelActivity);
  for(const window of [panel,pet]) {
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',event=>event.preventDefault());
  }
  panel.on('close',event=>{event.preventDefault();panel.hide();});
  tray=new Tray(icon);tray.setToolTip('废话交易所 · 阿废营业中');
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:'打开交易工作台',click:()=>showPanel()},
    {label:'宠物置顶',type:'checkbox',checked:true,click:item=>pet.setAlwaysOnTop(item.checked)},
    {label:'自动活动',type:'checkbox',checked:true,click:item=>{roamingEnabled=item.checked;setRoaming(roamingEnabled&&!panel.isVisible());}},
    {label:'显示宠物',click:()=>{panel.hide();pet.showInactive();}},
    {label:'退出（服务器挂单仍有效）',click:()=>{clearTimeout(idleTimer);panel.removeAllListeners('close');app.quit();}},
  ]));
  tray.on('double-click',()=>showPanel());
  handle('bootstrap',()=>bootstrap(),true);
  handle('login',async input=>{
    const url=new URL(input.url);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password) throw new Error('请输入不含凭据的 HTTP 或 HTTPS 交易所地址');
    const credentials={username:input.username,password:input.password};
    if(input.register) {const registered=await request(url.origin,'','POST','/api/auth/register',credentials);if(!registered.ok) throw new Error(registered.body.error);}
    const result=await request(url.origin,'','POST','/api/auth/login',credentials);
    if(!result.ok) throw new Error(result.body.error);
    local.saveSession({url:url.origin,username:result.body.username,userId:result.body.userId,token:result.body.token});
    return bootstrap();
  });
  handle('logout',()=>local.logout());
  handle('request',(method,route,body)=>{const session=local.session();return request(session.url,session.token,method,route,body);});
  handle('profile:save',profile=>local.saveProfile(profile));
  handle('character:import',()=>characters.importCharacter());
  handle('character:save',character=>characters.saveCharacter(character));
  handle('visual:publish',value=>{visual=value;pet.webContents.send('visual',visual);});
  handle('panel:show',()=>showPanel(),true);
  handle('panel:hide',()=>panel.hide());
  handle('panel:activity',()=>renewPanelActivity());
  handle('pet:layout',({speechHeight,width,height})=>{
    // IPC 尺寸来自渲染页面，边界处拒绝无效数值，不把异常尺寸传给系统窗口。
    if(![speechHeight,width,height].every(Number.isFinite)||speechHeight<0||width<=0||height<=0) throw new Error('宠物尺寸必须为正有限数值，气泡高度不能为负');
    const anchor=petBodyBounds(pet.getContentBounds(),petSize,bodySize);
    bodySize={width:Math.ceil(width),height:Math.ceil(height)};
    petSize={width:speechHeight===0?bodySize.width+21:Math.max(PET_DOCK_SIZE.width,bodySize.width+21),height:bodySize.height+30+Math.ceil(speechHeight)};
    // 按人偶位置重新定位外框，气泡显隐不缩放人偶，也不改变拖拽或飞行的坐标。
    movePetBody(pet,anchor.x+(anchor.width-bodySize.width)/2,anchor.y+anchor.height-bodySize.height,petSize,bodySize);
  },true);
  handle('pet:drag',phase=>{
    // 使用 Electron 的屏幕坐标，保持鼠标与窗口在同一 DPI 坐标系。
    switch(phase) {
      case 'start': motion.startDrag();break;
      case 'move': motion.moveDrag();break;
      case 'end': motion.endDrag(true);break;
      case 'cancel': motion.endDrag(false);break;
      default:
        throw new Error('未知宠物拖动阶段');
    }
  },true);
  // 来源链接固定为上游项目，不向页面暴露任意外部地址打开能力。
  handle('vpet:source',()=>shell.openExternal('https://github.com/LorisYounger/VPet'),true);
  pet.webContents.on('did-finish-load',()=>pet.webContents.send('visual',visual));
  await Promise.all([load(panel,'panel'),load(pet,'pet')]);
  showPanel();
});
app.on('window-all-closed',()=>app.quit());
