# 代码审查报告 — Obsidian Meeting Assistant

**审查日期**: 2026-03-06  
**审查范围**: `src/` 下所有 TypeScript 源码  
**审查人**: QA Engineer (Automated)

---

## 1. 总体评价

项目代码整体质量 **良好**：
- 类型定义完善，使用 TypeScript 严格模式
- 模块划分清晰（core / services / types）
- 错误处理较为完整，定义了统一的 `ServiceError` 体系
- 支持多 LLM 提供商（OpenAI / Claude / Ollama），架构可扩展

---

## 2. Bug 与问题

### 🔴 P0 — 高优先级

#### 2.1 `main.ts`: AudioRecorder 被创建了两次

**文件**: `src/main.ts` → `onload()`  
**问题**: `this.audioRecorder` 在 `onload()` 中被创建了 **两次**。

第一次（~第20行）：
```ts
this.audioRecorder = new AudioRecorder(
  { audioBitsPerSecond: this.settings.audioBitsPerSecond },
  { onStateChange: ..., onError: ... }
);
```

第二次（~第50行，为了绑定状态栏更新）：
```ts
this.audioRecorder = new AudioRecorder(
  { audioBitsPerSecond: this.settings.audioBitsPerSecond },
  { onStateChange: ..., onElapsedChange: ..., onError: ... }
);
```

**影响**:
- 第一次创建的实例被丢弃，浪费资源
- 第一次创建和 `registerCommands()` 之间存在时序窗口 — 如果命令注册时引用了旧实例，可能不一致
- `onElapsedChange` 回调只在第二次实例上注册

**建议**: 只创建一次 `AudioRecorder`，将所有回调合并：
```ts
this.audioRecorder = new AudioRecorder(
  { audioBitsPerSecond: this.settings.audioBitsPerSecond },
  {
    onStateChange: (state) => { /* 合并日志 + 状态栏更新 */ },
    onElapsedChange: (elapsed) => { /* 状态栏更新 */ },
    onError: (error) => { /* 合并错误处理 */ },
  }
);
```

---

### 🟡 P1 — 中优先级

#### 2.2 `audio-recorder.ts`: `stopRecording()` 中存在潜在的事件竞态

**问题**: `stopRecording()` 在调用 `this.mediaRecorder.stop()` 之前重新绑定了 `onstop` 和 `onerror`，但 `setupMediaRecorderEvents()` 也绑定了 `onerror`。这意味着 `onerror` 被覆盖，如果在 `stop()` 调用期间发生错误，原始 `setupMediaRecorderEvents` 中的错误处理逻辑会丢失。

**建议**: 考虑使用事件监听器（`addEventListener`）替代直接属性赋值，或在 `stopRecording()` 中保留一致的错误处理链。

#### 2.3 `audio-recorder.ts`: `calculateElapsed()` 在 `STOPPING` 状态下可能丢失时间

**问题**: 当状态为 `STOPPING` 时，`calculateElapsed()` 返回 `elapsedBeforePause`。但如果录音从 `RECORDING` 状态直接停止（未暂停），最后一段录音时间（`Date.now() - lastResumeTime`）不会被计入 `elapsedBeforePause`。

**实际影响**: `stopRecording()` 的 Promise 解析时调用 `calculateElapsed()`，此时状态已经是 `STOPPING`，所以返回的 `duration` 可能比实际录音时间短。

**建议**: 在 `setState(RecordingState.STOPPING)` 之前，先累加当前段的时间：
```ts
if (this.state === RecordingState.RECORDING) {
  this.elapsedBeforePause += Date.now() - this.lastResumeTime;
}
this.setState(RecordingState.STOPPING);
```

#### 2.4 `stt-service.ts`: 分片转写的音频不一定能在任意字节偏移处解码

**问题**: `splitAudioBuffer()` 按固定字节大小切割 `ArrayBuffer`，但音频编码（如 WebM/Opus）不能在任意字节位置切割。Whisper API 对不完整的音频帧可能会产生解码错误或丢失片段。

