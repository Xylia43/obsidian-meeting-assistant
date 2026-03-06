/**
 * llm-service.ts - LLM 服务抽象层
 *
 * 提供 LLMProvider 接口及三种实现：
 *  - OpenAIProvider（GPT 系列）
 *  - ClaudeProvider（Anthropic Claude）
 *  - OllamaProvider（本地模型）
 *
 * 统一的 generateSummary() / generateAdvice() 入口。
 */

import { requestUrl } from 'obsidian';
import {
  LLMServiceConfig,
  LLMProviderType,
  LLMRequestOptions,
  LLMResponse,
  LLMMessage,
  LLMTokenUsage,
  ServiceError,
  ServiceErrorCode,
} from '../types/services';

// ─── 接口定义 ─────────────────────────────────────────────────

/** LLM 提供商接口 */
export interface LLMProvider {
  /** 提供商名称 */
  readonly name: string;

  /**
   * 发送聊天补全请求
   */
  chatCompletion(options: LLMRequestOptions): Promise<LLMResponse>;

  /**
   * 验证配置（API Key / 模型可用性）
   */
  validateConfig(): Promise<boolean>;
}

// ─── 常量 ──────────────────────────────────────────────────────

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;

// ─── 工具函数 ─────────────────────────────────────────────────

function backoffDelay(attempt: number, baseMs: number): Promise<void> {
  const delay = baseMs * Math.pow(2, attempt) + Math.random() * baseMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * 带重试的请求封装
 */
async function retryableRequest<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  retryDelayMs: number,
  label: string
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (err instanceof ServiceError && !err.retryable) throw err;
      if (attempt < maxRetries) await backoffDelay(attempt, retryDelayMs);
    }
  }
  throw new ServiceError(
    `${label} failed after ${maxRetries + 1} attempts: ${lastError?.message}`,
    ServiceErrorCode.GENERATION_FAILED,
    { retryable: false, cause: lastError }
  );
}

// ─── OpenAI Provider ──────────────────────────────────────────

export class OpenAIProvider implements LLMProvider {
  public readonly name = 'OpenAI';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly defaultTemperature: number;
  private readonly defaultMaxTokens: number;

  constructor(config: LLMServiceConfig) {
    if (!config.apiKey) {
      throw new ServiceError(
        'OpenAI provider requires an API key',
        ServiceErrorCode.INVALID_CONFIG
      );
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? 'https://api.openai.com/v1').replace(
      /\/$/,
      ''
    );
    this.defaultModel = config.model ?? 'gpt-4o';
    this.defaultTemperature = config.temperature ?? 0.3;
    this.defaultMaxTokens = config.maxTokens ?? 4096;
  }

