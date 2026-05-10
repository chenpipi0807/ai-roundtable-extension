# 🎵 天音 AI 创作助手

网易云天音 AI 写歌页面的浏览器创作助手插件。以 **AI 协创 + Diff 审核** 模式辅助歌词、歌曲想法和歌曲名称的创作。

## 功能特性

### 🎯 核心功能
- **内联快捷按钮**：在每个输入框旁注入「✨ 润色」「🔄 重写」「💡 续写」「📝 生成」按钮，一键触发 AI 辅助
- **Split Diff 审核**：AI 建议以左右分栏对比展示，逐行/逐段接受或拒绝，像代码审核一样精细控制
- **侧边栏聊天面板**：支持多轮对话，可定向应用到任意输入框
- **选中文本快捷操作**：在输入框中选中文字后，浮动工具栏出现，支持局部润色/改写/扩展

### 🔧 技术特性
- **DeepSeek API 集成**：支持 deepseek-v4-flash / deepseek-v4-pro 模型，用户自行填写 API Key
- **Shadow DOM 隔离**：所有注入 UI 使用 Shadow DOM，不影响页面原有样式
- **Service Worker 代理**：API 请求通过 Service Worker 转发，避免 CORS 问题
- **LCS Diff 引擎**：基于最长公共子序列的行级差异算法

## 安装

### 前置条件
1. 在 [DeepSeek 开放平台](https://platform.deepseek.com/) 注册并获取 API Key

### 加载插件
1. 打开 Chrome 浏览器，进入 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本项目 `tianyin-copilot` 目录

### 使用
1. 打开 [天音 AI 写歌页面](https://music.163.com/st/tianyin/song-generate-advance)
2. 页面右侧自动显示「天音助手」侧边栏
3. 首次使用，侧边栏会自动展开设置面板，填入 DeepSeek API Key 并保存
4. 点击输入框旁的「✨ 润色」「🔄 重写」等快捷按钮，或直接在侧边栏聊天面板输入需求
5. AI 建议以 Split Diff 左右分栏展示，逐段接受/拒绝后应用到页面
6. 如需收起侧边栏，点击右上角 ✕ 按钮；收起后右侧显示绿色窄条，点击可重新展开

## 项目结构

```
tianyin-copilot/
├── manifest.json              # Chrome Extension v3 配置
├── background/
│   └── service-worker.js      # 消息路由、API 代理
├── content/
│   ├── injector.js            # DOM 注入、元素监听
│   ├── inline-actions.js      # 选中文本快捷操作
│   └── sidebar-host.js        # 侧边栏宿主（Shadow DOM）
├── sidebar/
│   ├── index.html             # 侧边栏 UI 入口
│   ├── app.js                 # 侧边栏主逻辑
│   └── styles/
│       └── sidebar.css        # 侧边栏样式
├── core/
│   ├── diff.js                # LCS 行级 Diff 引擎
│   ├── deepseek-client.js     # DeepSeek API 客户端
│   └── prompt-templates.js    # Prompt 模板
├── shared/
│   ├── constants.js           # 常量定义
│   └── utils.js               # 工具函数
└── assets/
    └── icons/                 # 插件图标
```

## 技术栈

- **Manifest**: Chrome Extension Manifest V3
- **UI**: 原生 JavaScript + CSS（无框架依赖，保持最小体积）
- **Diff 算法**: LCS（最长公共子序列）行级对比
- **API**: DeepSeek API（兼容 OpenAI 格式）
- **存储**: chrome.storage.local
- **通信**: postMessage + CustomEvent

## 隐私说明

- API Key 仅存储在浏览器本地，不上传到任何服务器
- 所有 AI 请求通过 Service Worker 代理，不暴露 Key 给页面
- 仅收集页面创作相关内容，不收集用户个人信息
