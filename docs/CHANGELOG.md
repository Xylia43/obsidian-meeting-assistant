# 变更日志 | Changelog

本文档记录 Obsidian Meeting Assistant 插件的所有版本变更。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [语义化版本 (SemVer)](https://semver.org/lang/zh-CN/)。

---

## [0.1.0] - 2026-03-06

### 🎉 首次发布

Obsidian Meeting Assistant 插件的首个 MVP 版本，实现了核心的录音→转写→纪要全流程。

### 新增 (Added)

#### 核心功能

- **会议录音** — 在 Obsidian 内通过工具栏按钮或命令面板启动/暂停/停止录音
  - 支持 WebM (Opus) 音频格式
  - 支持暂停/恢复录音
  - 录音文件自动保存到 Vault 指定目录
  - 文件名自动生成：`meeting_YYYY-MM-DD_HHmmss.webm`
- **录音状态指示器** — 状态栏实时显示录音状态和已录时长
  - 🔴 录音中 / ⏸️ 已暂停 / 🎙️ 就绪
- **自动创建会议笔记** — 录音完成后自动生成包含元数据和录音链接的 Markdown 笔记模板

#### 服务集成

- **语音转文字 (STT)** — 集成 OpenAI Whisper API
  - 支持中文和英文转写
  - 自动分片上传（>25MB 音频文件自动拆分）
  - 带时间戳的分段转写结果
  - 基础说话人分离（启发式方法）
  - 指数退避重试机制
- **LLM 智能纪要** — 多 LLM 提供商支持
  - OpenAI (GPT-4o)：云端，综合能力最强
  - Anthropic Claude：云端，长文本理解优秀
  - Ollama：完全本地，零隐私风险
  - 结构化纪要输出（议题、决策、待办事项）
  - AI 行动建议生成（后续建议、风险提示、改进方向）

#### 设置面板

- 音频保存目录配置
- 笔记保存目录配置
- 音频比特率选择（64/128/192/256 kbps）
- 自动创建笔记开关

#### 命令

- `Meeting Assistant: 开始录音`
- `Meeting Assistant: 暂停/恢复录音`
- `Meeting Assistant: 停止录音并保存`
- `Meeting Assistant: 切换录音（开始/停止）`

#### 开发基础设施

- TypeScript 项目搭建
- esbuild 构建配置
- Vitest 测试框架集成
- 完整的类型定义系统
- Provider Pattern 架构（方便扩展 STT/LLM 服务）

### 技术细节

- **Obsidian 兼容性：** ≥ 1.4.0 (Desktop Only)
- **音频格式：** WebM/Opus
- **默认比特率：** 128 kbps
- **STT 服务：** OpenAI Whisper API
- **LLM 服务：** OpenAI / Claude / Ollama
- **构建工具：** esbuild
- **语言：** TypeScript (strict mode)

### 已知限制

- 仅支持桌面端，移动端暂不支持
- STT 仅支持 OpenAI Whisper API（尚未支持本地 Whisper）
- 设置面板尚未包含 STT/LLM 的 API Key 配置 UI（需通过代码配置）
- 说话人分离基于启发式方法，准确率有限
- 不支持实时转写（录音后批量处理）

---

## 路线图 (Roadmap)

### v0.2.0 (计划中)

- [ ] 设置面板完整的 STT/LLM 配置 UI
- [ ] API Key 连接测试按钮
- [ ] 会议纪要模板自定义
- [ ] 录音-笔记双向链接优化

### v0.3.0 (计划中)

- [ ] 本地 Whisper 支持 (whisper.cpp / faster-whisper)
- [ ] 待办事项与 Tasks 插件联动
- [ ] 历史会议检索面板
- [ ] 导出为 PDF / 纯文本

### v1.0.0 (远期目标)

- [ ] 移动端支持 (iOS / Android)
- [ ] 实时流式转写
- [ ] 说话人识别 (Diarization)
- [ ] 自定义 LLM Prompt 编辑器

---

*本文件随每次版本发布更新。*
