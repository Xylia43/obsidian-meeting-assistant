# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-12

### 🎉 首次发布 / Initial Release

这是 Obsidian Meeting Assistant 的首个公开版本！

#### ✨ 新增功能 / Added

- **录音功能**
  - 一键开始/暂停/停止录音
  - 工具栏图标快速访问
  - 命令面板完整控制
  - 状态栏实时显示录音时长
  - 支持 WebM 格式（Opus 编码）
  - 可配置音频比特率（64/128/192/256 kbps）

- **语音转文字 (STT)**
  - 集成 OpenAI Whisper API
  - 支持中英文高精度转写
  - 自动生成带时间戳的转写文本
  - 自动重试机制（网络容错）

- **AI 智能纪要**
  - 支持 OpenAI GPT-4o
  - 支持 Anthropic Claude Sonnet 4
  - 支持 Ollama 本地模型
  - 自动生成结构化会议纪要（议题、决策、待办）
  - AI 行动建议生成

- **文件管理**
  - 自动保存录音文件到指定目录
  - 自动创建会议笔记
  - 笔记中嵌入录音文件链接
  - 支持自定义目录结构

- **用户体验**
  - 完整的设置面板
  - 友好的错误提示
  - 进度通知
  - 中英双语界面

#### 🔧 技术特性 / Technical

- TypeScript 编写，类型安全
- 模块化架构设计
- 完整的单元测试覆盖
- ESLint + Prettier 代码规范
- 支持 Obsidian 1.4.0+

#### 📚 文档 / Documentation

- 完整的 README（中英双语）
- 详细的安装指南
- API 文档
- 产品需求文档 (PRD)

---

## [Unreleased]

### 计划中的功能 / Planned Features

- 本地 Whisper 支持（whisper.cpp / faster-whisper）
- 移动端支持（iOS / Android）
- 实时转写（边录边转）
- 多语言支持扩展
- 会议模板系统
- 说话人识别
- 关键词提取
- 会议摘要导出（PDF / Markdown）

---

[0.1.0]: https://github.com/Xylia43/obsidian-meeting-assistant/releases/tag/v0.1.0
