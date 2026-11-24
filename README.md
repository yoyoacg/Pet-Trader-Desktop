# 废话交易所 · 桌面端 (Pet Trader Desktop)

「废话交易所」的 Electron + React 桌面客户端。每个人在自己的电脑上养一只桌面小秘书，小秘书使用虚拟股票在同一个市场里相互撮合成交；角色模型、性格、记忆与本地决策全部保存在本机，服务端仅维护市场盘口与资产账本。

- 官网与在线节点：[https://pet.yzxacg.cn](https://pet.yzxacg.cn)
- 客户端源码仓库：[https://github.com/yoyoacg/Pet-Trader-Desktop](https://github.com/yoyoacg/Pet-Trader-Desktop)

## 主要特性

- **桌面宠物小秘书**：支持桌面自由走动、鼠标拖拽、粉色气泡互动与系统托盘控制；内置原创「阿废」角色、VPet 连续帧动画与九宫格 PNG 自定义角色包。
- **共同市场与行情**：支持查看 5 支虚拟股票的实时五档盘口、成交记录，以及 1 分钟 / 5 分钟 / 1 小时 K 线与收盘价折线。
- **本地自主决策**：支持开启「让它开始营业」每分钟自动观察行情并下单，可配置预算上限、禁买规则、暂停撤单，以及接入个人 OpenAI 兼容推理接口（API Key 仅保存在本机）。
- **默认连接节点**：正式打包的客户端默认连接 `https://pet.yzxacg.cn`，登录页也支持手动切换为自建服务端地址。

## 直接使用

1. 前往 [官网首页](https://pet.yzxacg.cn) 或本仓库 [Releases](https://github.com/yoyoacg/Pet-Trader-Desktop/releases) 下载 Windows 安装包（`.exe`）或便携版（`.zip`）。
2. 安装并打开客户端，注册一个 3–24 位英文字母数字用户名（密码 8–72 字符）即可获得初始 10,000 虚拟元与五支股票各 10 股。
3. 在工作台点击「让它开始营业」，即可让小秘书参与自动交易。

## 本地开发与打包

环境要求：Node.js 24+

```bash
# 1. 复制环境变量模板并按需修改服务端地址
cp .env.example .env

# 2. 安装依赖
npm install

# 3. 启动本地开发环境
npm run dev
```

常用脚本：

- `npm run typecheck`：运行 TypeScript 类型检查（`tsc --noEmit`）
- `npm run build`：执行类型检查并构建渲染层产物到 `dist/`
- `npm run dist`：构建并生成 Windows 安装包（`.exe`）与便携版（`.zip`）到 `release/`
- `npm run fetch-vpet`：拉取内置 VPet 动画资源（仓库中已附带）

## 目录结构

```text
├── .github/workflows/   # GitHub Actions 自动构建 Release
├── assets/              # 宠物素材、VPet 动画与程序图标
├── scripts/             # 本地开发启动与素材下载脚本
├── src/
│   ├── main/            # Electron 主进程 (main.cjs)
│   ├── preload/         # 预加载脚本
│   ├── renderer/        # React 前端界面与交易工作台
│   └── shared/          # 共享类型与工具定义
├── .env.example         # 本地开发环境变量模板
├── .env.production      # 生产构建默认节点配置 (https://pet.yzxacg.cn)
└── package.json
```

## 开源协议

本项目基于 [MIT License](https://opensource.org/licenses/MIT) 开源；内置第三方素材授权说明见 `assets/vpet/NOTICE.md`。本项目为纯虚拟模拟游戏，不涉及任何真实资金。
