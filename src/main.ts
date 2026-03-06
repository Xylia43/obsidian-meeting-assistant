// ============================================================
// main.ts - Obsidian Meeting Assistant 插件入口
// ============================================================

import { Plugin, PluginSettingTab, App, Setting, Notice } from 'obsidian';
import { AudioRecorder } from './core/audio-recorder';
import { FileManager } from './core/file-manager';
import { createSTTProvider } from './services/stt-service';
import { SummaryGenerator } from './services/summary-generator';
import {
  MeetingAssistantSettings,
  DEFAULT_SETTINGS,
  RecordingState,
} from './types';

export default class MeetingAssistantPlugin extends Plugin {
  settings!: MeetingAssistantSettings;
  audioRecorder!: AudioRecorder;
  fileManager!: FileManager;

  async onload(): Promise<void> {
    console.log('Loading Meeting Assistant Plugin');

    // 加载设置
    await this.loadSettings();

    // 注册状态栏（在 AudioRecorder 之前创建，以便回调使用）
    const statusBarItem = this.addStatusBarItem();
    statusBarItem.setText('🎙️ 就绪');

    // 初始化核心模块 — 只创建一次 AudioRecorder，合并所有回调
    this.audioRecorder = new AudioRecorder(
      {
        audioBitsPerSecond: this.settings.audioBitsPerSecond,
      },
      {
        onStateChange: (state) => {
          console.log(`[MeetingAssistant] Recording state: ${state}`);
          switch (state) {
            case RecordingState.RECORDING:
              statusBarItem.setText('🔴 录音中...');
              break;
            case RecordingState.PAUSED:
              statusBarItem.setText('⏸️ 已暂停');
              break;
            default:
              statusBarItem.setText('🎙️ 就绪');
          }
        },
        onElapsedChange: (elapsed) => {
          const state = this.audioRecorder.getRecordingState();
          if (state.state === RecordingState.RECORDING) {
            const formatted = this.formatElapsed(elapsed);
            statusBarItem.setText(`🔴 ${formatted}`);
          }
        },
        onError: (error) => {
          console.error('[MeetingAssistant] Recording error:', error);
          new Notice(`录音出错: ${error.message}`);
        },
      },
    );

    this.fileManager = new FileManager(this.app, {
      audioFolder: this.settings.audioFolder,
      notesFolder: this.settings.notesFolder,
    });

    // 注册命令
    this.registerCommands();

    // 注册 Ribbon 图标
    this.addRibbonIcon('mic', '开始/停止录音', async () => {
      await this.toggleRecording();
    });

    // 添加设置面板
    this.addSettingTab(new MeetingAssistantSettingTab(this.app, this));
  }

  onunload(): void {
    console.log('Unloading Meeting Assistant Plugin');
    this.audioRecorder?.destroy();
  }

  // ========================================
  // 命令注册
  // ========================================

  private registerCommands(): void {
    // 开始录音
    this.addCommand({
      id: 'start-recording',
      name: '开始录音',
      callback: async () => {
        await this.startRecording();
      },
    });

    // 暂停/恢复录音
    this.addCommand({
      id: 'toggle-pause-recording',
      name: '暂停/恢复录音',
      callback: () => {
        this.togglePause();
      },
    });

    // 停止录音
    this.addCommand({
      id: 'stop-recording',
      name: '停止录音并保存',
      callback: async () => {
        await this.stopAndSave();
      },
    });

    // 切换录音状态
    this.addCommand({
      id: 'toggle-recording',
      name: '切换录音（开始/停止）',
      callback: async () => {
        await this.toggleRecording();
      },
    });
  }

  // ========================================
  // 录音操作
  // ========================================

  private async startRecording(): Promise<void> {
    try {
      await this.audioRecorder.startRecording();
      new Notice('🎙️ 录音已开始');
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Unknown error';
      new Notice(`无法开始录音: ${msg}`);
    }
  }

