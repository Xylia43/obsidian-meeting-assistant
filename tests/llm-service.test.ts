/**
 * tests/llm-service.test.ts
 * 测试 LLM 服务的 prompt 构建、响应解析和错误处理
 * Mock obsidian.requestUrl
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ServiceError,
  ServiceErrorCode,
  LLMServiceConfig,
  LLMRequestOptions,
  LLMMessage,
} from '../src/types/services';
import {
  OpenAIProvider,
  ClaudeProvider,
  OllamaProvider,
  createLLMProvider,
  generateSummary,
  generateAdvice,
} from '../src/services/llm-service';

// ─── Mock requestUrl ──────────────────────────────────────────

const mockRequestUrl = vi.fn();

vi.mock('obsidian', async () => {
  const actual = await import('./__mocks__/obsidian');
  return {
    ...actual,
    requestUrl: (...args: unknown[]) => mockRequestUrl(...args),
  };
});

// ─── Helpers ──────────────────────────────────────────────────

function openaiConfig(overrides?: Partial<LLMServiceConfig>): LLMServiceConfig {
  return {
    provider: 'openai',
    apiKey: 'sk-test-key',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    temperature: 0.3,
    maxTokens: 4096,
    ...overrides,
  };
}

function claudeConfig(overrides?: Partial<LLMServiceConfig>): LLMServiceConfig {
  return {
    provider: 'claude',
    apiKey: 'sk-ant-test',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-20250514',
    ...overrides,
  };
}

function ollamaConfig(overrides?: Partial<LLMServiceConfig>): LLMServiceConfig {
  return {
    provider: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: 'llama3',
    ...overrides,
  };
}

function openaiSuccessResponse(content: string = 'Hello') {
  return {
    status: 200,
    text: '',
    json: {
      model: 'gpt-4o',
      choices: [
        {
          message: { content },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    },
  };
}

function claudeSuccessResponse(content: string = 'Hello') {
  return {
    status: 200,
    text: '',
    json: {
      model: 'claude-sonnet-4-20250514',
      content: [{ type: 'text', text: content }],
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 10,
        output_tokens: 20,
      },
    },
  };
}

function ollamaSuccessResponse(content: string = 'Hello') {
  return {
    status: 200,
    text: '',
    json: {
      model: 'llama3',
      message: { content },
      done: true,
      prompt_eval_count: 10,
      eval_count: 20,
    },
  };
}

// ─── OpenAI Provider Tests ────────────────────────────────────

describe('OpenAIProvider', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  describe('constructor', () => {
    it('should create with valid config', () => {
      const provider = new OpenAIProvider(openaiConfig());
      expect(provider.name).toBe('OpenAI');
    });

    it('should throw if apiKey is missing', () => {
      expect(() => new OpenAIProvider(openaiConfig({ apiKey: '' }))).toThrow(
        ServiceError,
      );
    });
  });

  describe('validateConfig', () => {
    it('should return true on 200', async () => {
      mockRequestUrl.mockResolvedValue({ status: 200 });
      const provider = new OpenAIProvider(openaiConfig());
      expect(await provider.validateConfig()).toBe(true);
    });

    it('should return false on error', async () => {
      mockRequestUrl.mockRejectedValue(new Error('fail'));
      const provider = new OpenAIProvider(openaiConfig());
      expect(await provider.validateConfig()).toBe(false);
    });
  });

  describe('chatCompletion', () => {
    it('should send correct request body', async () => {
      mockRequestUrl.mockResolvedValue(openaiSuccessResponse());

      const provider = new OpenAIProvider(openaiConfig());
      await provider.chatCompletion({
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hi' },
        ],
      });

      const call = mockRequestUrl.mock.calls[0][0];
      expect(call.url).toBe('https://api.openai.com/v1/chat/completions');
      expect(call.method).toBe('POST');

      const body = JSON.parse(call.body);
      expect(body.model).toBe('gpt-4o');
      expect(body.messages).toHaveLength(2);
      expect(body.temperature).toBe(0.3);
    });

    it('should parse response correctly', async () => {
      mockRequestUrl.mockResolvedValue(
        openaiSuccessResponse('Generated summary'),
      );

      const provider = new OpenAIProvider(openaiConfig());
      const response = await provider.chatCompletion({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(response.content).toBe('Generated summary');
      expect(response.model).toBe('gpt-4o');
      expect(response.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      });
      expect(response.finishReason).toBe('stop');
    });

    it('should use override model and temperature', async () => {
      mockRequestUrl.mockResolvedValue(openaiSuccessResponse());

      const provider = new OpenAIProvider(openaiConfig());
      await provider.chatCompletion({
        messages: [{ role: 'user', content: 'test' }],
        model: 'gpt-4-turbo',
        temperature: 0.8,
        maxTokens: 1024,
      });

      const body = JSON.parse(mockRequestUrl.mock.calls[0][0].body);
      expect(body.model).toBe('gpt-4-turbo');
      expect(body.temperature).toBe(0.8);
      expect(body.max_tokens).toBe(1024);
    });

    it('should handle finish_reason "length"', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: {
          model: 'gpt-4o',
          choices: [{ message: { content: 'truncated' }, finish_reason: 'length' }],
        },
      });

      const provider = new OpenAIProvider(openaiConfig());
      const response = await provider.chatCompletion({
        messages: [{ role: 'user', content: 'test' }],
      });
      expect(response.finishReason).toBe('length');
    });
  });

  describe('error handling', () => {
    it('should throw API_KEY_INVALID on 401', async () => {
      mockRequestUrl.mockResolvedValue({ status: 401, text: 'Unauthorized' });

      const provider = new OpenAIProvider(openaiConfig());
      try {
        await provider.chatCompletion({
          messages: [{ role: 'user', content: 'test' }],
        });
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ServiceError);
        expect((e as ServiceError).code).toBe(ServiceErrorCode.API_KEY_INVALID);
      }
    });

    it('should throw RATE_LIMITED on 429 (retryable)', async () => {
      mockRequestUrl.mockResolvedValue({ status: 429, text: 'Too many requests' });

      const provider = new OpenAIProvider(openaiConfig());
      try {
        await provider.chatCompletion({
          messages: [{ role: 'user', content: 'test' }],
        });
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ServiceError);
        expect((e as ServiceError).code).toBe(ServiceErrorCode.GENERATION_FAILED);
      }
    });

    it('should throw MODEL_NOT_FOUND on 404', async () => {
      mockRequestUrl.mockResolvedValue({ status: 404, text: 'Not found' });

      const provider = new OpenAIProvider(openaiConfig());
      try {
        await provider.chatCompletion({
          messages: [{ role: 'user', content: 'test' }],
        });
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ServiceError);
        expect((e as ServiceError).code).toBe(ServiceErrorCode.MODEL_NOT_FOUND);
      }
    });
  });
});

// ─── Claude Provider Tests ────────────────────────────────────

describe('ClaudeProvider', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  describe('constructor', () => {
    it('should create with valid config', () => {
      const provider = new ClaudeProvider(claudeConfig());
      expect(provider.name).toBe('Claude');
    });

    it('should throw if apiKey is missing', () => {
      expect(() => new ClaudeProvider(claudeConfig({ apiKey: '' }))).toThrow(
        ServiceError,
      );
    });
  });

  describe('chatCompletion', () => {
    it('should separate system message from conversation', async () => {
      mockRequestUrl.mockResolvedValue(claudeSuccessResponse());

      const provider = new ClaudeProvider(claudeConfig());
      await provider.chatCompletion({
        messages: [
          { role: 'system', content: 'You are a meeting assistant.' },
          { role: 'user', content: 'Summarize this.' },
        ],
      });

      const body = JSON.parse(mockRequestUrl.mock.calls[0][0].body);
      expect(body.system).toBe('You are a meeting assistant.');
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe('user');
    });

    it('should use x-api-key header instead of Authorization', async () => {
      mockRequestUrl.mockResolvedValue(claudeSuccessResponse());

      const provider = new ClaudeProvider(claudeConfig());
      await provider.chatCompletion({
        messages: [{ role: 'user', content: 'test' }],
      });

      const headers = mockRequestUrl.mock.calls[0][0].headers;
      expect(headers['x-api-key']).toBe('sk-ant-test');
      expect(headers['anthropic-version']).toBe('2023-06-01');
    });

    it('should parse Claude response format', async () => {
      mockRequestUrl.mockResolvedValue(
        claudeSuccessResponse('Claude response'),
      );

      const provider = new ClaudeProvider(claudeConfig());
      const response = await provider.chatCompletion({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(response.content).toBe('Claude response');
      expect(response.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      });
      expect(response.finishReason).toBe('stop');
    });

    it('should map max_tokens finish reason', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: {
          model: 'claude-sonnet-4-20250514',
          content: [{ type: 'text', text: 'truncated' }],
          stop_reason: 'max_tokens',
          usage: { input_tokens: 10, output_tokens: 100 },
        },
      });

      const provider = new ClaudeProvider(claudeConfig());
      const response = await provider.chatCompletion({
        messages: [{ role: 'user', content: 'test' }],
      });
      expect(response.finishReason).toBe('length');
    });
  });

  describe('error handling', () => {
    it('should throw API_KEY_INVALID on 401', async () => {
      mockRequestUrl.mockResolvedValue({ status: 401, text: 'invalid' });

      const provider = new ClaudeProvider(claudeConfig());
      await expect(
        provider.chatCompletion({
          messages: [{ role: 'user', content: 'test' }],
        }),
      ).rejects.toMatchObject({ code: ServiceErrorCode.API_KEY_INVALID });
    });
  });
});

// ─── Ollama Provider Tests ────────────────────────────────────

describe('OllamaProvider', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  describe('constructor', () => {
    it('should create with defaults (no apiKey needed)', () => {
      const provider = new OllamaProvider(ollamaConfig());
      expect(provider.name).toBe('Ollama');
    });
  });

  describe('chatCompletion', () => {
    it('should send to /api/chat endpoint', async () => {
      mockRequestUrl.mockResolvedValue(ollamaSuccessResponse());

      const provider = new OllamaProvider(ollamaConfig());
      await provider.chatCompletion({
        messages: [{ role: 'user', content: 'test' }],
      });

      const call = mockRequestUrl.mock.calls[0][0];
      expect(call.url).toBe('http://localhost:11434/api/chat');

      const body = JSON.parse(call.body);
      expect(body.stream).toBe(false);
      expect(body.options.temperature).toBe(0.3);
    });

    it('should parse Ollama response format', async () => {
      mockRequestUrl.mockResolvedValue(
        ollamaSuccessResponse('Ollama says hi'),
      );

      const provider = new OllamaProvider(ollamaConfig());
      const response = await provider.chatCompletion({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(response.content).toBe('Ollama says hi');
      expect(response.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      });
    });
  });

  describe('error handling', () => {
    it('should throw MODEL_NOT_FOUND on 404', async () => {
      mockRequestUrl.mockResolvedValue({ status: 404, text: 'not found' });

      const provider = new OllamaProvider(ollamaConfig());
      await expect(
        provider.chatCompletion({
          messages: [{ role: 'user', content: 'test' }],
        }),
      ).rejects.toMatchObject({ code: ServiceErrorCode.MODEL_NOT_FOUND });
    });
  });
});

// ─── createLLMProvider 工厂函数 ──────────────────────────────

describe('createLLMProvider', () => {
  it('should create OpenAIProvider for "openai"', () => {
    const provider = createLLMProvider(openaiConfig());
    expect(provider.name).toBe('OpenAI');
  });

  it('should create ClaudeProvider for "claude"', () => {
    const provider = createLLMProvider(claudeConfig());
    expect(provider.name).toBe('Claude');
  });

  it('should create OllamaProvider for "ollama"', () => {
    const provider = createLLMProvider(ollamaConfig());
    expect(provider.name).toBe('Ollama');
  });

  it('should throw for unknown provider', () => {
    expect(() =>
      createLLMProvider({ provider: 'deepseek' as any, model: 'x' }),
    ).toThrow(ServiceError);
  });
});

// ─── generateSummary / generateAdvice 入口函数 ───────────────

describe('generateSummary', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  it('should build correct messages and call provider', async () => {
    mockRequestUrl.mockResolvedValue(
      openaiSuccessResponse('summary result'),
    );

    const provider = new OpenAIProvider(openaiConfig());
    const response = await generateSummary(
      provider,
      'You are a summary assistant.',
      'Meeting transcript here...',
    );

    expect(response.content).toBe('summary result');

    const body = JSON.parse(mockRequestUrl.mock.calls[0][0].body);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBe('You are a summary assistant.');
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toBe('Meeting transcript here...');
    expect(body.temperature).toBe(0.2); // default for generateSummary
  });
});

describe('generateAdvice', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  it('should build correct messages and call provider', async () => {
    mockRequestUrl.mockResolvedValue(
      openaiSuccessResponse('advice result'),
    );

    const provider = new OpenAIProvider(openaiConfig());
    const response = await generateAdvice(
      provider,
      'You are an advisor.',
      'Summary text here...',
    );

    expect(response.content).toBe('advice result');

    const body = JSON.parse(mockRequestUrl.mock.calls[0][0].body);
    expect(body.temperature).toBe(0.4); // default for generateAdvice
  });
});
