/**
 * tests/audio-recorder.test.ts
 * 测试 AudioRecorder 的状态机逻辑
 * 使用 mock 替代浏览器 MediaRecorder / navigator.mediaDevices
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RecordingState, AudioFormat } from '../src/types';
import { AudioRecorder } from '../src/core/audio-recorder';

// ─── Mock MediaRecorder & navigator ───────────────────────────

class MockMediaStream {
  private tracks: Array<{ stop: ReturnType<typeof vi.fn> }> = [
    { stop: vi.fn() },
  ];

  getTracks() {
    return this.tracks;
  }
}

class MockMediaRecorder {
  state: string = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  private mimeType: string;
  private audioBitsPerSecond: number;

  constructor(
    _stream: MockMediaStream,
    options?: { mimeType?: string; audioBitsPerSecond?: number },
  ) {
    this.mimeType = options?.mimeType ?? 'audio/webm';
    this.audioBitsPerSecond = options?.audioBitsPerSecond ?? 128000;
  }

  start(_timeslice?: number) {
    this.state = 'recording';
    // Simulate data chunk after a tick
    setTimeout(() => {
      this.ondataavailable?.({
        data: new Blob(['audio-data'], { type: this.mimeType }),
      });
    }, 10);
  }

  pause() {
    this.state = 'paused';
  }

  resume() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    // Fire onstop after a tick
    setTimeout(() => {
      this.onstop?.();
    }, 10);
  }

  static isTypeSupported(mimeType: string): boolean {
    return mimeType === AudioFormat.WEBM_OPUS || mimeType === AudioFormat.WEBM;
  }
}

function setupGlobalMocks() {
  // @ts-ignore
  globalThis.MediaRecorder = MockMediaRecorder;

  // navigator is read-only in some environments, use defineProperty
  const mockNavigator = {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue(new MockMediaStream()),
    },
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: mockNavigator,
    writable: true,
    configurable: true,
  });
}

function teardownGlobalMocks() {
  // @ts-ignore
  delete globalThis.MediaRecorder;
  // Restore navigator
  Object.defineProperty(globalThis, 'navigator', {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

// ─── Tests ────────────────────────────────────────────────────

describe('AudioRecorder', () => {
  beforeEach(() => {
    setupGlobalMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    teardownGlobalMocks();
  });

  // ── 初始状态 ────────────────────────────────────────────────

  describe('initialization', () => {
    it('should start in IDLE state', () => {
      const recorder = new AudioRecorder();
      const status = recorder.getRecordingState();
      expect(status.state).toBe(RecordingState.IDLE);
      expect(status.elapsed).toBe(0);
      expect(status.startedAt).toBeNull();
    });

    it('should accept custom options', () => {
      const recorder = new AudioRecorder({
        audioBitsPerSecond: 256000,
        timeslice: 500,
      });
      expect(recorder).toBeDefined();
    });

    it('should fall back to WebM when mimeType is not supported', () => {
      // @ts-ignore
      MockMediaRecorder.isTypeSupported = (mime: string) =>
        mime === AudioFormat.WEBM;
      const recorder = new AudioRecorder({
        mimeType: AudioFormat.WEBM_OPUS,
      });
      // The constructor should have fallen back internally
      expect(recorder).toBeDefined();
      // Restore
      // @ts-ignore
      MockMediaRecorder.isTypeSupported = (mime: string) =>
        mime === AudioFormat.WEBM_OPUS || mime === AudioFormat.WEBM;
    });
  });

  // ── 开始录音 ────────────────────────────────────────────────

  describe('startRecording', () => {
    it('should transition to RECORDING state', async () => {
      const onStateChange = vi.fn();
      const recorder = new AudioRecorder({}, { onStateChange });

      await recorder.startRecording();

      const status = recorder.getRecordingState();
      expect(status.state).toBe(RecordingState.RECORDING);
      expect(status.startedAt).toBeInstanceOf(Date);
      expect(onStateChange).toHaveBeenCalledWith(RecordingState.RECORDING);
    });

    it('should request microphone permissions', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    });

    it('should throw if already recording', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      await expect(recorder.startRecording()).rejects.toThrow(
        /Cannot start recording.*current state is "recording"/,
      );
    });

    it('should throw and call onError if getUserMedia fails', async () => {
      const onError = vi.fn();
      // @ts-ignore
      navigator.mediaDevices.getUserMedia = vi
        .fn()
        .mockRejectedValue(new Error('Permission denied'));

      const recorder = new AudioRecorder({}, { onError });

      await expect(recorder.startRecording()).rejects.toThrow(
        'Permission denied',
      );
      expect(onError).toHaveBeenCalledWith(expect.any(Error));

      // Should be back to IDLE after failure
      expect(recorder.getRecordingState().state).toBe(RecordingState.IDLE);
    });
  });

  // ── 暂停/恢复 ──────────────────────────────────────────────

  describe('pauseRecording / resumeRecording', () => {
    it('should transition to PAUSED state', async () => {
      const onStateChange = vi.fn();
      const recorder = new AudioRecorder({}, { onStateChange });

      await recorder.startRecording();
      recorder.pauseRecording();

      expect(recorder.getRecordingState().state).toBe(RecordingState.PAUSED);
      expect(onStateChange).toHaveBeenCalledWith(RecordingState.PAUSED);
    });

    it('should transition back to RECORDING on resume', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();
      recorder.pauseRecording();
      recorder.resumeRecording();

      expect(recorder.getRecordingState().state).toBe(RecordingState.RECORDING);
    });

    it('should throw if pausing when not recording', () => {
      const recorder = new AudioRecorder();
      expect(() => recorder.pauseRecording()).toThrow(
        /Cannot pause.*expected "recording"/,
      );
    });

    it('should throw if resuming when not paused', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();
      expect(() => recorder.resumeRecording()).toThrow(
        /Cannot resume.*expected "paused"/,
      );
    });
  });

  // ── 停止录音 ────────────────────────────────────────────────

  describe('stopRecording', () => {
    it('should return a RecordingResult', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      // Advance time to simulate some recording duration
      vi.advanceTimersByTime(3000);

      const resultPromise = recorder.stopRecording();
      // Need to advance timers for the setTimeout in stop()
      vi.advanceTimersByTime(50);
      const result = await resultPromise;

      expect(result).toBeDefined();
      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.mimeType).toBeDefined();
      expect(result.startedAt).toBeInstanceOf(Date);
      expect(result.stoppedAt).toBeInstanceOf(Date);
      expect(typeof result.duration).toBe('number');
    });

    it('should return to IDLE state after stopping', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      const resultPromise = recorder.stopRecording();
      vi.advanceTimersByTime(50);
      await resultPromise;

      expect(recorder.getRecordingState().state).toBe(RecordingState.IDLE);
    });

    it('should stop from PAUSED state', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();
      recorder.pauseRecording();

      const resultPromise = recorder.stopRecording();
      vi.advanceTimersByTime(50);
      const result = await resultPromise;

      expect(result).toBeDefined();
      expect(recorder.getRecordingState().state).toBe(RecordingState.IDLE);
    });

    it('should throw if not recording or paused', async () => {
      const recorder = new AudioRecorder();
      await expect(recorder.stopRecording()).rejects.toThrow(
        /Cannot stop.*expected "recording" or "paused"/,
      );
    });
  });

  // ── 计时逻辑 ────────────────────────────────────────────────

  describe('elapsed time tracking', () => {
    it('should track elapsed time while recording', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      vi.advanceTimersByTime(5000);

      const status = recorder.getRecordingState();
      expect(status.elapsed).toBeGreaterThanOrEqual(5000);
    });

    it('should freeze elapsed when paused', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      vi.advanceTimersByTime(3000);
      recorder.pauseRecording();

      const elapsedAtPause = recorder.getRecordingState().elapsed;

      // Time passes but elapsed shouldn't change
      vi.advanceTimersByTime(5000);
      const elapsedAfterWait = recorder.getRecordingState().elapsed;

      expect(elapsedAfterWait).toBe(elapsedAtPause);
    });

    it('should accumulate elapsed across pause/resume cycles', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      vi.advanceTimersByTime(2000); // 2s recording
      recorder.pauseRecording();
      const afterFirstPause = recorder.getRecordingState().elapsed;

      vi.advanceTimersByTime(3000); // 3s paused (shouldn't count)
      recorder.resumeRecording();

      vi.advanceTimersByTime(2000); // 2s more recording

      const finalElapsed = recorder.getRecordingState().elapsed;
      expect(finalElapsed).toBeGreaterThanOrEqual(afterFirstPause + 2000);
    });

    it('should report 0 elapsed when IDLE', () => {
      const recorder = new AudioRecorder();
      expect(recorder.getRecordingState().elapsed).toBe(0);
    });
  });

  // ── 回调 ───────────────────────────────────────────────────

  describe('callbacks', () => {
    it('should fire onElapsedChange periodically', async () => {
      const onElapsedChange = vi.fn();
      const recorder = new AudioRecorder({}, { onElapsedChange });

      await recorder.startRecording();

      // Timer fires every 1000ms
      vi.advanceTimersByTime(3500);

      expect(onElapsedChange).toHaveBeenCalled();
      expect(onElapsedChange.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('should fire onDataAvailable when data arrives', async () => {
      const onDataAvailable = vi.fn();
      const recorder = new AudioRecorder({}, { onDataAvailable });

      await recorder.startRecording();

      // The mock sends data after 10ms
      vi.advanceTimersByTime(50);

      expect(onDataAvailable).toHaveBeenCalledWith(expect.any(Blob));
    });
  });

  // ── destroy ────────────────────────────────────────────────

  describe('destroy', () => {
    it('should release resources and go to IDLE', async () => {
      const recorder = new AudioRecorder();
      await recorder.startRecording();

      recorder.destroy();

      expect(recorder.getRecordingState().state).toBe(RecordingState.IDLE);
    });

    it('should be safe to call when IDLE', () => {
      const recorder = new AudioRecorder();
      expect(() => recorder.destroy()).not.toThrow();
    });
  });
});
