/**
 * services.ts - 服务层类型定义
 * 
 * 涵盖 STT、LLM、会议纪要生成相关的所有类型。
 */

// ─── STT 相关类型 ───────────────────────────────────────────────

/** STT 提供商标识 */
export type STTProviderType = 'whisper' | 'moonshine';

/** STT 转写请求配置 */
export interface STTRequestOptions {
  /** 音频文件的 ArrayBuffer */
  audioData: ArrayBuffer;
  /** 音频文件名（含扩展名，用于 MIME 推断） */
  fileName: string;
  /** 语言代码，如 'zh', 'en'。留空则自动检测 */
  language?: string;
  /** 是否启用说话人分离 */
  enableDiarization?: boolean;
  /** 说话人数量提示（仅在 enableDiarization 为 true 时有效） */
  speakerCount?: number;
  /** 输出格式 */
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
  /** 温度参数 (0-1) */
  temperature?: number;
  /** 可选的初始提示（帮助模型理解上下文） */
  prompt?: string;
}

/** 单个转写片段 */
export interface TranscriptSegment {
  /** 片段序号 */
  id: number;
  /** 开始时间（秒） */
  start: number;
  /** 结束时间（秒） */
  end: number;
  /** 转写文本 */
  text: string;
  /** 说话人标识（启用 diarization 时） */
  speaker?: string;
  /** 置信度 (0-1) */
  confidence?: number;
}

/** STT 转写结果 */
export interface TranscriptionResult {
  /** 完整转写文本 */
  text: string;
  /** 分段信息 */
  segments: TranscriptSegment[];
  /** 检测到的语言 */
  language: string;
  /** 音频总时长（秒） */
  duration: number;
  /** 识别到的说话人列表 */
  speakers?: string[];
}

/** STT 分片上传进度回调 */
export type STTProgressCallback = (progress: STTProgress) => void;

/** STT 上传进度 */
export interface STTProgress {
  /** 当前分片索引（从0开始） */
  currentChunk: number;
  /** 总分片数 */
  totalChunks: number;
  /** 进度百分比 (0-100) */
  percent: number;
  /** 当前阶段描述 */
  stage: 'uploading' | 'transcribing' | 'merging' | 'done';
}

// ─── LLM 相关类型 ───────────────────────────────────────────────

/** LLM 提供商标识 */
export type LLMProviderType = 'openai' | 'claude' | 'ollama';

/** LLM 请求消息 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** LLM 请求配置 */
export interface LLMRequestOptions {
  /** 消息列表 */
  messages: LLMMessage[];
  /** 模型名称（覆盖默认值） */
  model?: string;
  /** 温度 (0-2) */
  temperature?: number;
  /** 最大输出 token 数 */
  maxTokens?: number;
  /** Top-p 采样 */
  topP?: number;
  /** 停止序列 */
  stop?: string[];
}

/** LLM 响应 */
export interface LLMResponse {
  /** 生成的文本内容 */
  content: string;
  /** 使用的模型 */
  model: string;
  /** Token 使用统计 */
  usage?: LLMTokenUsage;
  /** 完成原因 */
  finishReason?: 'stop' | 'length' | 'content_filter' | 'error';
}

/** Token 使用统计 */
export interface LLMTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ─── 会议纪要相关类型 ────────────────────────────────────────────

/** 待办事项 */
export interface ActionItem {
  /** 负责人 */
  assignee: string;
  /** 任务描述 */
  task: string;
  /** 截止日期（可选） */
  deadline?: string;
  /** 优先级 */
  priority?: 'high' | 'medium' | 'low';
}

/** 决议 */
export interface Decision {
  /** 决议内容 */
  content: string;
  /** 相关参与者 */
  participants?: string[];
}

/** 议题 */
export interface AgendaItem {
  /** 议题标题 */
  title: string;
  /** 讨论摘要 */
  summary: string;
  /** 关键发言 */
  keyPoints?: string[];
}

