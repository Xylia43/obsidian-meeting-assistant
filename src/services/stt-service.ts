/**
 * stt-service.ts - 语音转文字（STT）服务抽象层
 *
 * 提供 STTProvider 接口和 WhisperAPIProvider 实现。
 * 支持大文件自动分片、说话人分离、指数退避重试。
 */

import { requestUrl, RequestUrlParam } from 'obsidian';
import {
  STTServiceConfig,
  STTRequestOptions,
  STTProgress,
  STTProgressCallback,
  TranscriptionResult,
  TranscriptSegment,
  ServiceError,
  ServiceErrorCode,
} from '../types/services';

// ─── 接口定义 ─────────────────────────────────────────────────

/** STT 提供商接口 */
export interface STTProvider {
  /** 提供商名称 */
  readonly name: string;

  /**
   * 转写音频
   * @param options  转写请求选项
   * @param onProgress  进度回调（分片上传时触发）
   * @returns 转写结果
   */
  transcribe(
    options: STTRequestOptions,
    onProgress?: STTProgressCallback
  ): Promise<TranscriptionResult>;

  /**
   * 验证配置是否有效（如 API Key 可用）
   */
  validateConfig(): Promise<boolean>;
}

// ─── 常量 ──────────────────────────────────────────────────────

/** 默认单片最大 25MB */
const DEFAULT_MAX_CHUNK_SIZE = 25 * 1024 * 1024;
/** 默认最大重试次数 */
const DEFAULT_MAX_RETRIES = 3;
/** 默认重试基础延迟 500ms */
const DEFAULT_RETRY_DELAY_MS = 500;

// ─── 工具函数 ─────────────────────────────────────────────────

/**
 * 根据文件扩展名获取 MIME 类型
 */
function getAudioMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg',
    mp4: 'audio/mp4',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    webm: 'audio/webm',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
  };
  return mimeMap[ext] ?? 'audio/mpeg';
}

/**
 * 指数退避延迟（带抖动）
 */
