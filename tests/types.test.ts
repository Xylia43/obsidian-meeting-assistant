/**
 * tests/types.test.ts
 * 测试类型定义、枚举值和默认设置
 */
import { describe, it, expect } from 'vitest';
import {
  RecordingState,
  AudioFormat,
  DEFAULT_SETTINGS,
  MeetingAssistantSettings,
} from '../src/types';
import {
  ServiceError,
  ServiceErrorCode,
} from '../src/types/services';

// ─── RecordingState 枚举 ──────────────────────────────────────

describe('RecordingState', () => {
  it('should have correct enum values', () => {
    expect(RecordingState.IDLE).toBe('idle');
    expect(RecordingState.RECORDING).toBe('recording');
    expect(RecordingState.PAUSED).toBe('paused');
    expect(RecordingState.STOPPING).toBe('stopping');
  });

  it('should have exactly 4 states', () => {
    const values = Object.values(RecordingState);
    expect(values).toHaveLength(4);
  });
});

// ─── AudioFormat 枚举 ─────────────────────────────────────────

describe('AudioFormat', () => {
  it('should have correct MIME types', () => {
    expect(AudioFormat.WEBM_OPUS).toBe('audio/webm;codecs=opus');
    expect(AudioFormat.WEBM).toBe('audio/webm');
  });
});

// ─── DEFAULT_SETTINGS ─────────────────────────────────────────

describe('DEFAULT_SETTINGS', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_SETTINGS.audioFolder).toBe('meeting-recordings');
    expect(DEFAULT_SETTINGS.notesFolder).toBe('meeting-notes');
    expect(DEFAULT_SETTINGS.audioBitsPerSecond).toBe(128000);
    expect(DEFAULT_SETTINGS.autoCreateNote).toBe(true);
  });

  it('should have correct STT default values', () => {
    expect(DEFAULT_SETTINGS.sttProvider).toBe('moonshine');
    expect(DEFAULT_SETTINGS.sttApiKey).toBe('');
    expect(DEFAULT_SETTINGS.sttBaseUrl).toBe('http://localhost:8765');
    expect(DEFAULT_SETTINGS.sttLanguage).toBe('');
    expect(DEFAULT_SETTINGS.enableDiarization).toBe(false);
  });

  it('should have correct LLM default values', () => {
    expect(DEFAULT_SETTINGS.llmProvider).toBe('openai');
    expect(DEFAULT_SETTINGS.llmApiKey).toBe('');
    expect(DEFAULT_SETTINGS.llmBaseUrl).toBe('https://api.openai.com/v1');
    expect(DEFAULT_SETTINGS.llmModel).toBe('gpt-4o');
  });

  it('should have correct flow control default values', () => {
    expect(DEFAULT_SETTINGS.autoTranscribe).toBe(true);
    expect(DEFAULT_SETTINGS.autoSummarize).toBe(true);
  });

  it('should be a valid MeetingAssistantSettings object', () => {
    const settings: MeetingAssistantSettings = DEFAULT_SETTINGS;
    expect(settings).toBeDefined();
    expect(typeof settings.audioFolder).toBe('string');
    expect(typeof settings.notesFolder).toBe('string');
    expect(typeof settings.audioBitsPerSecond).toBe('number');
    expect(typeof settings.autoCreateNote).toBe('boolean');
    expect(typeof settings.sttProvider).toBe('string');
    expect(typeof settings.sttApiKey).toBe('string');
    expect(typeof settings.llmProvider).toBe('string');
    expect(typeof settings.llmApiKey).toBe('string');
    expect(typeof settings.autoTranscribe).toBe('boolean');
    expect(typeof settings.autoSummarize).toBe('boolean');
  });

  it('should have reasonable audio bitrate', () => {
    // 典型范围: 32000 - 320000
    expect(DEFAULT_SETTINGS.audioBitsPerSecond).toBeGreaterThanOrEqual(32000);
    expect(DEFAULT_SETTINGS.audioBitsPerSecond).toBeLessThanOrEqual(320000);
  });
});

// ─── ServiceError ─────────────────────────────────────────────

describe('ServiceError', () => {
  it('should create error with default code', () => {
    const err = new ServiceError('test error');
    expect(err.message).toBe('test error');
    expect(err.code).toBe(ServiceErrorCode.UNKNOWN);
    expect(err.retryable).toBe(false);
    expect(err.name).toBe('ServiceError');
  });

  it('should create error with specific code and options', () => {
    const cause = new Error('root cause');
    const err = new ServiceError(
      'rate limited',
      ServiceErrorCode.RATE_LIMITED,
      { statusCode: 429, retryable: true, cause }
    );
    expect(err.code).toBe(ServiceErrorCode.RATE_LIMITED);
    expect(err.statusCode).toBe(429);
    expect(err.retryable).toBe(true);
    expect(err.cause).toBe(cause);
  });

  it('should be an instance of Error', () => {
    const err = new ServiceError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ServiceError);
  });

  it('should default retryable to false', () => {
    const err = new ServiceError('test', ServiceErrorCode.API_KEY_INVALID, {
      statusCode: 401,
    });
    expect(err.retryable).toBe(false);
  });
});

// ─── ServiceErrorCode 枚举 ───────────────────────────────────

describe('ServiceErrorCode', () => {
  it('should have all expected error codes', () => {
    const codes = Object.values(ServiceErrorCode);
    expect(codes).toContain('UNKNOWN');
    expect(codes).toContain('NETWORK_ERROR');
    expect(codes).toContain('TIMEOUT');
    expect(codes).toContain('INVALID_CONFIG');
    expect(codes).toContain('AUDIO_TOO_LARGE');
    expect(codes).toContain('UNSUPPORTED_FORMAT');
    expect(codes).toContain('TRANSCRIPTION_FAILED');
    expect(codes).toContain('API_KEY_INVALID');
    expect(codes).toContain('RATE_LIMITED');
    expect(codes).toContain('CONTEXT_TOO_LONG');
    expect(codes).toContain('MODEL_NOT_FOUND');
    expect(codes).toContain('GENERATION_FAILED');
  });
});
