// ============================================================
// 类型定义 - Obsidian Meeting Assistant
// ============================================================

/** 录音状态枚举 */
export enum RecordingState {
  /** 空闲，未录音 */
  IDLE = 'idle',
  /** 正在录音 */
  RECORDING = 'recording',
  /** 已暂停 */
  PAUSED = 'paused',
  /** 正在停止（处理中） */
  STOPPING = 'stopping',
}

/** 支持的音频格式 */
export enum AudioFormat {
  WEBM_OPUS = 'audio/webm;codecs=opus',
  WEBM = 'audio/webm',
}

/** 录音结果 */
export interface RecordingResult {
  /** 音频 Blob 数据 */
  blob: Blob;
  /** 录音时长（毫秒） */
  duration: number;
  /** MIME 类型 */
  mimeType: string;
  /** 录音开始时间 */
  startedAt: Date;
  /** 录音结束时间 */
  stoppedAt: Date;
}

/** 录音状态信息（用于 UI 展示） */
export interface RecordingStatus {
  /** 当前状态 */
  state: RecordingState;
  /** 已录制时长（毫秒） */
  elapsed: number;
  /** 录音开始时间（如果正在录音） */
  startedAt: Date | null;
}

/** AudioRecorder 配置选项 */
export interface AudioRecorderOptions {
  /** 音频 MIME 类型，默认 WebM(Opus) */
  mimeType?: string;
  /** 音频比特率（bps），默认 128000 */
  audioBitsPerSecond?: number;
  /** 数据块采集间隔（毫秒），默认 1000 */
  timeslice?: number;
}

/** 文件管理器配置 */
export interface FileManagerOptions {
  /** 音频保存的子目录（相对于 Vault 根目录），默认 "meeting-recordings" */
  audioFolder?: string;
  /** 笔记保存的子目录，默认 "meeting-notes" */
  notesFolder?: string;
  /** 文件名日期格式 */
  dateFormat?: string;
}

/** 保存音频文件的结果 */
export interface SaveAudioResult {
  /** 保存后的 Vault 内路径 */
  filePath: string;
  /** 文件大小（字节） */
  size: number;
}

/** 插件设置 */
export interface MeetingAssistantSettings {
  /** 音频保存目录 */
  audioFolder: string;
  /** 笔记保存目录 */
  notesFolder: string;
  /** 音频比特率 */
  audioBitsPerSecond: number;
  /** 是否在录音完成后自动创建笔记 */
  autoCreateNote: boolean;

  // STT 配置
  /** STT 提供商 */
  sttProvider: 'whisper' | 'moonshine';
  /** STT API Key */
  sttApiKey: string;
  /** STT API Base URL */
  sttBaseUrl: string;
  /** STT 语言 */
  sttLanguage: string;
  /** 是否启用说话人分离 */
  enableDiarization: boolean;

  // LLM 配置
  /** LLM 提供商 */
  llmProvider: 'openai' | 'claude' | 'ollama';
  /** LLM API Key */
  llmApiKey: string;
  /** LLM API Base URL */
  llmBaseUrl: string;
  /** LLM 模型 */
  llmModel: string;

  // 流程控制
  /** 录音完成后自动转写 */
  autoTranscribe: boolean;
  /** 转写完成后自动生成纪要 */
  autoSummarize: boolean;
}

/** 默认插件设置 */
export const DEFAULT_SETTINGS: MeetingAssistantSettings = {
  audioFolder: 'meeting-recordings',
  notesFolder: 'meeting-notes',
  audioBitsPerSecond: 128000,
  autoCreateNote: true,

  // STT defaults
  sttProvider: 'moonshine',
  sttApiKey: '',
  sttBaseUrl: 'http://localhost:8765',
  sttLanguage: '',
  enableDiarization: false,

  // LLM defaults
  llmProvider: 'openai',
  llmApiKey: '',
  llmBaseUrl: 'https://api.openai.com/v1',
  llmModel: 'gpt-4o',

  // Flow control defaults
  autoTranscribe: true,
  autoSummarize: true,
};

/** 录音事件回调类型 */
export interface RecorderEventCallbacks {
  /** 状态变化回调 */
  onStateChange?: (state: RecordingState) => void;
  /** 录音时长更新回调（每秒触发） */
  onElapsedChange?: (elapsed: number) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
  /** 收到数据块回调 */
  onDataAvailable?: (data: Blob) => void;
}
