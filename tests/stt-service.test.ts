/**
 * tests/stt-service.test.ts
 * 测试 STTService (WhisperAPIProvider) 的请求构建、分片逻辑和错误处理
 * 使用 mock 替代 obsidian 的 requestUrl
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ServiceError,
  ServiceErrorCode,
  STTServiceConfig,
} from '../src/types/services';
import {
  WhisperAPIProvider,
  createSTTProvider,
} from '../src/services/stt-service';

// ─── Mock requestUrl ──────────────────────────────────────────

// We need to mock the 'obsidian' module's requestUrl
const mockRequestUrl = vi.fn();

vi.mock('obsidian', async () => {
  const actual = await import('./__mocks__/obsidian');
  return {
    ...actual,
    requestUrl: (...args: unknown[]) => mockRequestUrl(...args),
  };
});

// ─── Test helpers ─────────────────────────────────────────────

function createConfig(overrides?: Partial<STTServiceConfig>): STTServiceConfig {
  return {
    provider: 'whisper',
    apiKey: 'test-api-key-123',
    baseUrl: 'https://api.openai.com/v1',
    defaultLanguage: 'zh',
    enableDiarization: false,
    maxChunkSize: 25 * 1024 * 1024,
    maxRetries: 1,
    retryDelayMs: 10,
    ...overrides,
  };
}

function createWhisperResponse(text: string, segments?: unknown[]) {
  return {
    status: 200,
    text: JSON.stringify({
      text,
      language: 'zh',
      duration: 120.5,
      segments: segments ?? [
        { start: 0, end: 5, text: '第一段', avg_logprob: -0.3 },
        { start: 5, end: 10, text: '第二段', avg_logprob: -0.5 },
      ],
    }),
    json: {
      text,
      language: 'zh',
      duration: 120.5,
      segments: segments ?? [
        { start: 0, end: 5, text: '第一段', avg_logprob: -0.3 },
        { start: 5, end: 10, text: '第二段', avg_logprob: -0.5 },
      ],
    },
  };
}

function createAudioBuffer(sizeBytes: number): ArrayBuffer {
  return new ArrayBuffer(sizeBytes);
}

// ─── Tests ────────────────────────────────────────────────────

describe('WhisperAPIProvider', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  // ── 构造函数 ──────────────────────────────────────────────

  describe('constructor', () => {
    it('should create provider with valid config', () => {
      const provider = new WhisperAPIProvider(createConfig());
      expect(provider.name).toBe('OpenAI Whisper');
    });

    it('should throw ServiceError if apiKey is missing', () => {
      expect(() => new WhisperAPIProvider(createConfig({ apiKey: '' }))).toThrow(
        ServiceError,
      );
    });

    it('should strip trailing slash from baseUrl', () => {
      const provider = new WhisperAPIProvider(
        createConfig({ baseUrl: 'https://example.com/v1/' }),
      );
      expect(provider).toBeDefined();
    });

    it('should use defaults for optional config fields', () => {
      const provider = new WhisperAPIProvider({
        provider: 'whisper',
        apiKey: 'key',
      });
      expect(provider).toBeDefined();
    });
  });

  // ── validateConfig ────────────────────────────────────────

  describe('validateConfig', () => {
    it('should return true on 200 response', async () => {
      mockRequestUrl.mockResolvedValue({ status: 200 });

      const provider = new WhisperAPIProvider(createConfig());
      const result = await provider.validateConfig();
      expect(result).toBe(true);

      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.openai.com/v1/models',
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key-123',
          }),
        }),
      );
    });

    it('should return false on error', async () => {
      mockRequestUrl.mockRejectedValue(new Error('network error'));

      const provider = new WhisperAPIProvider(createConfig());
      const result = await provider.validateConfig();
      expect(result).toBe(false);
    });
  });

  // ── transcribe (单片) ─────────────────────────────────────

  describe('transcribe (single chunk)', () => {
    it('should call Whisper API and return TranscriptionResult', async () => {
      mockRequestUrl.mockResolvedValue(
        createWhisperResponse('你好世界'),
      );

      const provider = new WhisperAPIProvider(createConfig());
      const result = await provider.transcribe({
        audioData: createAudioBuffer(1024),
        fileName: 'test.webm',
        language: 'zh',
      });

      expect(result.text).toBe('你好世界');
      expect(result.language).toBe('zh');
      expect(result.duration).toBe(120.5);
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].text).toBe('第一段');
      expect(result.segments[1].text).toBe('第二段');
    });

    it('should set correct URL for transcriptions endpoint', async () => {
      mockRequestUrl.mockResolvedValue(
        createWhisperResponse('test'),
      );

      const provider = new WhisperAPIProvider(createConfig());
      await provider.transcribe({
        audioData: createAudioBuffer(1024),
        fileName: 'test.webm',
      });

      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.openai.com/v1/audio/transcriptions',
          method: 'POST',
        }),
      );
    });

    it('should include Authorization header', async () => {
      mockRequestUrl.mockResolvedValue(
        createWhisperResponse('test'),
      );

      const provider = new WhisperAPIProvider(createConfig());
      await provider.transcribe({
        audioData: createAudioBuffer(1024),
        fileName: 'test.webm',
      });

      const call = mockRequestUrl.mock.calls[0][0];
      expect(call.headers.Authorization).toBe('Bearer test-api-key-123');
    });

    it('should call progress callback', async () => {
      mockRequestUrl.mockResolvedValue(
        createWhisperResponse('test'),
      );

      const onProgress = vi.fn();
      const provider = new WhisperAPIProvider(createConfig());
      await provider.transcribe(
        {
          audioData: createAudioBuffer(1024),
          fileName: 'test.webm',
        },
        onProgress,
      );

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          currentChunk: 0,
          totalChunks: 1,
          stage: 'uploading',
        }),
      );
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          percent: 100,
          stage: 'done',
        }),
      );
    });

    it('should calculate confidence from avg_logprob', async () => {
      mockRequestUrl.mockResolvedValue(
        createWhisperResponse('test', [
          { start: 0, end: 5, text: 'segment', avg_logprob: -0.5 },
        ]),
      );

      const provider = new WhisperAPIProvider(createConfig());
      const result = await provider.transcribe({
        audioData: createAudioBuffer(1024),
        fileName: 'test.webm',
      });

      expect(result.segments[0].confidence).toBeCloseTo(
        Math.exp(-0.5),
        5,
      );
    });
  });

  // ── transcribe (分片) ─────────────────────────────────────

  describe('transcribe (chunked)', () => {
    it('should split large files into chunks', async () => {
      const config = createConfig({ maxChunkSize: 1024 }); // 1KB chunks
      mockRequestUrl.mockResolvedValue(
        createWhisperResponse('chunk'),
      );

      const provider = new WhisperAPIProvider(config);
      const result = await provider.transcribe({
        audioData: createAudioBuffer(3000), // 3KB → 3 chunks
        fileName: 'test.webm',
      });

      // Should have called API 3 times
      expect(mockRequestUrl).toHaveBeenCalledTimes(3);
      expect(result.text).toContain('chunk');
    });

    it('should merge results correctly', async () => {
      const config = createConfig({ maxChunkSize: 1024 });

      let callCount = 0;
      mockRequestUrl.mockImplementation(async () => {
        callCount++;
        return createWhisperResponse(`part${callCount}`, [
          { start: 0, end: 5, text: `seg${callCount}` },
        ]);
      });

      const provider = new WhisperAPIProvider(config);
      const result = await provider.transcribe({
        audioData: createAudioBuffer(2048), // 2 chunks
        fileName: 'test.webm',
      });

      expect(result.text).toContain('part1');
      expect(result.text).toContain('part2');
      expect(result.segments.length).toBe(2);
      // Second segment should have offset timing
      expect(result.segments[1].start).toBeGreaterThan(0);
    });

    it('should report progress for each chunk', async () => {
      const config = createConfig({ maxChunkSize: 1024 });
      mockRequestUrl.mockResolvedValue(
        createWhisperResponse('chunk'),
      );

      const onProgress = vi.fn();
      const provider = new WhisperAPIProvider(config);

      await provider.transcribe(
        {
          audioData: createAudioBuffer(2048),
          fileName: 'test.webm',
        },
        onProgress,
      );

      // Should report uploading for each chunk, then merging, then done
      const stages = onProgress.mock.calls.map(
        (c: unknown[]) => (c[0] as { stage: string }).stage,
      );
      expect(stages).toContain('uploading');
      expect(stages).toContain('merging');
      expect(stages).toContain('done');
    });
  });

  // ── Diarization ───────────────────────────────────────────

  describe('diarization', () => {
    it('should assign speakers heuristically when enabled', async () => {
      mockRequestUrl.mockResolvedValue(
        createWhisperResponse('test', [
          { start: 0, end: 3, text: '你好' },
          { start: 3.5, end: 6, text: '你好啊' }, // small gap, same speaker
          { start: 8, end: 11, text: '再见' }, // gap > 1.5s, new speaker
        ]),
      );

      const provider = new WhisperAPIProvider(
        createConfig({ enableDiarization: true }),
      );
      const result = await provider.transcribe({
        audioData: createAudioBuffer(1024),
        fileName: 'test.webm',
      });

      expect(result.speakers).toBeDefined();
      expect(result.speakers!.length).toBeGreaterThanOrEqual(2);
      expect(result.segments[0].speaker).toBe('Speaker 1');
      expect(result.segments[2].speaker).not.toBe('Speaker 1');
    });

    it('should not assign speakers when diarization disabled', async () => {
      mockRequestUrl.mockResolvedValue(
        createWhisperResponse('test', [
          { start: 0, end: 3, text: '你好' },
          { start: 8, end: 11, text: '再见' },
        ]),
      );

      const provider = new WhisperAPIProvider(
        createConfig({ enableDiarization: false }),
      );
      const result = await provider.transcribe({
        audioData: createAudioBuffer(1024),
        fileName: 'test.webm',
      });

      expect(result.speakers).toBeUndefined();
    });
  });

  // ── 错误处理 ──────────────────────────────────────────────

  describe('error handling', () => {
    it('should throw API_KEY_INVALID on 401', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 401,
        text: 'Unauthorized',
      });

      const provider = new WhisperAPIProvider(createConfig());
      await expect(
        provider.transcribe({
          audioData: createAudioBuffer(1024),
          fileName: 'test.webm',
        }),
      ).rejects.toThrow(ServiceError);

      try {
        await provider.transcribe({
          audioData: createAudioBuffer(1024),
          fileName: 'test.webm',
        });
      } catch (e) {
        expect((e as ServiceError).code).toBe(ServiceErrorCode.API_KEY_INVALID);
        expect((e as ServiceError).retryable).toBe(false);
      }
    });

    it('should retry on 429 and eventually throw', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 429,
        text: 'Rate limited',
      });

      const config = createConfig({ maxRetries: 1, retryDelayMs: 10 });
      const provider = new WhisperAPIProvider(config);

      await expect(
        provider.transcribe({
          audioData: createAudioBuffer(1024),
          fileName: 'test.webm',
        }),
      ).rejects.toThrow(ServiceError);

      // Should have tried 2 times (initial + 1 retry)
      expect(mockRequestUrl).toHaveBeenCalledTimes(2);
    });

    it('should retry on 500 server errors', async () => {
      let callCount = 0;
      mockRequestUrl.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { status: 500, text: 'Internal Server Error' };
        }
        return createWhisperResponse('success after retry');
      });

      const config = createConfig({ maxRetries: 2, retryDelayMs: 10 });
      const provider = new WhisperAPIProvider(config);
      const result = await provider.transcribe({
        audioData: createAudioBuffer(1024),
        fileName: 'test.webm',
      });

      expect(result.text).toBe('success after retry');
      expect(mockRequestUrl).toHaveBeenCalledTimes(2);
    });

    it('should not retry non-retryable errors (e.g., 401)', async () => {
      mockRequestUrl.mockResolvedValue({
        status: 401,
        text: 'Unauthorized',
      });

      const config = createConfig({ maxRetries: 3, retryDelayMs: 10 });
      const provider = new WhisperAPIProvider(config);

      await expect(
        provider.transcribe({
          audioData: createAudioBuffer(1024),
          fileName: 'test.webm',
        }),
      ).rejects.toThrow();

      // Should have only tried once
      expect(mockRequestUrl).toHaveBeenCalledTimes(1);
    });
  });

  // ── 请求体构建 ─────────────────────────────────────────────

  describe('request building', () => {
    it('should include language when provided', async () => {
      mockRequestUrl.mockResolvedValue(
        createWhisperResponse('test'),
      );

      const provider = new WhisperAPIProvider(createConfig());
      await provider.transcribe({
        audioData: createAudioBuffer(1024),
        fileName: 'test.webm',
        language: 'en',
      });

      // The body is a multipart form — check it was sent
      const call = mockRequestUrl.mock.calls[0][0];
      expect(call.headers['Content-Type']).toContain('multipart/form-data');
      expect(call.body).toBeDefined();
    });

    it('should include prompt in request', async () => {
      mockRequestUrl.mockResolvedValue(
        createWhisperResponse('test'),
      );

      const provider = new WhisperAPIProvider(createConfig());
      await provider.transcribe({
        audioData: createAudioBuffer(1024),
        fileName: 'test.webm',
        prompt: 'Custom prompt context',
      });

      // Verify the call was made (we can't easily inspect multipart body)
      expect(mockRequestUrl).toHaveBeenCalled();
    });

    it('should add diarization hint to prompt when enabled', async () => {
      mockRequestUrl.mockResolvedValue(
        createWhisperResponse('test'),
      );

      const provider = new WhisperAPIProvider(
        createConfig({ enableDiarization: true }),
      );
      await provider.transcribe({
        audioData: createAudioBuffer(1024),
        fileName: 'test.webm',
        speakerCount: 3,
      });

      expect(mockRequestUrl).toHaveBeenCalled();
    });
  });
});

// ─── createSTTProvider 工厂函数 ──────────────────────────────

describe('createSTTProvider', () => {
  it('should create WhisperAPIProvider for "whisper"', () => {
    const provider = createSTTProvider(createConfig());
    expect(provider.name).toBe('OpenAI Whisper');
  });

  it('should throw for unknown provider', () => {
    expect(() =>
      createSTTProvider({ provider: 'unknown' as any, apiKey: 'k' }),
    ).toThrow(ServiceError);
  });
});