function backoffDelay(attempt: number, baseMs: number): Promise<void> {
  const delay = baseMs * Math.pow(2, attempt) + Math.random() * baseMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * 将 ArrayBuffer 切片为多个分片
 */
function splitAudioBuffer(
  data: ArrayBuffer,
  chunkSize: number
): ArrayBuffer[] {
  const chunks: ArrayBuffer[] = [];
  let offset = 0;
  while (offset < data.byteLength) {
    const end = Math.min(offset + chunkSize, data.byteLength);
    chunks.push(data.slice(offset, end));
    offset = end;
  }
  return chunks;
}

/**
 * 构建 multipart/form-data 请求体
 * 在 Obsidian 环境中手动构建 —— 避免依赖 FormData (Node / 浏览器差异)
 */
function buildMultipartBody(
  fields: Record<string, string>,
  fileFieldName: string,
  fileData: ArrayBuffer,
  fileName: string
): { body: ArrayBuffer; contentType: string } {
  const boundary = '----OBMeetingAssistant' + Date.now().toString(36);
  const encoder = new TextEncoder();

  const parts: Uint8Array[] = [];

  // 文本字段
  for (const [key, value] of Object.entries(fields)) {
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`;
    parts.push(encoder.encode(header));
  }

  // 文件字段
  const mimeType = getAudioMimeType(fileName);
  const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="${fileFieldName}"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
  parts.push(encoder.encode(fileHeader));
  parts.push(new Uint8Array(fileData));
  parts.push(encoder.encode('\r\n'));

  // 结束
  parts.push(encoder.encode(`--${boundary}--\r\n`));

  // 合并
  const totalLength = parts.reduce((sum, p) => sum + p.byteLength, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.byteLength;
  }

  return {
    body: merged.buffer,
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

// ─── WhisperAPIProvider ────────────────────────────────────────

/**
 * OpenAI Whisper API 实现
 *
 * - 自动分片：音频 >maxChunkSize 时拆分上传，逐片转写后合并
 * - 重试：网络失败时指数退避重试
 * - Diarization：通过 prompt 暗示 + verbose_json 片段后处理实现基础分离
 *   （OpenAI Whisper API 原生不支持 diarization，这里做最佳努力）
 */
export class WhisperAPIProvider implements STTProvider {
  public readonly name = 'OpenAI Whisper';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxChunkSize: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly defaultLanguage?: string;
  private readonly enableDiarization: boolean;

  constructor(config: STTServiceConfig) {
    if (!config.apiKey) {
      throw new ServiceError(
        'Whisper API requires an API key',
        ServiceErrorCode.INVALID_CONFIG
      );
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? 'https://api.openai.com/v1').replace(
      /\/$/,
      ''
    );
    this.maxChunkSize = config.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.defaultLanguage = config.defaultLanguage;
    this.enableDiarization = config.enableDiarization ?? false;
  }

  // ── 公开方法 ────────────────────────────────────────────────

  async validateConfig(): Promise<boolean> {
    try {
      // 发一个极小的请求来验证 key（用 models 端点）
      const response = await requestUrl({
        url: `${this.baseUrl}/models`,
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async transcribe(
    options: STTRequestOptions,
    onProgress?: STTProgressCallback
  ): Promise<TranscriptionResult> {
    const audioData = options.audioData;

    // 判断是否需要分片
    if (audioData.byteLength > this.maxChunkSize) {
      return this.transcribeChunked(options, onProgress);
    }

    // 单片上传
    onProgress?.({
      currentChunk: 0,
      totalChunks: 1,
      percent: 0,
      stage: 'uploading',
    });

    const result = await this.callWhisperAPI(audioData, options);

    onProgress?.({
      currentChunk: 0,
      totalChunks: 1,
      percent: 100,
      stage: 'done',
    });

    return result;
  }

  // ── 分片转写 ────────────────────────────────────────────────

  private async transcribeChunked(
    options: STTRequestOptions,
    onProgress?: STTProgressCallback
  ): Promise<TranscriptionResult> {
    const chunks = splitAudioBuffer(options.audioData, this.maxChunkSize);
    const totalChunks = chunks.length;
    const partialResults: TranscriptionResult[] = [];

    for (let i = 0; i < totalChunks; i++) {
      onProgress?.({
        currentChunk: i,
        totalChunks,
        percent: Math.round((i / totalChunks) * 90),
        stage: 'uploading',
      });

      // 为后续分片提供前一段的末尾文本作为 prompt，提升连贯性
      // Bug fix: 合并用户原始 prompt 和前一段末尾文本，而非替换
      const chunkOptions: STTRequestOptions = {
        ...options,
        audioData: chunks[i],
        prompt:
          i > 0
            ? `${options.prompt ?? ''} ${partialResults[i - 1].text.slice(-200)}`.trim()
            : options.prompt,
      };

      const result = await this.callWhisperAPI(chunks[i], chunkOptions);
      partialResults.push(result);
    }

    // 合并结果
    onProgress?.({
      currentChunk: totalChunks - 1,
      totalChunks,
      percent: 95,
      stage: 'merging',
    });

    const merged = this.mergeResults(partialResults);

    onProgress?.({
      currentChunk: totalChunks - 1,
      totalChunks,
      percent: 100,
      stage: 'done',
    });

    return merged;
  }

  // ── Whisper API 调用（带重试） ───────────────────────────────

  private async callWhisperAPI(
    audioData: ArrayBuffer,
    options: STTRequestOptions
  ): Promise<TranscriptionResult> {
    const language = options.language ?? this.defaultLanguage;
    const enableDiarization =
      options.enableDiarization ?? this.enableDiarization;

    // 构建表单字段
    const fields: Record<string, string> = {
      model: 'whisper-1',
      response_format: 'verbose_json',
    };

    if (language) {
      fields['language'] = language;
    }
    if (options.temperature !== undefined) {
      fields['temperature'] = String(options.temperature);
    }

    // Diarization 通过 prompt 暗示（Whisper API 不原生支持 diarization，
    // 但 prompt 中说明多说话人可改善分段质量）
    let prompt = options.prompt ?? '';
    if (enableDiarization) {
      const speakerHint = options.speakerCount
        ? `This audio contains ${options.speakerCount} speakers.`
        : 'This audio contains multiple speakers.';
      prompt = prompt ? `${speakerHint} ${prompt}` : speakerHint;
    }
    if (prompt) {
      fields['prompt'] = prompt;
    }

    const fileName = options.fileName || 'audio.webm';
    const { body, contentType } = buildMultipartBody(
      fields,
      'file',
      audioData,
      fileName
    );

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const reqParams: RequestUrlParam = {
          url: `${this.baseUrl}/audio/transcriptions`,
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': contentType,
          },
          body,
        };

        const response = await requestUrl(reqParams);

        if (response.status !== 200) {
          throw this.handleAPIError(response.status, response.text);
        }

        const json = response.json as WhisperVerboseResponse;
        return this.parseWhisperResponse(json, enableDiarization);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // 不可重试错误直接抛出
        if (err instanceof ServiceError && !err.retryable) {
          throw err;
        }

        // 还有重试机会则等待
        if (attempt < this.maxRetries) {
          await backoffDelay(attempt, this.retryDelayMs);
        }
      }
    }

    throw new ServiceError(
      `Whisper transcription failed after ${this.maxRetries + 1} attempts: ${lastError?.message}`,
      ServiceErrorCode.TRANSCRIPTION_FAILED,
      { retryable: false, cause: lastError }
    );
  }

  // ── 解析 Whisper 响应 ───────────────────────────────────────

  private parseWhisperResponse(
    json: WhisperVerboseResponse,
    enableDiarization: boolean
  ): TranscriptionResult {
    const segments: TranscriptSegment[] = (json.segments ?? []).map(
      (seg, idx) => ({
        id: idx,
        start: seg.start,
        end: seg.end,
        text: seg.text.trim(),
        confidence:
          seg.avg_logprob !== undefined
            ? Math.exp(seg.avg_logprob) // logprob → 概率近似
            : undefined,
        speaker: undefined,
      })
    );

    // 基础说话人分离：基于较长静默间隔分配 speaker 标签
    const speakers: string[] = [];
    if (enableDiarization && segments.length > 0) {
      this.assignSpeakersHeuristic(segments, speakers);
    }

    return {
      text: json.text ?? '',
      segments,
      language: json.language ?? 'unknown',
      duration: json.duration ?? 0,
      speakers: speakers.length > 0 ? speakers : undefined,
    };
  }

  /**
   * 启发式说话人分离：
   * 利用段间沉默时间和文本特征（如 "好的"、"我觉得" 等开头）
   * 来猜测说话人切换。这是 best-effort，准确率有限。
   */
  private assignSpeakersHeuristic(
    segments: TranscriptSegment[],
    speakers: string[]
  ): void {
    const SILENCE_THRESHOLD = 1.5; // 秒
    let currentSpeaker = 'Speaker 1';
    let speakerIndex = 1;
    const speakerSet = new Set<string>([currentSpeaker]);

    for (let i = 0; i < segments.length; i++) {
      if (i > 0) {
        const gap = segments[i].start - segments[i - 1].end;
        if (gap >= SILENCE_THRESHOLD) {
          // 切换说话人
          speakerIndex++;
          currentSpeaker = `Speaker ${speakerIndex}`;
          speakerSet.add(currentSpeaker);
        }
      }
      segments[i].speaker = currentSpeaker;
    }

    speakers.push(...speakerSet);
  }

  // ── 合并分片结果 ────────────────────────────────────────────

  private mergeResults(
    results: TranscriptionResult[]
  ): TranscriptionResult {
    let fullText = '';
    const allSegments: TranscriptSegment[] = [];
    let timeOffset = 0;
    let segId = 0;
    const allSpeakers = new Set<string>();

    for (const result of results) {
      fullText += (fullText ? ' ' : '') + result.text;

      for (const seg of result.segments) {
        allSegments.push({
          ...seg,
          id: segId++,
          start: seg.start + timeOffset,
          end: seg.end + timeOffset,
        });
        if (seg.speaker) allSpeakers.add(seg.speaker);
      }

      timeOffset += result.duration;
    }

    return {
      text: fullText,
      segments: allSegments,
      language: results[0]?.language ?? 'unknown',
      duration: timeOffset,
      speakers: allSpeakers.size > 0 ? [...allSpeakers] : undefined,
    };
  }

  // ── 错误处理 ────────────────────────────────────────────────

  private handleAPIError(status: number, body: string): ServiceError {
    if (status === 401) {
      return new ServiceError(
        'Invalid API key for Whisper API',
        ServiceErrorCode.API_KEY_INVALID,
        { statusCode: 401, retryable: false }
      );
    }
    if (status === 429) {
      return new ServiceError(
        'Rate limited by Whisper API',
        ServiceErrorCode.RATE_LIMITED,
        { statusCode: 429, retryable: true }
      );
    }
    if (status >= 500) {
      return new ServiceError(
        `Whisper API server error: ${body}`,
        ServiceErrorCode.TRANSCRIPTION_FAILED,
        { statusCode: status, retryable: true }
      );
    }
    return new ServiceError(
      `Whisper API error (${status}): ${body}`,
      ServiceErrorCode.TRANSCRIPTION_FAILED,
      { statusCode: status, retryable: false }
    );
  }
}

// ─── Whisper verbose_json 响应类型（内部使用） ───────────────────

interface WhisperVerboseResponse {
  text: string;
  language: string;
  duration: number;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
    avg_logprob?: number;
  }>;
}

// ─── MoonshineProvider ────────────────────────────────────────

/**
 * Moonshine 本地 STT 实现
 * 通过本地 HTTP 服务调用 Moonshine 模型
 */
export class MoonshineProvider implements STTProvider {
  public readonly name = 'Moonshine';

  private readonly baseUrl: string;
  private readonly defaultLanguage?: string;

  constructor(config: STTServiceConfig) {
    this.baseUrl = (config.baseUrl ?? 'http://localhost:8765').replace(/\/$/, '');
    this.defaultLanguage = config.defaultLanguage;
  }

  async validateConfig(): Promise<boolean> {
    try {
      const response = await requestUrl({
        url: `${this.baseUrl}/health`,
        method: 'GET',
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async transcribe(
    options: STTRequestOptions,
    onProgress?: STTProgressCallback
  ): Promise<TranscriptionResult> {
    onProgress?.({
      currentChunk: 0,
      totalChunks: 1,
      percent: 0,
      stage: 'uploading',
    });

    const language = options.language ?? this.defaultLanguage ?? 'en';
    const fileName = options.fileName || 'audio.webm';
    
    const { body, contentType } = buildMultipartBody(
      { language },
      'file',
      options.audioData,
      fileName
    );

    try {
      const response = await requestUrl({
        url: `${this.baseUrl}/transcribe`,
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body,
      });

      if (response.status !== 200) {
        throw new ServiceError(
          `Moonshine API error (${response.status}): ${response.text}`,
          ServiceErrorCode.TRANSCRIPTION_FAILED
        );
      }

      const json = response.json as MoonshineResponse;
      
      onProgress?.({
        currentChunk: 0,
        totalChunks: 1,
        percent: 100,
        stage: 'done',
      });

      return {
        text: json.text,
        segments: (json.segments ?? []).map((seg, idx) => ({
          id: idx,
          start: seg.start,
          end: seg.end,
          text: seg.text,
        })),
        language: json.language,
        duration: json.duration,
      };
    } catch (err) {
      throw new ServiceError(
        `Moonshine transcription failed: ${err instanceof Error ? err.message : String(err)}`,
        ServiceErrorCode.TRANSCRIPTION_FAILED
      );
    }
  }
}

interface MoonshineResponse {
  text: string;
  segments: Array<{ text: string; start: number; end: number }>;
  language: string;
  duration: number;
}

// ─── 工厂函数 ─────────────────────────────────────────────────

/**
 * 根据配置创建 STT 提供商实例
 */
export function createSTTProvider(config: STTServiceConfig): STTProvider {
  switch (config.provider) {
    case 'whisper':
      return new WhisperAPIProvider(config);
    case 'moonshine':
      return new MoonshineProvider(config);
    default: {
      const _exhaustive: never = config.provider;
      throw new ServiceError(
        `Unknown STT provider: ${_exhaustive}`,
        ServiceErrorCode.INVALID_CONFIG
      );
    }
  }
}