**建议**:
- 记录此限制为已知 limitation
- 考虑使用 FFmpeg (WebAssembly) 做基于时间的分割
- 或者对于大多数会议录音（< 25MB），不太可能触发分片

#### 2.5 `stt-service.ts`: 分片时 `prompt` 引用可能导致信息泄露

**问题**: 在分片转写中，后续分片使用前一段结果的最后 200 字符作为 `prompt`：
```ts
prompt: i > 0 ? (partialResults[i - 1].text.slice(-200) ?? options.prompt) : options.prompt
```
如果用户提供了自定义 `prompt`，在第二片之后它会被覆盖，丢失了用户的上下文提示。

**建议**: 合并而非替换：
```ts
prompt: i > 0 
  ? `${options.prompt ?? ''} ${partialResults[i - 1].text.slice(-200)}`.trim()
  : options.prompt
```

---

### 🟢 P2 — 低优先级 / 建议

#### 2.6 `file-manager.ts`: `dateFormat` 配置选项未被实际使用

**问题**: `FileManagerOptions` 定义了 `dateFormat` 字段，`DEFAULT_OPTIONS` 中也设了默认值 `'YYYY-MM-DD_HHmmss'`，但 `formatDate()` 方法中硬编码了日期格式，并没有使用 `this.options.dateFormat`。

**建议**: 要么实现 `dateFormat` 的动态解析，要么移除该配置项以避免误导。

#### 2.7 `file-manager.ts`: `sanitizeFileName` 未处理路径分隔符 `/`

**问题**: 正则表达式 `/[\\/:*?"<>|]/g` 虽然包含了 `/`，但 `generateFileName` 拼接路径时使用 `/` 作为分隔符。如果用户传入包含 `/` 的标题（如 "A/B 测试"），`sanitizeFileName` 会将其替换为 `_`，这是正确行为，但可能不符合用户预期。

**建议**: 在 UI 层（设置面板）提示用户不要在标题中使用特殊字符。

#### 2.8 `llm-service.ts`: `retryableRequest` 对 429 错误会重试但最终超时

**问题**: 429（Rate Limited）错误被标记为 `retryable: true`，重试逻辑也会触发。但默认只重试 2 次，间隔较短（~500ms + 抖动），对于真正的速率限制通常不够。

**建议**: 
- 解析 `Retry-After` 响应头
- 增加最大重试次数或配置化

#### 2.9 `summary-generator.ts`: `parseSummaryJSON` 对格式错误的恢复不够优雅

**问题**: 当 LLM 返回的不是合法 JSON 时，直接抛出 `ServiceError`。但 LLM 输出不可靠，有时会夹杂额外文本。

**当前代码已有的缓解措施**: `extractJSON()` 会尝试提取代码块和 `{...}` 范围，这是好的。

**建议**: 考虑增加二次尝试 — 如果 JSON.parse 失败，尝试移除 JSON 中的注释和尾逗号后重试。

#### 2.10 类型安全: 多处使用 `as` 类型断言

**文件**: `summary-generator.ts`  
**问题**: `parseSummaryJSON` 和 `parseAdviceJSON` 中大量使用 `as string`、`as string[]` 等断言，没有运行时验证。如果 LLM 返回了意外类型（如 `participants` 是字符串而非数组），可能导致下游逻辑出错。

**建议**: 使用 `zod` 或手动类型守卫进行运行时验证。

---

## 3. 设计问题

### 3.1 缺少 STT 和 LLM 的集成入口

`main.ts` 只集成了 `AudioRecorder` 和 `FileManager`，但 STT 和 LLM 服务（`stt-service.ts`、`llm-service.ts`、`summary-generator.ts`）没有被 `main.ts` 引用和调用。录音完成后没有自动调用转写和纪要生成的流程。

**这可能是有意为之**（分阶段开发），但需要确认。

### 3.2 缺少配置面板中 STT / LLM 相关设置

