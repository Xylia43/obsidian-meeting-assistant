# API 文档 | Internal API Reference

本文档面向想要二次开发或理解插件内部架构的开发者。

## 目录

- [架构概览](#架构概览)
- [核心模块 (Core)](#核心模块-core)
  - [AudioRecorder](#audiorecorder)
  - [FileManager](#filemanager)
- [服务层 (Services)](#服务层-services)
  - [STT Service](#stt-service)
  - [LLM Service](#llm-service)
  - [SummaryGenerator](#summarygenerator)
- [类型定义 (Types)](#类型定义-types)
  - [核心类型](#核心类型)
  - [服务层类型](#服务层类型)
- [错误处理](#错误处理)
- [插件入口](#插件入口)
- [扩展开发指南](#扩展开发指南)

---

## 架构概览

```
┌─────────────────────────────────────────────────────┐
│                    main.ts                          │
│              (MeetingAssistantPlugin)                │
│         注册命令 / Ribbon / 设置面板 / 状态栏         │
└───────────┬─────────────────┬───────────────────────┘
            │                 │
            ▼                 ▼
┌───────────────────┐  ┌──────────────────┐
│    core/          │  │   services/      │
│  AudioRecorder    │  │  STTService      │
│  FileManager      │  │  LLMService      │
│                   │  │  SummaryGenerator │
└───────────────────┘  └──────────────────┘
            │                 │
            ▼                 ▼
┌─────────────────────────────────────────────────────┐
│                   types/                            │
│        index.ts  (核心类型)                          │
│        services.ts  (服务层类型)                      │
└─────────────────────────────────────────────────────┘
```

**设计原则：**
- **Provider Pattern** — STT 和 LLM 服务通过接口抽象，新增 Provider 只需实现接口
- **工厂函数** — `createSTTProvider()` / `createLLMProvider()` 根据配置创建对应实例
- **关注点分离** — 录音 (core) 和智能处理 (services) 完全解耦
- **使用 Obsidian 原生 API** — `requestUrl`、`vault.create` 等，确保跨平台兼容

---

## 核心模块 (Core)

### AudioRecorder

**文件：** `src/core/audio-recorder.ts`

基于 Web MediaRecorder API 的录音模块，支持 WebM(Opus) 格式。

#### 构造函数

```typescript
constructor(options?: AudioRecorderOptions, callbacks?: RecorderEventCallbacks)
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `options.mimeType` | `string` | 音频 MIME 类型，默认 `audio/webm;codecs=opus`。不支持时自动回退到 `audio/webm` |
| `options.audioBitsPerSecond` | `number` | 音频比特率（bps），默认 `128000` |
| `options.timeslice` | `number` | 数据块采集间隔（毫秒），默认 `1000` |
| `callbacks.onStateChange` | `(state: RecordingState) => void` | 录音状态变化回调 |
| `callbacks.onElapsedChange` | `(elapsed: number) => void` | 录音时长更新回调（每秒触发） |
| `callbacks.onError` | `(error: Error) => void` | 错误回调 |
| `callbacks.onDataAvailable` | `(data: Blob) => void` | 收到音频数据块回调 |

#### 公共方法

##### `startRecording(): Promise<void>`

请求麦克风权限并启动录音。

- **前置条件：** 状态必须为 `IDLE`
- **行为：** 请求麦克风权限 → 创建 MediaRecorder → 开始采集音频
- **异常：** 非 IDLE 状态调用抛出 `Error`；麦克风权限被拒绝抛出 `Error`

##### `pauseRecording(): void`

暂停录音，暂停期间不采集音频。

- **前置条件：** 状态必须为 `RECORDING`
- **行为：** 暂停 MediaRecorder，累计已录时长

##### `resumeRecording(): void`

恢复已暂停的录音。

- **前置条件：** 状态必须为 `PAUSED`

##### `stopRecording(): Promise<RecordingResult>`

停止录音并返回录音结果。

- **前置条件：** 状态必须为 `RECORDING` 或 `PAUSED`
- **返回值：** `RecordingResult` 包含音频 Blob、时长、MIME 类型、开始/结束时间
- **行为：** 停止录音 → 合并音频块 → 释放媒体流 → 返回结果

##### `getRecordingState(): RecordingStatus`

获取当前录音状态信息。

- **返回值：** 包含 `state`、`elapsed`（毫秒）、`startedAt`

##### `destroy(): void`

销毁录音器，强制停止并释放所有资源（MediaStream track、定时器等）。

#### 状态机

```
IDLE ──startRecording()──→ RECORDING
                              │
                    pauseRecording()
                              │
                              ▼
                           PAUSED
                              │
                    resumeRecording()
                              │
                              ▼
                          RECORDING
                              │
                    stopRecording()
                              │
                              ▼
                          STOPPING ──→ IDLE
```

---

### FileManager

**文件：** `src/core/file-manager.ts`

音频文件和会议笔记的 Vault 文件系统管理器。

#### 构造函数

```typescript
constructor(app: App, options?: FileManagerOptions)
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `app` | `App` | — | Obsidian App 实例 |
| `options.audioFolder` | `string` | `meeting-recordings` | 音频保存子目录 |
| `options.notesFolder` | `string` | `meeting-notes` | 笔记保存子目录 |
| `options.dateFormat` | `string` | `YYYY-MM-DD_HHmmss` | 文件名日期格式 |

#### 公共方法

##### `saveRecording(result: RecordingResult, customName?: string): Promise<SaveAudioResult>`

将录音结果保存到 Vault。

- **参数：** 
  - `result` — `RecordingResult`（来自 AudioRecorder.stopRecording()）
  - `customName` — 自定义文件名（不含扩展名），留空自动生成
- **返回值：** `SaveAudioResult`，包含 `filePath` 和 `size`
- **行为：** 自动创建目录 → Blob 转 ArrayBuffer → vault.createBinary 保存

**文件名格式：** `meeting_YYYY-MM-DD_HHmmss.webm`

##### `createMeetingNote(title: string, audioPath: string, duration: number): Promise<string>`

创建 Markdown 格式的会议笔记文件。

- **参数：**
  - `title` — 笔记标题
  - `audioPath` — 关联的音频文件 Vault 路径
  - `duration` — 录音时长（毫秒）
- **返回值：** 创建的笔记文件 Vault 路径
- **行为：** 生成包含 YAML frontmatter、会议信息表格、录音嵌入链接的模板笔记

**生成的笔记模板结构：**
```markdown
---
title: "会议标题"
date: 2026-03-06T01:21:00.000Z
type: meeting-note
tags:
  - meeting
  - recording
---
# 会议标题
## 会议信息
（日期、时长、录音嵌入）
## 参会人员
## 会议摘要
## 要点记录
## 行动项
## 备注
```

##### `getAudioFolder(): string`

返回当前配置的音频保存目录路径。

##### `getNotesFolder(): string`

返回当前配置的笔记保存目录路径。

##### `updateOptions(options: Partial<FileManagerOptions>): void`

运行时更新配置，设置变更时调用。

---

## 服务层 (Services)

### STT Service

**文件：** `src/services/stt-service.ts`

语音转文字服务抽象层。

#### STTProvider 接口

```typescript
interface STTProvider {
  readonly name: string;
  transcribe(options: STTRequestOptions, onProgress?: STTProgressCallback): Promise<TranscriptionResult>;
  validateConfig(): Promise<boolean>;
}
```

所有 STT 提供商必须实现此接口。

#### WhisperAPIProvider

OpenAI Whisper API 的实现。

**特性：**
- 自动分片上传：音频 > 25MB 时自动拆分，逐片转写后合并
- 指数退避重试：网络失败时自动重试（最多 3 次）
- 基础说话人分离：基于静默间隔启发式分配 Speaker 标签
- 支持自定义 Base URL（兼容代理服务）

**构造函数：**

```typescript
constructor(config: STTServiceConfig)
```

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `provider` | `'whisper'` | — | 必须为 `'whisper'` |
| `apiKey` | `string` | — | **必填**，OpenAI API Key |
| `baseUrl` | `string` | `https://api.openai.com/v1` | API 端点 |
| `defaultLanguage` | `string` | 自动检测 | 默认语言代码，如 `'zh'`、`'en'` |
| `enableDiarization` | `boolean` | `false` | 是否启用说话人分离（启发式） |
| `maxChunkSize` | `number` | `25 * 1024 * 1024` | 单片最大字节数 |
| `maxRetries` | `number` | `3` | 最大重试次数 |
| `retryDelayMs` | `number` | `500` | 重试基础延迟（毫秒） |

**转写请求选项 (`STTRequestOptions`)：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `audioData` | `ArrayBuffer` | 音频文件数据 |
| `fileName` | `string` | 文件名（含扩展名，用于 MIME 推断） |
| `language` | `string?` | 语言代码，留空自动检测 |
| `enableDiarization` | `boolean?` | 是否启用说话人分离 |
| `speakerCount` | `number?` | 说话人数量提示 |
| `responseFormat` | `string?` | 输出格式（默认 verbose_json） |
| `temperature` | `number?` | 温度参数 (0-1) |
| `prompt` | `string?` | 初始提示 |

**转写结果 (`TranscriptionResult`)：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `text` | `string` | 完整转写文本 |
| `segments` | `TranscriptSegment[]` | 分段信息（含时间戳、文本、说话人等） |
| `language` | `string` | 检测到的语言 |
| `duration` | `number` | 音频总时长（秒） |
| `speakers` | `string[]?` | 识别到的说话人列表 |

#### 工厂函数

```typescript
function createSTTProvider(config: STTServiceConfig): STTProvider
```

根据 `config.provider` 创建对应的 STT 提供商实例。当前支持 `'whisper'`。

---

### LLM Service

**文件：** `src/services/llm-service.ts`

LLM 服务抽象层，支持多种提供商。

#### LLMProvider 接口

```typescript
interface LLMProvider {
  readonly name: string;
  chatCompletion(options: LLMRequestOptions): Promise<LLMResponse>;
  validateConfig(): Promise<boolean>;
}
```

#### 已实现的 Provider

##### OpenAIProvider

- **默认模型：** `gpt-4o`
- **默认温度：** `0.3`
- **Base URL：** `https://api.openai.com/v1`
- **认证方式：** `Authorization: Bearer <apiKey>`

##### ClaudeProvider

- **默认模型：** `claude-sonnet-4-20250514`
- **默认温度：** `0.3`
- **Base URL：** `https://api.anthropic.com/v1`
- **认证方式：** `x-api-key: <apiKey>` + `anthropic-version: 2023-06-01`
- **注意：** Claude Messages API 中 `system` 为顶层参数，非 messages 数组成员

##### OllamaProvider

- **默认模型：** `llama3`
- **默认温度：** `0.3`
- **Base URL：** `http://localhost:11434`
- **认证方式：** 无需 API Key
- **API 端点：** `/api/chat`

#### LLM 配置 (`LLMServiceConfig`)

| 字段 | 类型 | 说明 |
|------|------|------|
| `provider` | `'openai' \| 'claude' \| 'ollama'` | 提供商标识 |
| `apiKey` | `string?` | API Key（Ollama 不需要） |
| `baseUrl` | `string?` | 自定义 API 端点 |
| `model` | `string` | 模型名称 |
| `temperature` | `number?` | 温度 (0-2) |
| `maxTokens` | `number?` | 最大输出 token 数 |

#### LLM 请求选项 (`LLMRequestOptions`)

| 字段 | 类型 | 说明 |
|------|------|------|
| `messages` | `LLMMessage[]` | 消息列表（system/user/assistant） |
| `model` | `string?` | 覆盖默认模型 |
| `temperature` | `number?` | 温度 (0-2) |
| `maxTokens` | `number?` | 最大输出 token |
| `topP` | `number?` | Top-p 采样 |
| `stop` | `string[]?` | 停止序列 |

#### LLM 响应 (`LLMResponse`)

| 字段 | 类型 | 说明 |
|------|------|------|
| `content` | `string` | 生成的文本 |
| `model` | `string` | 使用的模型 |
| `usage` | `LLMTokenUsage?` | Token 用量统计 |
| `finishReason` | `string?` | 完成原因：`stop` / `length` / `content_filter` / `error` |

#### 工厂函数

```typescript
function createLLMProvider(config: LLMServiceConfig): LLMProvider
```

根据 `config.provider` 创建对应的 LLM 提供商实例。

#### 便捷函数

```typescript
// 生成会议纪要
async function generateSummary(
  provider: LLMProvider,
  systemPrompt: string,
  transcription: string,
  options?: Partial<LLMRequestOptions>
): Promise<LLMResponse>

// 生成会议建议
async function generateAdvice(
  provider: LLMProvider,
  systemPrompt: string,
  summaryText: string,
  options?: Partial<LLMRequestOptions>
): Promise<LLMResponse>
```

---

### SummaryGenerator

**文件：** `src/services/summary-generator.ts`

会议纪要生成器，将转写文本转化为结构化 Markdown 纪要。

#### 构造函数

```typescript
constructor(config: SummaryGeneratorConfig)
```

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `llmConfig` | `LLMServiceConfig` | LLM 服务配置 |
| `defaultLanguage` | `string?` | 默认输出语言（默认 `'zh'`） |
| `defaultPromptTemplate` | `string?` | 默认纪要生成 Prompt |

#### 公共方法

##### `generateMeetingSummary(request: SummaryGenerationRequest): Promise<MeetingSummaryData>`

生成结构化会议纪要数据。

**请求参数 (`SummaryGenerationRequest`)：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `transcription` | `TranscriptionResult` | STT 转写结果 |
| `meetingMeta.title` | `string?` | 会议标题 |
| `meetingMeta.date` | `string?` | 会议日期 |
| `meetingMeta.participants` | `string[]?` | 参与者列表 |
| `meetingMeta.context` | `string?` | 会议背景说明 |
| `customPromptTemplate` | `string?` | 自定义 Prompt 模板 |
| `outputLanguage` | `string?` | 输出语言 |

**返回值 (`MeetingSummaryData`)：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | `string` | 会议主题 |
| `date` | `string` | 会议日期 |
| `duration` | `string?` | 时长描述 |
| `participants` | `string[]` | 参与者 |
| `overview` | `string` | 会议概要 |
| `agendas` | `AgendaItem[]` | 议题列表 |
| `decisions` | `Decision[]` | 关键决议 |
| `actionItems` | `ActionItem[]` | 待办事项 |
| `notes` | `string?` | 备注 |

##### `generateMarkdown(request: SummaryGenerationRequest): Promise<string>`

生成 Markdown 格式的会议纪要（内部调用 `generateMeetingSummary` + `toMarkdown`）。

##### `generateMeetingAdvice(request: AdviceGenerationRequest): Promise<MeetingAdvice>`

基于纪要数据生成会后建议。

**请求参数 (`AdviceGenerationRequest`)：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `summaryData` | `MeetingSummaryData` | 结构化纪要数据 |
| `focusAreas` | `string[]?` | 指定关注方面 |
| `customPromptTemplate` | `string?` | 自定义 Prompt |

**返回值 (`MeetingAdvice`)：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `efficiencyAssessment` | `string?` | 会议效率评估 |
| `followUpSuggestions` | `string[]` | 后续行动建议 |
| `risks` | `string[]?` | 风险提示 |
| `improvements` | `string[]?` | 改进建议 |
| `rawMarkdown` | `string` | Markdown 格式的完整建议文本 |

##### `toMarkdown(data: MeetingSummaryData): string`

将结构化纪要数据转换为 Markdown 文档。可独立调用。

---

## 类型定义 (Types)

### 核心类型

**文件：** `src/types/index.ts`

#### RecordingState (枚举)

| 值 | 说明 |
|----|------|
| `IDLE` | 空闲 |
| `RECORDING` | 录音中 |
| `PAUSED` | 已暂停 |
| `STOPPING` | 正在停止 |

#### AudioFormat (枚举)

| 值 | MIME 类型 |
|----|----------|
| `WEBM_OPUS` | `audio/webm;codecs=opus` |
| `WEBM` | `audio/webm` |

#### MeetingAssistantSettings

插件全局设置接口。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `audioFolder` | `string` | `meeting-recordings` | 音频保存目录 |
| `notesFolder` | `string` | `meeting-notes` | 笔记保存目录 |
| `audioBitsPerSecond` | `number` | `128000` | 音频比特率 |
| `autoCreateNote` | `boolean` | `true` | 自动创建笔记 |

### 服务层类型

**文件：** `src/types/services.ts`

#### TranscriptSegment

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `number` | 片段序号 |
| `start` | `number` | 开始时间（秒） |
| `end` | `number` | 结束时间（秒） |
| `text` | `string` | 转写文本 |
| `speaker` | `string?` | 说话人标识 |
| `confidence` | `number?` | 置信度 (0-1) |

#### AgendaItem

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | `string` | 议题标题 |
| `summary` | `string` | 讨论摘要 |
| `keyPoints` | `string[]?` | 关键发言 |

#### ActionItem

| 字段 | 类型 | 说明 |
|------|------|------|
| `assignee` | `string` | 负责人 |
| `task` | `string` | 任务描述 |
| `deadline` | `string?` | 截止日期 |
| `priority` | `'high' \| 'medium' \| 'low'?` | 优先级 |

#### Decision

| 字段 | 类型 | 说明 |
|------|------|------|
| `content` | `string` | 决议内容 |
| `participants` | `string[]?` | 相关参与者 |

---

## 错误处理

### ServiceError

所有服务层错误统一使用 `ServiceError` 类：

```typescript
class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly statusCode?: number;
  readonly retryable: boolean;
  readonly cause?: Error;
}
```

### ServiceErrorCode (枚举)

| 错误码 | 说明 | 可重试 |
|--------|------|--------|
| `UNKNOWN` | 未知错误 | ❌ |
| `NETWORK_ERROR` | 网络错误 | ✅ |
| `TIMEOUT` | 请求超时 | ✅ |
| `INVALID_CONFIG` | 配置无效 | ❌ |
| `AUDIO_TOO_LARGE` | 音频文件过大 | ❌ |
| `UNSUPPORTED_FORMAT` | 不支持的格式 | ❌ |
| `TRANSCRIPTION_FAILED` | 转写失败 | 视情况 |
| `API_KEY_INVALID` | API Key 无效 | ❌ |
| `RATE_LIMITED` | 被限流 | ✅ |
| `CONTEXT_TOO_LONG` | 上下文过长 | ❌ |
| `MODEL_NOT_FOUND` | 模型不存在 | ❌ |
| `GENERATION_FAILED` | 生成失败 | 视情况 |

**重试策略：** 可重试错误使用指数退避策略（`baseDelay * 2^attempt + jitter`），默认最多重试 2-3 次。

---

## 插件入口

**文件：** `src/main.ts`

### MeetingAssistantPlugin

继承自 `Plugin`，是插件的主入口类。

#### 生命周期

- **`onload()`** — 插件加载时调用：加载设置 → 初始化 AudioRecorder / FileManager → 注册命令 → 注册 Ribbon 图标 → 添加设置面板 → 设置状态栏
- **`onunload()`** — 插件卸载时调用：销毁 AudioRecorder

#### 注册的命令

| 命令 ID | 名称 | 说明 |
|---------|------|------|
| `start-recording` | 开始录音 | 启动录音 |
| `toggle-pause-recording` | 暂停/恢复录音 | 切换暂停状态 |
| `stop-recording` | 停止录音并保存 | 停止并保存文件 |
| `toggle-recording` | 切换录音（开始/停止） | 工具栏按钮也绑定此操作 |

### MeetingAssistantSettingTab

继承自 `PluginSettingTab`，提供插件设置 UI。

**设置项：** 音频保存目录、笔记保存目录、音频比特率（下拉选择）、自动创建笔记（开关）。

---

## 扩展开发指南

### 添加新的 STT Provider

1. 在 `src/services/stt-service.ts` 中实现 `STTProvider` 接口：

```typescript
export class MySTTProvider implements STTProvider {
  readonly name = 'My STT Service';

  async transcribe(
    options: STTRequestOptions,
    onProgress?: STTProgressCallback
  ): Promise<TranscriptionResult> {
    // 你的转写逻辑
  }

  async validateConfig(): Promise<boolean> {
    // 验证配置
  }
}
```

2. 在 `src/types/services.ts` 中扩展 `STTProviderType`：

```typescript
export type STTProviderType = 'whisper' | 'my-stt';
```

3. 在 `createSTTProvider()` 工厂函数中添加 case。

### 添加新的 LLM Provider

1. 在 `src/services/llm-service.ts` 中实现 `LLMProvider` 接口：

```typescript
export class MyLLMProvider implements LLMProvider {
  readonly name = 'My LLM';

  async chatCompletion(options: LLMRequestOptions): Promise<LLMResponse> {
    // 你的 LLM 调用逻辑
  }

  async validateConfig(): Promise<boolean> {
    // 验证配置
  }
}
```

2. 在 `src/types/services.ts` 中扩展 `LLMProviderType`：

```typescript
export type LLMProviderType = 'openai' | 'claude' | 'ollama' | 'my-llm';
```

3. 在 `createLLMProvider()` 工厂函数中添加 case。

### 自定义 Prompt 模板

`SummaryGenerator` 支持通过 `customPromptTemplate` 覆盖默认 Prompt。自定义 Prompt 应要求 LLM 返回与默认格式一致的 JSON 结构，以确保解析器正常工作。

**纪要 Prompt 返回 JSON 结构：**
```json
{
  "title": "string",
  "participants": ["string"],
  "overview": "string",
  "agendas": [{ "title": "string", "summary": "string", "keyPoints": ["string"] }],
  "decisions": [{ "content": "string", "participants": ["string"] }],
  "actionItems": [{ "assignee": "string", "task": "string", "deadline": "string", "priority": "high|medium|low" }],
  "notes": "string"
}
```

**建议 Prompt 返回 JSON 结构：**
```json
{
  "efficiencyAssessment": "string",
  "followUpSuggestions": ["string"],
  "risks": ["string"],
  "improvements": ["string"]
}
```

---

*本文档随代码同步更新。如有疑问或发现文档与代码不一致，请提交 Issue。*