  private togglePause(): void {
    const { state } = this.audioRecorder.getRecordingState();

    try {
      if (state === RecordingState.RECORDING) {
        this.audioRecorder.pauseRecording();
        new Notice('⏸️ 录音已暂停');
      } else if (state === RecordingState.PAUSED) {
        this.audioRecorder.resumeRecording();
        new Notice('▶️ 录音已恢复');
      } else {
        new Notice('当前没有进行中的录音');
      }
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Unknown error';
      new Notice(`操作失败: ${msg}`);
    }
  }

  private async stopAndSave(): Promise<void> {
    const { state } = this.audioRecorder.getRecordingState();

    if (
      state !== RecordingState.RECORDING &&
      state !== RecordingState.PAUSED
    ) {
      new Notice('当前没有进行中的录音');
      return;
    }

    let savedFilePath: string | undefined;
    let savedFileSize: number | undefined;
    let audioBlob: Blob | undefined;
    let recordingDuration: number | undefined;
    let recordingStartedAt: Date | undefined;

    // Step 1: 停止录音 → 保存音频文件
    try {
      new Notice('⏹️ 正在停止录音...');

      const result = await this.audioRecorder.stopRecording();
      audioBlob = result.blob;
      recordingDuration = result.duration;
      recordingStartedAt = result.startedAt;

      const saved = await this.fileManager.saveRecording(result);
      savedFilePath = saved.filePath;
      savedFileSize = saved.size;

      new Notice(
        `✅ 录音已保存 (${this.formatFileSize(saved.size)})`,
      );
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Unknown error';
      new Notice(`停止录音失败: ${msg}`);
      return;
    }

    // Step 2: STT 转写
    let transcriptionText: string | undefined;
    let transcriptionResult: import('./types/services').TranscriptionResult | undefined;

    const sttNeedsApiKey = this.settings.sttProvider !== 'moonshine';
    if (
      this.settings.autoTranscribe &&
      (!sttNeedsApiKey || this.settings.sttApiKey) &&
      audioBlob
    ) {
      try {
        const transcribeNotice = new Notice('🔄 正在转写...', 0);

        const sttProvider = createSTTProvider({
          provider: this.settings.sttProvider,
          apiKey: this.settings.sttApiKey,
          baseUrl: this.settings.sttBaseUrl || undefined,
          defaultLanguage: this.settings.sttLanguage || undefined,
          enableDiarization: this.settings.enableDiarization,
        });

        const audioArrayBuffer = await audioBlob.arrayBuffer();

        transcriptionResult = await sttProvider.transcribe({
          audioData: audioArrayBuffer,
          fileName: 'recording.webm',
          language: this.settings.sttLanguage || undefined,
          enableDiarization: this.settings.enableDiarization,
        });

        transcriptionText = transcriptionResult.text;
        transcribeNotice.hide();
        new Notice('✅ 转写完成');
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : 'Unknown error';
        console.error('[MeetingAssistant] STT failed:', error);
        new Notice(`⚠️ 转写失败: ${msg}`);
      }
    }

    // Step 3: LLM 纪要生成
    let summaryMarkdown: string | undefined;

    const llmNeedsApiKey = this.settings.llmProvider !== 'ollama';
    if (
      this.settings.autoSummarize &&
      (!llmNeedsApiKey || this.settings.llmApiKey) &&
      transcriptionResult
    ) {
      try {
        const summaryNotice = new Notice('🔄 正在生成纪要...', 0);

        const summaryGenerator = new SummaryGenerator({
          llmConfig: {
            provider: this.settings.llmProvider,
            apiKey: this.settings.llmApiKey,
            baseUrl: this.settings.llmBaseUrl || undefined,
            model: this.settings.llmModel,
          },
        });

        summaryMarkdown = await summaryGenerator.generateMarkdown({
          transcription: transcriptionResult,
          meetingMeta: {
            date: recordingStartedAt
              ? recordingStartedAt.toISOString().split('T')[0]
              : undefined,
          },
        });

        summaryNotice.hide();
        new Notice('✅ 纪要生成完成');
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : 'Unknown error';
        console.error('[MeetingAssistant] Summary generation failed:', error);
        new Notice(`⚠️ 纪要生成失败: ${msg}`);
      }
    }

    // Step 4: 创建笔记
    if (this.settings.autoCreateNote && savedFilePath && recordingDuration !== undefined) {
      try {
        const title = `会议录音 ${(recordingStartedAt ?? new Date()).toLocaleDateString('zh-CN')}`;

        // 确定笔记内容：优先纪要 > 转写文本 > 空模板
        let noteContent: string | undefined;
        if (summaryMarkdown) {
          noteContent = summaryMarkdown;
        } else if (transcriptionText) {
          noteContent = `# 会议转写\n\n${transcriptionText}\n`;
        }

        await this.fileManager.createMeetingNote(
          title,
          savedFilePath,
          recordingDuration,
          noteContent,
        );
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : 'Unknown error';
        new Notice(`⚠️ 创建笔记失败: ${msg}`);
      }
    }
  }