  async validateConfig(): Promise<boolean> {
    try {
      const res = await requestUrl({
        url: `${this.baseUrl}/models`,
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async chatCompletion(options: LLMRequestOptions): Promise<LLMResponse> {
    return retryableRequest(
      () => this.doRequest(options),
      DEFAULT_MAX_RETRIES,
      DEFAULT_RETRY_DELAY_MS,
      'OpenAI chat completion'
    );
  }

  private async doRequest(options: LLMRequestOptions): Promise<LLMResponse> {
    const body = JSON.stringify({
      model: options.model ?? this.defaultModel,
      messages: options.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options.temperature ?? this.defaultTemperature,
      max_tokens: options.maxTokens ?? this.defaultMaxTokens,
      top_p: options.topP,
      stop: options.stop,
    });

    const res = await requestUrl({
      url: `${this.baseUrl}/chat/completions`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    if (res.status !== 200) {
      throw this.handleError(res.status, res.text);
    }

    const json = res.json as OpenAIChatResponse;
    const choice = json.choices?.[0];

    return {
      content: choice?.message?.content ?? '',
      model: json.model ?? this.defaultModel,
      usage: json.usage
        ? {
            promptTokens: json.usage.prompt_tokens,
            completionTokens: json.usage.completion_tokens,
            totalTokens: json.usage.total_tokens,
          }
        : undefined,
      finishReason: this.mapFinishReason(choice?.finish_reason),
    };
  }

  private mapFinishReason(
    reason?: string
  ): LLMResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return undefined;
    }
  }

  private handleError(status: number, body: string): ServiceError {
    if (status === 401)
      return new ServiceError('Invalid OpenAI API key', ServiceErrorCode.API_KEY_INVALID, {
        statusCode: 401,
        retryable: false,
      });
    if (status === 429)
      return new ServiceError('OpenAI rate limited', ServiceErrorCode.RATE_LIMITED, {
        statusCode: 429,
        retryable: true,
      });
    if (status === 404)
      return new ServiceError('OpenAI model not found', ServiceErrorCode.MODEL_NOT_FOUND, {
        statusCode: 404,
        retryable: false,
      });
    if (status >= 500)
      return new ServiceError(`OpenAI server error: ${body}`, ServiceErrorCode.GENERATION_FAILED, {
        statusCode: status,
        retryable: true,
      });
    return new ServiceError(`OpenAI error (${status}): ${body}`, ServiceErrorCode.GENERATION_FAILED, {
      statusCode: status,
      retryable: false,
    });
  }
}

// ─── Claude (Anthropic) Provider ──────────────────────────────

export class ClaudeProvider implements LLMProvider {
  public readonly name = 'Claude';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly defaultTemperature: number;
  private readonly defaultMaxTokens: number;
  private readonly apiVersion = '2023-06-01';

  constructor(config: LLMServiceConfig) {
    if (!config.apiKey) {
      throw new ServiceError(
        'Claude provider requires an API key',
        ServiceErrorCode.INVALID_CONFIG
      );
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (
      config.baseUrl ?? 'https://api.anthropic.com/v1'
    ).replace(/\/$/, '');
    this.defaultModel = config.model ?? 'claude-sonnet-4-20250514';
    this.defaultTemperature = config.temperature ?? 0.3;
    this.defaultMaxTokens = config.maxTokens ?? 4096;
  }

  async validateConfig(): Promise<boolean> {
    try {
      // 发一个极小的请求来验证 key
      const res = await requestUrl({
        url: `${this.baseUrl}/messages`,
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': this.apiVersion,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.defaultModel,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async chatCompletion(options: LLMRequestOptions): Promise<LLMResponse> {
    return retryableRequest(
      () => this.doRequest(options),
      DEFAULT_MAX_RETRIES,
      DEFAULT_RETRY_DELAY_MS,
      'Claude chat completion'
    );
  }

  private async doRequest(options: LLMRequestOptions): Promise<LLMResponse> {
    // Claude Messages API: system 是顶层参数，messages 只含 user/assistant
    const systemMessage = options.messages.find((m) => m.role === 'system');
    const conversationMessages = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const body = JSON.stringify({
      model: options.model ?? this.defaultModel,
      max_tokens: options.maxTokens ?? this.defaultMaxTokens,
      temperature: options.temperature ?? this.defaultTemperature,
      top_p: options.topP,
      stop_sequences: options.stop,
      system: systemMessage?.content,
      messages: conversationMessages,
    });

    const res = await requestUrl({
      url: `${this.baseUrl}/messages`,
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': this.apiVersion,
        'Content-Type': 'application/json',
      },
      body,
    });

    if (res.status !== 200) {
      throw this.handleError(res.status, res.text);
    }

    const json = res.json as ClaudeMessagesResponse;
    const textBlock = json.content?.find(
      (block) => block.type === 'text'
    );

    return {
      content: textBlock?.text ?? '',
      model: json.model ?? this.defaultModel,
      usage: json.usage
        ? {
            promptTokens: json.usage.input_tokens,
            completionTokens: json.usage.output_tokens,
            totalTokens: json.usage.input_tokens + json.usage.output_tokens,
          }
        : undefined,
      finishReason:
        json.stop_reason === 'end_turn'
          ? 'stop'
          : json.stop_reason === 'max_tokens'
            ? 'length'
            : undefined,
    };
  }

  private handleError(status: number, body: string): ServiceError {
    if (status === 401)
      return new ServiceError('Invalid Anthropic API key', ServiceErrorCode.API_KEY_INVALID, {
        statusCode: 401,
        retryable: false,
      });
    if (status === 429)
      return new ServiceError('Anthropic rate limited', ServiceErrorCode.RATE_LIMITED, {
        statusCode: 429,
        retryable: true,
      });
    if (status >= 500)
      return new ServiceError(`Claude server error: ${body}`, ServiceErrorCode.GENERATION_FAILED, {
        statusCode: status,
        retryable: true,
      });
    return new ServiceError(`Claude error (${status}): ${body}`, ServiceErrorCode.GENERATION_FAILED, {
      statusCode: status,
      retryable: false,
    });
  }
}

// ─── Ollama Provider (本地模型) ────────────────────────────────

export class OllamaProvider implements LLMProvider {
  public readonly name = 'Ollama';

  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly defaultTemperature: number;
  private readonly defaultMaxTokens: number;

  constructor(config: LLMServiceConfig) {
    this.baseUrl = (config.baseUrl ?? 'http://localhost:11434').replace(
      /\/$/,
      ''
    );
    this.defaultModel = config.model ?? 'llama3';
    this.defaultTemperature = config.temperature ?? 0.3;
    this.defaultMaxTokens = config.maxTokens ?? 4096;
  }

  async validateConfig(): Promise<boolean> {
    try {
      const res = await requestUrl({
        url: `${this.baseUrl}/api/tags`,
        method: 'GET',
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async chatCompletion(options: LLMRequestOptions): Promise<LLMResponse> {
    return retryableRequest(
      () => this.doRequest(options),
      DEFAULT_MAX_RETRIES,
      DEFAULT_RETRY_DELAY_MS,
      'Ollama chat completion'
    );
  }

  private async doRequest(options: LLMRequestOptions): Promise<LLMResponse> {
    const body = JSON.stringify({
      model: options.model ?? this.defaultModel,
      messages: options.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
      options: {
        temperature: options.temperature ?? this.defaultTemperature,
        num_predict: options.maxTokens ?? this.defaultMaxTokens,
        top_p: options.topP,
        stop: options.stop,
      },
    });

    const res = await requestUrl({
      url: `${this.baseUrl}/api/chat`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (res.status !== 200) {
      throw this.handleError(res.status, res.text);
    }

    const json = res.json as OllamaChatResponse;

    return {
      content: json.message?.content ?? '',
      model: json.model ?? this.defaultModel,
      usage:
        json.prompt_eval_count !== undefined
          ? {
              promptTokens: json.prompt_eval_count ?? 0,
              completionTokens: json.eval_count ?? 0,
              totalTokens:
                (json.prompt_eval_count ?? 0) + (json.eval_count ?? 0),
            }
          : undefined,
      finishReason: json.done ? 'stop' : undefined,
    };
  }

  private handleError(status: number, body: string): ServiceError {
    if (status === 404)
      return new ServiceError('Ollama model not found', ServiceErrorCode.MODEL_NOT_FOUND, {
        statusCode: 404,
        retryable: false,
      });
    if (status >= 500)
      return new ServiceError(`Ollama server error: ${body}`, ServiceErrorCode.GENERATION_FAILED, {
        statusCode: status,
        retryable: true,
      });
    return new ServiceError(`Ollama error (${status}): ${body}`, ServiceErrorCode.GENERATION_FAILED, {
      statusCode: status,
      retryable: false,
    });
  }
}

// ─── 内部 API 响应类型 ────────────────────────────────────────

interface OpenAIChatResponse {
  model: string;
  choices?: Array<{
    message?: { content: string };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface ClaudeMessagesResponse {
  model: string;
  content?: Array<{ type: string; text: string }>;
  stop_reason?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface OllamaChatResponse {
  model: string;
  message?: { content: string };
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

// ─── 工厂函数 ─────────────────────────────────────────────────

/**
 * 根据配置创建 LLM 提供商实例
 */
export function createLLMProvider(config: LLMServiceConfig): LLMProvider {
  switch (config.provider) {
    case 'openai':
      return new OpenAIProvider(config);
    case 'claude':
      return new ClaudeProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    default: {
      const _exhaustive: never = config.provider;
      throw new ServiceError(
        `Unknown LLM provider: ${_exhaustive}`,
        ServiceErrorCode.INVALID_CONFIG
      );
    }
  }
}

// ─── 统一入口函数 ─────────────────────────────────────────────

/**
 * 使用指定 LLM 提供商生成会议纪要
 *
 * @param provider  LLM 提供商实例
 * @param systemPrompt  系统 Prompt
 * @param transcription  转写文本
 * @param options  额外参数
 */
export async function generateSummary(
  provider: LLMProvider,
  systemPrompt: string,
  transcription: string,
  options?: Partial<LLMRequestOptions>
): Promise<LLMResponse> {
  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: transcription },
  ];

  return provider.chatCompletion({
    messages,
    temperature: 0.2,
    ...options,
  });
}

/**
 * 使用指定 LLM 提供商生成会议建议
 *
 * @param provider  LLM 提供商实例
 * @param systemPrompt  系统 Prompt
 * @param summaryText  纪要文本
 * @param options  额外参数
 */
export async function generateAdvice(
  provider: LLMProvider,
  systemPrompt: string,
  summaryText: string,
  options?: Partial<LLMRequestOptions>
): Promise<LLMResponse> {
  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: summaryText },
  ];

  return provider.chatCompletion({
    messages,
    temperature: 0.4,
    ...options,
  });
}