/** 结构化会议纪要数据 */
export interface MeetingSummaryData {
  /** 会议主题 */
  title: string;
  /** 会议日期 */
  date: string;
  /** 会议时长描述 */
  duration?: string;
  /** 参与者列表 */
  participants: string[];
  /** 会议概要（一段话） */
  overview: string;
  /** 议题列表 */
  agendas: AgendaItem[];
  /** 关键决议 */
  decisions: Decision[];
  /** 待办事项 */
  actionItems: ActionItem[];
  /** 其他备注 */
  notes?: string;
}

/** 会议纪要生成请求 */
export interface SummaryGenerationRequest {
  /** 转写结果 */
  transcription: TranscriptionResult;
  /** 会议元信息（可选，帮助生成更好的纪要） */
  meetingMeta?: {
    title?: string;
    date?: string;
    participants?: string[];
    context?: string;
  };
  /** 自定义 Prompt 模板（可选） */
  customPromptTemplate?: string;
  /** 输出语言，默认跟随转写语言 */
  outputLanguage?: string;
}

/** 建议生成请求 */
export interface AdviceGenerationRequest {
  /** 会议纪要数据 */
  summaryData: MeetingSummaryData;
  /** 指定关注的方面 */
  focusAreas?: string[];
  /** 自定义 Prompt 模板 */
  customPromptTemplate?: string;
}

/** 建议结果 */
export interface MeetingAdvice {
  /** 会议效率评估 */
  efficiencyAssessment?: string;
  /** 后续行动建议 */
  followUpSuggestions: string[];
  /** 风险提示 */
  risks?: string[];
  /** 改进建议 */
  improvements?: string[];
  /** 原始文本（Markdown 格式） */
  rawMarkdown: string;
}

// ─── 配置类型 ─────────────────────────────────────────────────

/** STT 服务配置 */
export interface STTServiceConfig {
  provider: STTProviderType;
  /** OpenAI API Key */
  apiKey: string;
  /** API 基础 URL（可选，支持自定义端点） */
  baseUrl?: string;
  /** 默认语言 */
  defaultLanguage?: string;
  /** 默认启用 diarization */
  enableDiarization?: boolean;
  /** 单次上传最大大小（字节），超出则分片。默认 25MB */
  maxChunkSize?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试延迟基数（毫秒） */
  retryDelayMs?: number;
}

/** LLM 服务配置 */
export interface LLMServiceConfig {
  provider: LLMProviderType;
  /** API Key（OpenAI / Anthropic） */
  apiKey?: string;
  /** API 基础 URL */
  baseUrl?: string;
  /** 默认模型 */
  model: string;
  /** 默认温度 */
  temperature?: number;
  /** 默认最大 token */
  maxTokens?: number;
}

/** 纪要生成器配置 */
export interface SummaryGeneratorConfig {
  /** 使用的 LLM 配置 */
  llmConfig: LLMServiceConfig;
  /** 默认输出语言 */
  defaultLanguage?: string;
  /** 默认 Prompt 模板 */
  defaultPromptTemplate?: string;
}

// ─── 错误类型 ─────────────────────────────────────────────────

/** 服务错误码 */
export enum ServiceErrorCode {
  // 通用
  UNKNOWN = 'UNKNOWN',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  INVALID_CONFIG = 'INVALID_CONFIG',

  // STT 相关
  AUDIO_TOO_LARGE = 'AUDIO_TOO_LARGE',
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
  TRANSCRIPTION_FAILED = 'TRANSCRIPTION_FAILED',

  // LLM 相关
  API_KEY_INVALID = 'API_KEY_INVALID',
  RATE_LIMITED = 'RATE_LIMITED',
  CONTEXT_TOO_LONG = 'CONTEXT_TOO_LONG',
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  GENERATION_FAILED = 'GENERATION_FAILED',
}

/** 服务层统一错误 */
export class ServiceError extends Error {
  public readonly code: ServiceErrorCode;
  public readonly statusCode?: number;
  public readonly retryable: boolean;

  public readonly cause?: Error;

  constructor(
    message: string,
    code: ServiceErrorCode = ServiceErrorCode.UNKNOWN,
    options?: { statusCode?: number; retryable?: boolean; cause?: Error }
  ) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.statusCode = options?.statusCode;
    this.retryable = options?.retryable ?? false;
    this.cause = options?.cause;
  }
}
