# Obsidian Meeting Assistant

[English](#english) | [中文](#中文)

---

<a id="中文"></a>

## 🎙️ Obsidian 会议助手

> **开完会即出纪要** — 在 Obsidian 中完成「会议录音 → 语音转文字 → 智能纪要 → AI 行动建议」的全流程闭环。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-%3E%3D1.4.0-blueviolet)](https://obsidian.md)
[![Version](https://img.shields.io/badge/version-0.1.0-green)]()

<!-- 截图占位符 -->
<!-- ![插件主界面](docs/assets/screenshot-main.png) -->
<!-- ![录音状态栏](docs/assets/screenshot-statusbar.png) -->
<!-- ![会议纪要示例](docs/assets/screenshot-summary.png) -->
<!-- ![设置面板](docs/assets/screenshot-settings.png) -->

### ✨ 功能亮点

- 🎙️ **一键录音** — 工具栏按钮或命令面板启动/暂停/停止录音，无需离开 Obsidian
- 🗣️ **语音转文字 (STT)** — 支持 OpenAI Whisper API，自动将音频转为带时间戳的文本
- 📝 **AI 智能纪要** — 一键生成结构化会议纪要（议题、决策、待办事项）
- 💡 **AI 行动建议** — 自动生成后续行动建议、风险提示、改进方向
- 📂 **自动管理文件** — 录音和笔记自动保存到 Vault 指定目录，支持双向链接
- 🔒 **本地优先** — 所有数据存储在本地 Vault，隐私可控
- 🌐 **多 LLM 支持** — OpenAI GPT / Anthropic Claude / Ollama 本地模型
- 🇨🇳 **中英双语** — 优先支持中文和英文语音转写

### 📦 安装

#### 方式一：手动安装

1. 前往 [Releases](https://github.com/your-repo/obsidian-meeting-assistant/releases) 页面下载最新版本的 `main.js`、`manifest.json`
2. 在你的 Vault 目录下找到 `.obsidian/plugins/` 文件夹（如果没有则创建）
3. 创建 `obsidian-meeting-assistant` 文件夹
4. 将 `main.js` 和 `manifest.json` 复制到该文件夹中
5. 重启 Obsidian → 设置 → 第三方插件 → 启用 "Meeting Assistant"

```
你的Vault/
└── .obsidian/
    └── plugins/
        └── obsidian-meeting-assistant/
            ├── main.js
            └── manifest.json
```

#### 方式二：通过 BRAT 安装

1. 安装 [BRAT 插件](https://github.com/TfTHacker/obsidian42-brat)
2. 打开 BRAT 设置 → 点击 "Add Beta plugin"
3. 输入仓库地址：`your-username/obsidian-meeting-assistant`
4. 点击 "Add Plugin" 并启用

> 📖 更详细的安装说明请参阅 [docs/INSTALL.md](docs/INSTALL.md)

### 🚀 快速开始

#### 1. 配置 API 服务

首次使用前，你需要在插件设置中配置 STT（语音转文字）和 LLM（大语言模型）服务：

**STT 服务（语音转文字）：**

| 服务 | 说明 | 是否需要 API Key |
|------|------|-----------------|
| OpenAI Whisper API | 云端转写，准确率高，支持中英文 | ✅ 需要 OpenAI API Key |

**LLM 服务（纪要生成）：**

| 服务 | 说明 | 是否需要 API Key |
|------|------|-----------------|
| OpenAI (GPT-4o) | 云端，效果最佳 | ✅ 需要 OpenAI API Key |
| Anthropic Claude | 云端，理解力强 | ✅ 需要 Anthropic API Key |
| Ollama | 完全本地，隐私优先 | ❌ 无需 API Key |

#### 2. 开始录音

有三种方式启动录音：

- **工具栏图标**：点击左侧工具栏的 🎙️ 麦克风图标
- **命令面板**：`Ctrl/Cmd + P` → 搜索 "Meeting Assistant: 开始录音"
- **快捷键**：在设置中自定义快捷键

#### 3. 录音操作

| 操作 | 命令 | 说明 |
|------|------|------|
| 开始录音 | `Meeting Assistant: 开始录音` | 启动麦克风录音 |
| 暂停/恢复 | `Meeting Assistant: 暂停/恢复录音` | 暂停不采集音频，恢复继续录音 |
| 停止并保存 | `Meeting Assistant: 停止录音并保存` | 结束录音，保存文件并自动创建笔记 |
| 切换录音 | `Meeting Assistant: 切换录音（开始/停止）` | 空闲时开始，录音中则停止 |

#### 4. 查看结果

录音停止后：
- 音频文件自动保存到 `meeting-recordings/` 目录（可配置）
- 自动创建会议笔记到 `meeting-notes/` 目录（可配置）
- 笔记中包含录音文件的嵌入链接，支持直接播放

### ⚙️ 配置说明

在 Obsidian 设置 → 第三方插件 → Meeting Assistant 中配置：

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| 音频保存目录 | `meeting-recordings` | 录音文件保存到 Vault 中的子目录 |
| 笔记保存目录 | `meeting-notes` | 会议笔记保存到 Vault 中的子目录 |
| 音频比特率 | `128 kbps`（标准） | 录音音质，支持 64/128/192/256 kbps |
| 自动创建笔记 | `开启` | 录音完成后是否自动创建会议笔记 |

**音频比特率参考：**

| 比特率 | 音质 | 1小时文件大小（约） |
|--------|------|-------------------|
| 64 kbps | 低质量（语音足够） | ~29 MB |
| 128 kbps | 标准（推荐） | ~58 MB |
| 192 kbps | 高质量 | ~86 MB |
| 256 kbps | 最高质量 | ~115 MB |

### 🔌 支持的服务

#### STT（语音转文字）服务

| 服务 | 提供商 | 特点 |
|------|--------|------|
| Whisper API | OpenAI | 云端转写，支持 98+ 种语言，中英文效果优秀 |

> 📌 计划支持：本地 Whisper (whisper.cpp / faster-whisper)

#### LLM（大语言模型）服务

| 服务 | 提供商 | 默认模型 | 特点 |
|------|--------|---------|------|
| OpenAI | OpenAI | `gpt-4o` | 综合能力最强，纪要质量高 |
| Claude | Anthropic | `claude-sonnet-4-20250514` | 长文本理解力优秀，中文友好 |
| Ollama | 本地 | `llama3` | 完全本地运行，零隐私风险 |

### ❓ 常见问题 (FAQ)

<details>
<summary><b>Q: 插件需要什么系统权限？</b></summary>

插件需要麦克风权限来进行录音。首次录音时浏览器/系统会弹出权限请求，请允许。

</details>

<details>
<summary><b>Q: 录音文件是什么格式？</b></summary>

默认使用 WebM 格式（Opus 编码），这是浏览器原生支持的高效音频格式。文件名格式为 `meeting_YYYY-MM-DD_HHmmss.webm`。

</details>

<details>
<summary><b>Q: 我的数据安全吗？会上传到云端吗？</b></summary>

- 录音文件和会议笔记始终保存在你的本地 Vault 中
- 使用 STT（语音转文字）时，音频数据会发送到所选的 API 服务（如 OpenAI Whisper）
- 使用 LLM 生成纪要时，转写文本会发送到所选的 LLM 服务
- 如果使用 Ollama，所有处理完全在本地完成
- 插件不收集任何用户行为数据，不上传使用统计

</details>

<details>
<summary><b>Q: 支持移动端吗？</b></summary>

当前版本仅支持桌面端（macOS / Windows / Linux）。移动端支持计划在后续版本中加入。

</details>

<details>
<summary><b>Q: 最长可以录多久？</b></summary>

理论上支持连续录音 4 小时以上。1 小时的录音文件在 128kbps 下约 58MB。

</details>

<details>
<summary><b>Q: 可以使用自定义的 API 端点吗？</b></summary>

可以。STT 和 LLM 服务都支持配置自定义 Base URL，兼容 OpenAI 兼容的代理服务。

</details>

<details>
<summary><b>Q: 转写的准确率如何？</b></summary>

使用 OpenAI Whisper API：
- 中文（标准普通话、安静环境）：≥ 90%
- 英文（标准口音、安静环境）：≥ 93%
- 实际准确率受环境噪音、口音、说话速度等因素影响

</details>

<details>
<summary><b>Q: API 调用失败怎么办？</b></summary>

- 插件内置了自动重试机制（指数退避），网络波动时会自动重试
- 如果持续失败，请检查 API Key 是否正确、网络连接是否正常
- 错误提示会在 Obsidian 通知中显示

</details>

<details>
<summary><b>Q: 与其他插件有冲突吗？</b></summary>

Meeting Assistant 设计上与主流插件兼容，包括 Templater、Dataview、Tasks、Calendar 等。如遇问题请提 Issue。

</details>

### 🛠️ 开发者指南

#### 环境要求

- Node.js ≥ 18
- npm ≥ 9

#### 本地开发

```bash
# 克隆仓库
git clone https://github.com/your-repo/obsidian-meeting-assistant.git
cd obsidian-meeting-assistant

# 安装依赖
npm install

# 开发模式（自动监听文件变化）
npm run dev

# 生产构建
npm run build

# 运行测试
npm test
```

#### 项目结构

```
obsidian-meeting-assistant/
├── src/
│   ├── main.ts                  # 插件入口，注册命令/图标/设置
│   ├── core/
│   │   ├── audio-recorder.ts    # 核心录音模块（MediaRecorder API）
│   │   └── file-manager.ts      # 音频/笔记文件管理
│   ├── services/
│   │   ├── stt-service.ts       # STT 服务抽象层（Whisper API）
│   │   ├── llm-service.ts       # LLM 服务抽象层（OpenAI/Claude/Ollama）
│   │   └── summary-generator.ts # 会议纪要生成器
│   └── types/
│       ├── index.ts             # 核心类型定义
│       └── services.ts          # 服务层类型定义
├── docs/
│   ├── prd/PRD.md               # 产品需求文档
│   ├── INSTALL.md               # 详细安装指南
│   ├── API.md                   # 内部 API 文档
│   └── CHANGELOG.md             # 变更日志
├── manifest.json                # Obsidian 插件清单
├── package.json                 # npm 配置
├── tsconfig.json                # TypeScript 配置
└── esbuild.config.mjs           # 构建配置
```

#### 构建产物

运行 `npm run build` 后会在项目根目录生成 `main.js`，这是 Obsidian 加载的插件入口文件。

#### 参与贡献

1. Fork 本仓库
2. 创建你的特性分支：`git checkout -b feature/amazing-feature`
3. 提交你的更改：`git commit -m 'feat: add amazing feature'`
4. 推送到分支：`git push origin feature/amazing-feature`
5. 提交 Pull Request

**提交规范：** 请遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范。

> 📖 更多 API 细节请参阅 [docs/API.md](docs/API.md)

### 📄 License

本项目采用 [MIT License](LICENSE) 开源协议。

---

<a id="english"></a>

## 🎙️ Obsidian Meeting Assistant (English)

> **Meeting notes, instantly** — Record, transcribe, and generate intelligent meeting summaries with AI-powered action items — all within Obsidian.

### ✨ Features

- 🎙️ **One-click recording** — Start/pause/stop recording from the toolbar or command palette
- 🗣️ **Speech-to-Text (STT)** — Powered by OpenAI Whisper API with timestamped transcriptions
- 📝 **AI-powered summaries** — Generate structured meeting minutes (agendas, decisions, action items)
- 💡 **AI action suggestions** — Get follow-up recommendations, risk alerts, and improvement ideas
- 📂 **Auto file management** — Recordings and notes saved to configurable Vault directories
- 🔒 **Local-first** — All data stored in your local Vault; you control your privacy
- 🌐 **Multiple LLM support** — OpenAI GPT / Anthropic Claude / Ollama (local)
- 🇨🇳🇬🇧 **Bilingual** — Optimized for Chinese and English speech recognition

### 📦 Installation

#### Manual Installation

1. Download `main.js` and `manifest.json` from the [Releases](https://github.com/your-repo/obsidian-meeting-assistant/releases) page
2. Create folder `your-vault/.obsidian/plugins/obsidian-meeting-assistant/`
3. Copy the downloaded files into that folder
4. Restart Obsidian → Settings → Community plugins → Enable "Meeting Assistant"

#### Via BRAT

1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat)
2. Open BRAT settings → "Add Beta plugin"
3. Enter repository: `your-username/obsidian-meeting-assistant`
4. Click "Add Plugin" and enable it

### 🚀 Quick Start

1. **Configure API keys** in plugin settings (STT + LLM services)
2. **Click the 🎙️ icon** in the toolbar to start recording
3. **Click again** to stop — your recording is saved and a meeting note is created automatically
4. Use the command palette to generate AI summaries and action suggestions

### ⚙️ Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Audio folder | `meeting-recordings` | Directory for audio files in your Vault |
| Notes folder | `meeting-notes` | Directory for meeting notes in your Vault |
| Audio bitrate | `128 kbps` | Recording quality (64/128/192/256 kbps) |
| Auto-create note | `On` | Automatically create a meeting note after recording |

### 🔌 Supported Services

**STT:**
| Service | Provider | Notes |
|---------|----------|-------|
| Whisper API | OpenAI | Cloud-based, 98+ languages, excellent for Chinese & English |

**LLM:**
| Service | Provider | Default Model | Notes |
|---------|----------|---------------|-------|
| OpenAI | OpenAI | `gpt-4o` | Best overall quality |
| Claude | Anthropic | `claude-sonnet-4-20250514` | Great with long context and Chinese |
| Ollama | Local | `llama3` | Fully local, zero privacy risk |

### 🛠️ Development

```bash
git clone https://github.com/your-repo/obsidian-meeting-assistant.git
cd obsidian-meeting-assistant
npm install
npm run dev    # Development mode (watch)
npm run build  # Production build
npm test       # Run tests
```

### 📄 License

[MIT License](LICENSE)

---

*Made with ❤️ for the Obsidian community*