  private async toggleRecording(): Promise<void> {
    const { state } = this.audioRecorder.getRecordingState();

    if (state === RecordingState.IDLE) {
      await this.startRecording();
    } else {
      await this.stopAndSave();
    }
  }

  // ========================================
  // 设置管理
  // ========================================

  async loadSettings(): Promise<void> {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData(),
    );
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);

    // 同步更新 FileManager 配置
    this.fileManager?.updateOptions({
      audioFolder: this.settings.audioFolder,
      notesFolder: this.settings.notesFolder,
    });
  }

  // ========================================
  // 工具方法
  // ========================================

  private formatElapsed(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024)
      return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

// ============================================================
// 设置面板
// ============================================================

class MeetingAssistantSettingTab extends PluginSettingTab {
  plugin: MeetingAssistantPlugin;

  constructor(app: App, plugin: MeetingAssistantPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: '会议助手设置' });

    // ─── 基础设置 ─────────────────────────────────────────

    // 音频保存目录
    new Setting(containerEl)
      .setName('音频保存目录')
      .setDesc('录音文件保存到 Vault 中的哪个目录')
      .addText((text) =>
        text
          .setPlaceholder('meeting-recordings')
          .setValue(this.plugin.settings.audioFolder)
          .onChange(async (value) => {
            this.plugin.settings.audioFolder =
              value || DEFAULT_SETTINGS.audioFolder;
            await this.plugin.saveSettings();
          }),
      );

    // 笔记保存目录
    new Setting(containerEl)
      .setName('笔记保存目录')
      .setDesc('会议笔记保存到 Vault 中的哪个目录')
      .addText((text) =>
        text
          .setPlaceholder('meeting-notes')
          .setValue(this.plugin.settings.notesFolder)
          .onChange(async (value) => {
            this.plugin.settings.notesFolder =
              value || DEFAULT_SETTINGS.notesFolder;
            await this.plugin.saveSettings();
          }),
      );

    // 音频比特率
    new Setting(containerEl)
      .setName('音频比特率')
      .setDesc('录音质量（单位: bps），越高音质越好但文件越大')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('64000', '64 kbps（低质量，小文件）')
          .addOption('128000', '128 kbps（标准）')
          .addOption('192000', '192 kbps（高质量）')
          .addOption('256000', '256 kbps（最高质量）')
          .setValue(this.plugin.settings.audioBitsPerSecond.toString())
          .onChange(async (value) => {
            this.plugin.settings.audioBitsPerSecond = parseInt(value, 10);
            await this.plugin.saveSettings();
          }),
      );

    // 自动创建笔记
    new Setting(containerEl)
      .setName('自动创建笔记')
      .setDesc('录音完成后自动创建会议笔记文件')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoCreateNote)
          .onChange(async (value) => {
            this.plugin.settings.autoCreateNote = value;
            await this.plugin.saveSettings();
          }),
      );

    // ─── STT 设置 ──────────────────────────────────────────

    containerEl.createEl('h3', { text: '🎤 语音转写 (STT)' });

    new Setting(containerEl)
      .setName('STT 提供商')
      .setDesc('选择语音转写服务')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('whisper', 'OpenAI Whisper')
          .addOption('moonshine', 'Moonshine (本地)')
          .setValue(this.plugin.settings.sttProvider)
          .onChange(async (value) => {
            this.plugin.settings.sttProvider = value as 'whisper' | 'moonshine';
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    if (this.plugin.settings.sttProvider === 'whisper') {
      new Setting(containerEl)
        .setName('STT API Key')
        .setDesc('Whisper API 的密钥')
        .addText((text) =>
          text
            .setPlaceholder('sk-...')
            .setValue(this.plugin.settings.sttApiKey)
            .onChange(async (value) => {
              this.plugin.settings.sttApiKey = value;
              await this.plugin.saveSettings();
            }),
        );
    }

    new Setting(containerEl)
      .setName('STT Base URL')
      .setDesc(
        this.plugin.settings.sttProvider === 'whisper'
          ? 'Whisper API 的基础 URL（默认 OpenAI）'
          : 'Moonshine 服务地址'
      )
      .addText((text) =>
        text
          .setPlaceholder(
            this.plugin.settings.sttProvider === 'whisper'
              ? 'https://api.openai.com/v1'
              : 'http://localhost:8765'
          )
          .setValue(this.plugin.settings.sttBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.sttBaseUrl =
              value || DEFAULT_SETTINGS.sttBaseUrl;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('语言')
      .setDesc('转写语言代码（如 zh、en），留空自动检测')
      .addText((text) =>
        text
          .setPlaceholder('zh')
          .setValue(this.plugin.settings.sttLanguage)
          .onChange(async (value) => {
            this.plugin.settings.sttLanguage = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('说话人分离')
      .setDesc('尝试区分不同说话人（启发式方法，准确率有限）')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableDiarization)
          .onChange(async (value) => {
            this.plugin.settings.enableDiarization = value;
            await this.plugin.saveSettings();
          }),
      );

    // ─── LLM 设置 ──────────────────────────────────────────

    containerEl.createEl('h3', { text: '🤖 LLM 纪要生成' });

    new Setting(containerEl)
      .setName('LLM 提供商')
      .setDesc('选择纪要生成使用的 LLM 服务')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('openai', 'OpenAI (GPT)')
          .addOption('claude', 'Claude (Anthropic)')
          .addOption('ollama', 'Ollama (本地)')
          .setValue(this.plugin.settings.llmProvider)
          .onChange(async (value) => {
            this.plugin.settings.llmProvider = value as 'openai' | 'claude' | 'ollama';
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('LLM API Key')
      .setDesc('LLM 服务的 API 密钥（Ollama 不需要）')
      .addText((text) =>
        text
          .setPlaceholder('sk-...')
          .setValue(this.plugin.settings.llmApiKey)
          .onChange(async (value) => {
            this.plugin.settings.llmApiKey = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('LLM Base URL')
      .setDesc('LLM API 的基础 URL')
      .addText((text) =>
        text
          .setPlaceholder('https://api.openai.com/v1')
          .setValue(this.plugin.settings.llmBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.llmBaseUrl =
              value || DEFAULT_SETTINGS.llmBaseUrl;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('模型')
      .setDesc('使用的模型名称')
      .addText((text) =>
        text
          .setPlaceholder('gpt-4o')
          .setValue(this.plugin.settings.llmModel)
          .onChange(async (value) => {
            this.plugin.settings.llmModel =
              value || DEFAULT_SETTINGS.llmModel;
            await this.plugin.saveSettings();
          }),
      );

    // ─── 自动化设置 ────────────────────────────────────────

    containerEl.createEl('h3', { text: '⚡ 自动化' });

    new Setting(containerEl)
      .setName('自动转写')
      .setDesc('录音完成后自动进行语音转文字（需配置 STT）')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoTranscribe)
          .onChange(async (value) => {
            this.plugin.settings.autoTranscribe = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('自动生成纪要')
      .setDesc('转写完成后自动生成会议纪要（需配置 LLM）')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoSummarize)
          .onChange(async (value) => {
            this.plugin.settings.autoSummarize = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
