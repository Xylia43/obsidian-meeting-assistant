// ============================================================
// AudioRecorder - 核心录音模块
// 使用 Web MediaRecorder API，支持 WebM(Opus) 格式
// ============================================================

import {
  RecordingState,
  AudioFormat,
  AudioRecorderOptions,
  RecordingResult,
  RecordingStatus,
  RecorderEventCallbacks,
} from '../types';

/** 默认录音配置 */
const DEFAULT_OPTIONS: Required<AudioRecorderOptions> = {
  mimeType: AudioFormat.WEBM_OPUS,
  audioBitsPerSecond: 128000,
  timeslice: 1000,
};

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private state: RecordingState = RecordingState.IDLE;
  private options: Required<AudioRecorderOptions>;
  private callbacks: RecorderEventCallbacks;

  // 计时相关
  private startedAt: Date | null = null;
  private stoppedAt: Date | null = null;
  private elapsedBeforePause: number = 0;
  private lastResumeTime: number = 0;
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    options?: AudioRecorderOptions,
    callbacks?: RecorderEventCallbacks,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.callbacks = callbacks ?? {};

    // 检查 MIME 类型支持，回退到基本 WebM
    if (!this.isMimeTypeSupported(this.options.mimeType)) {
      console.warn(
        `[AudioRecorder] ${this.options.mimeType} not supported, falling back to ${AudioFormat.WEBM}`,
      );
      this.options.mimeType = AudioFormat.WEBM;
    }
  }

  // ========================================
  // 公共方法
  // ========================================

  /**
   * 开始录音
   * 请求麦克风权限并启动 MediaRecorder
   */
  async startRecording(): Promise<void> {
    if (this.state !== RecordingState.IDLE) {
      throw new Error(
        `Cannot start recording: current state is "${this.state}", expected "idle"`,
      );
    }

    try {
      // 请求麦克风权限
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      // 创建 MediaRecorder 实例
      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType: this.options.mimeType,
        audioBitsPerSecond: this.options.audioBitsPerSecond,
      });

      // 重置状态
      this.chunks = [];
      this.elapsedBeforePause = 0;
      this.startedAt = new Date();
      this.stoppedAt = null;
      this.lastResumeTime = Date.now();

      // 绑定事件
      this.setupMediaRecorderEvents();

      // 启动录音
      this.mediaRecorder.start(this.options.timeslice);
      this.setState(RecordingState.RECORDING);

      // 启动计时器
      this.startTimer();
    } catch (error) {
      this.cleanup();
      const err =
        error instanceof Error
          ? error
          : new Error('Failed to start recording');
      this.callbacks.onError?.(err);
      throw err;
    }
  }

  /**
   * 暂停录音
   */
  pauseRecording(): void {
    if (this.state !== RecordingState.RECORDING) {
      throw new Error(
        `Cannot pause: current state is "${this.state}", expected "recording"`,
      );
    }

    if (!this.mediaRecorder) {
      throw new Error('MediaRecorder is not initialized');
    }

    // 累计已录时长
    this.elapsedBeforePause += Date.now() - this.lastResumeTime;

    this.mediaRecorder.pause();
    this.setState(RecordingState.PAUSED);
    this.stopTimer();
  }

  /**
   * 恢复录音
   */
  resumeRecording(): void {
    if (this.state !== RecordingState.PAUSED) {
      throw new Error(
        `Cannot resume: current state is "${this.state}", expected "paused"`,
      );
    }

    if (!this.mediaRecorder) {
      throw new Error('MediaRecorder is not initialized');
    }

    this.lastResumeTime = Date.now();

    this.mediaRecorder.resume();
    this.setState(RecordingState.RECORDING);
    this.startTimer();
  }

  /**
   * 停止录音并返回音频 Blob
   * @returns 录音结果，包含音频 Blob、时长等信息
   */
  async stopRecording(): Promise<RecordingResult> {
    if (
      this.state !== RecordingState.RECORDING &&
      this.state !== RecordingState.PAUSED
    ) {
      throw new Error(
        `Cannot stop: current state is "${this.state}", expected "recording" or "paused"`,
      );
    }

    if (!this.mediaRecorder) {
      throw new Error('MediaRecorder is not initialized');
    }

    // Bug fix: accumulate current segment time before transitioning to STOPPING,
    // otherwise calculateElapsed() in STOPPING state would miss the last segment.
    if (this.state === RecordingState.RECORDING) {
      this.elapsedBeforePause += Date.now() - this.lastResumeTime;
    }

    this.setState(RecordingState.STOPPING);
    this.stopTimer();

    return new Promise<RecordingResult>((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('MediaRecorder is not initialized'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        try {
          // 计算最终时长
          const finalElapsed = this.calculateElapsed();
          this.stoppedAt = new Date();

          // 合并所有音频块
          const blob = new Blob(this.chunks, {
            type: this.options.mimeType,
          });

          const result: RecordingResult = {
            blob,
            duration: finalElapsed,
            mimeType: this.options.mimeType,
            startedAt: this.startedAt!,
            stoppedAt: this.stoppedAt,
          };

          // 清理资源
          this.cleanup();

          resolve(result);
        } catch (error) {
          this.cleanup();
          reject(error);
        }
      };

      this.mediaRecorder.onerror = (event: Event) => {
        this.cleanup();
        reject(
          new Error(
            `MediaRecorder error: ${(event as ErrorEvent).message ?? 'unknown'}`,
          ),
        );
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * 获取当前录音状态
   */
  getRecordingState(): RecordingStatus {
    return {
      state: this.state,
      elapsed: this.calculateElapsed(),
      startedAt: this.startedAt,
    };
  }

  /**
   * 销毁录音器，释放所有资源
   */
  destroy(): void {
    if (
      this.state === RecordingState.RECORDING ||
      this.state === RecordingState.PAUSED
    ) {
      // 强制停止，不等待结果
      this.mediaRecorder?.stop();
    }
    this.cleanup();
  }

  // ========================================
  // 私有方法
  // ========================================

  /** 绑定 MediaRecorder 事件 */
  private setupMediaRecorderEvents(): void {
    if (!this.mediaRecorder) return;

    this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
        this.callbacks.onDataAvailable?.(event.data);
      }
    };

    this.mediaRecorder.onerror = (event: Event) => {
      const err = new Error(
        `Recording error: ${(event as ErrorEvent).message ?? 'unknown'}`,
      );
      this.callbacks.onError?.(err);
      this.cleanup();
    };
  }

  /** 计算当前已录制时长（毫秒） */
  private calculateElapsed(): number {
    if (this.state === RecordingState.IDLE) {
      return 0;
    }

    if (
      this.state === RecordingState.PAUSED ||
      this.state === RecordingState.STOPPING
    ) {
      return this.elapsedBeforePause;
    }

    // RECORDING 状态：累计 + 当前段
    return this.elapsedBeforePause + (Date.now() - this.lastResumeTime);
  }

  /** 设置状态并触发回调 */
  private setState(newState: RecordingState): void {
    this.state = newState;
    this.callbacks.onStateChange?.(newState);
  }

  /** 启动计时器（每秒更新） */
  private startTimer(): void {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      this.callbacks.onElapsedChange?.(this.calculateElapsed());
    }, 1000);
  }

  /** 停止计时器 */
  private stopTimer(): void {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /** 检查 MIME 类型是否受支持 */
  private isMimeTypeSupported(mimeType: string): boolean {
    if (typeof MediaRecorder === 'undefined') {
      return false;
    }
    return MediaRecorder.isTypeSupported(mimeType);
  }

  /** 清理所有资源 */
  private cleanup(): void {
    this.stopTimer();

    // 停止所有音轨
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.mediaRecorder = null;
    this.chunks = [];
    this.setState(RecordingState.IDLE);
  }
}