`MeetingAssistantSettings` 只包含音频相关的设置，没有 STT API Key、LLM 模型选择等。需要扩展 `MeetingAssistantSettings` 和设置面板。

### 3.3 缺少错误恢复机制

如果录音过程中浏览器 tab 失焦或 MediaRecorder 意外停止，没有数据恢复机制。已经收集的 `chunks` 会在 `cleanup()` 中被清空。

**建议**: 在 `ondataavailable` 中持久化 chunks 到 IndexedDB，或在 `cleanup()` 前检查是否有未保存的数据。

### 3.4 日志缺失

服务层（STT/LLM）缺少结构化日志。在生产环境中，调试 API 调用问题会比较困难。

**建议**: 引入可配置的日志级别（debug/info/warn/error）。

---

## 4. 潜在风险

| 风险 | 描述 | 影响 | 缓解建议 |
|------|------|------|----------|
| API Key 安全 | API Key 存储在 Obsidian 插件设置中（明文），通过 `loadData()` / `saveData()` 持久化到 `data.json` | Key 泄露 | 考虑加密存储或使用系统密钥链 |
| 大文件内存 | 录音 Blob 和 ArrayBuffer 全部在内存中处理 | 长录音（>1h）可能导致 OOM | 实现流式处理或分段存储 |
| 网络依赖 | STT/LLM 依赖外部 API，无离线回退 | 网络不可用时功能降级 | Ollama 本地模型已是一种回退方案 |
| 并发安全 | 多次快速点击录音按钮可能导致状态不一致 | 状态机混乱 | 在状态转换期间禁用 UI 操作（添加 debounce） |
| 跨平台兼容 | MediaRecorder API 在移动端 Obsidian（Android/iOS）支持有限 | 移动端可能无法录音 | 检测环境并降级提示 |

---

## 5. 代码质量与最佳实践

### ✅ 做得好的方面
- **类型定义全面**: `types/` 下的定义清晰、注释完善
- **工厂模式**: `createSTTProvider` / `createLLMProvider` 便于扩展新提供商
- **统一错误码**: `ServiceErrorCode` 枚举覆盖了常见错误场景
- **multipart 手动构建**: 避免了 Node/Browser `FormData` 差异问题
- **JSON 提取**: `extractJSON()` 处理了 LLM 常见的输出格式问题

### ⚠️ 可改进的方面
- 没有国际化（i18n）—— UI 文本全部硬编码为中文
- 缺少单元测试（已通过本次 QA 补齐）
- 没有 CI/CD 配置
- 缺少 CHANGELOG 和版本管理策略
- 部分 JSDoc 注释可更详细

---

## 6. 测试覆盖情况

本次 QA 编写了 **127 个单元测试**，全部通过：

| 测试文件 | 测试数 | 覆盖模块 |
|----------|--------|----------|
| `types.test.ts` | 11 | 枚举、默认值、ServiceError |
| `audio-recorder.test.ts` | 23 | 状态机、计时、回调、销毁 |
| `file-manager.test.ts` | 18 | 路径生成、笔记模板、文件名安全性 |
| `stt-service.test.ts` | 25 | API 调用、分片、diarization、错误处理 |
| `llm-service.test.ts` | 28 | 三种 Provider、工厂函数、入口函数 |
| `summary-generator.test.ts` | 22 | E2E 流程、JSON 解析、Markdown 生成 |

---

## 7. 建议的优先级排序

1. **[P0]** 修复 `main.ts` 中 AudioRecorder 双重创建
2. **[P1]** 修复 `calculateElapsed()` 在 STOPPING 状态丢失时间
3. **[P1]** 集成 STT/LLM 到 main.ts 的录音完成流程
4. **[P1]** 扩展设置面板，添加 API Key 等配置
5. **[P2]** 实现或移除 `dateFormat` 配置项
6. **[P2]** 添加运行时类型验证（推荐 zod）
7. **[P2]** 添加录音数据恢复机制

---

*报告由 QA 工程师自动生成 | 基于代码静态分析与测试编写过程中的发现*
