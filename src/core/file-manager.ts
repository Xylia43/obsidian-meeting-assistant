// ============================================================
// FileManager - 音频文件 & 笔记管理
// 负责将音频文件保存到 Obsidian Vault
// ============================================================

import { App, TFolder, normalizePath, Notice } from 'obsidian';
import {
  FileManagerOptions,
  SaveAudioResult,
  RecordingResult,
} from '../types';

/** 默认配置 */
const DEFAULT_OPTIONS: Required<FileManagerOptions> = {
  audioFolder: 'meeting-recordings',
  notesFolder: 'meeting-notes',
  dateFormat: 'YYYY-MM-DD_HHmmss',
};

export class FileManager {
  private app: App;
  private options: Required<FileManagerOptions>;

  constructor(app: App, options?: FileManagerOptions) {
    this.app = app;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  // ========================================
  // 公共方法
  // ========================================

  /**
   * 保存录音结果到 Vault
   * @param result 录音结果
   * @param customName 自定义文件名（不含扩展名），为空则自动生成
   * @returns 保存结果，包含文件路径和大小
   */
  async saveRecording(
    result: RecordingResult,
    customName?: string,
  ): Promise<SaveAudioResult> {
    // 确保目标目录存在
    await this.ensureFolder(this.options.audioFolder);

    // 生成文件名
    const fileName = customName
      ? `${customName}.webm`
      : this.generateFileName(result.startedAt, 'webm');

    const filePath = normalizePath(
      `${this.options.audioFolder}/${fileName}`,
    );

    // 将 Blob 转换为 ArrayBuffer 并保存
    const arrayBuffer = await result.blob.arrayBuffer();

    await this.app.vault.createBinary(filePath, arrayBuffer);

    new Notice(`录音已保存: ${fileName}`);

    return {
      filePath,
      size: arrayBuffer.byteLength,
    };
  }

  /**
   * 创建会议笔记（Markdown 文件）
   * @param title 笔记标题
   * @param audioPath 关联的音频文件路径
   * @param duration 录音时长（毫秒）
   * @param markdownContent 可选的纪要 Markdown 内容（如果提供则使用该内容而非模板）
   * @returns 笔记文件路径
   */
  async createMeetingNote(
    title: string,
    audioPath: string,
    duration: number,
    markdownContent?: string,
  ): Promise<string> {
    await this.ensureFolder(this.options.notesFolder);

    const now = new Date();
    const noteFileName = this.generateFileName(now, 'md', title);
    const notePath = normalizePath(
      `${this.options.notesFolder}/${noteFileName}`,
    );

    const content = markdownContent
      ? markdownContent
      : this.buildNoteTemplate(title, audioPath, duration, now);

    await this.app.vault.create(notePath, content);

    new Notice(`会议笔记已创建: ${noteFileName}`);

    return notePath;
  }

  /**
   * 获取音频文件保存目录路径
   */
  getAudioFolder(): string {
    return this.options.audioFolder;
  }

  /**
   * 获取笔记保存目录路径
   */
  getNotesFolder(): string {
    return this.options.notesFolder;
  }

  /**
   * 更新配置
   */
  updateOptions(options: Partial<FileManagerOptions>): void {
    Object.assign(this.options, options);
  }

  // ========================================
  // 私有方法
  // ========================================

  /**
   * 确保目录存在，不存在则递归创建
   */
  private async ensureFolder(folderPath: string): Promise<void> {
    const normalized = normalizePath(folderPath);
    const existing = this.app.vault.getAbstractFileByPath(normalized);

    if (existing instanceof TFolder) {
      return; // 目录已存在
    }

    // 递归创建（处理多级目录）
    const parts = normalized.split('/');
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const folder = this.app.vault.getAbstractFileByPath(currentPath);

      if (!folder) {
        await this.app.vault.createFolder(currentPath);
      }
    }
  }

  /**
   * 生成文件名
   * @param date 日期
   * @param ext 扩展名
   * @param prefix 文件名前缀
   */
  private generateFileName(
    date: Date,
    ext: string,
    prefix?: string,
  ): string {
    const dateStr = this.formatDate(date);
    const sanitizedPrefix = prefix
      ? this.sanitizeFileName(prefix) + '_'
      : 'meeting_';

    return `${sanitizedPrefix}${dateStr}.${ext}`;
  }

  /**
   * 格式化日期为文件名安全的字符串
   */
  private formatDate(date: Date): string {
    const pad = (n: number): string => n.toString().padStart(2, '0');

    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());
    const s = pad(date.getSeconds());

    return `${y}-${m}-${d}_${h}${min}${s}`;
  }

  /**
   * 清理文件名中的非法字符
   */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 100); // 限制长度
  }

  /**
   * 格式化时长为可读字符串 HH:MM:SS
   */
  private formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n: number): string => n.toString().padStart(2, '0');

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }

  /**
   * 构建会议笔记模板
   */
  private buildNoteTemplate(
    title: string,
    audioPath: string,
    duration: number,
    date: Date,
  ): string {
    const dateStr = date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    return `---
title: "${title}"
date: ${date.toISOString()}
type: meeting-note
tags:
  - meeting
  - recording
---

# ${title}

## 会议信息

| 项目 | 内容 |
|------|------|
| 📅 日期 | ${dateStr} |
| ⏱️ 时长 | ${this.formatDuration(duration)} |
| 🎙️ 录音 | ![[${audioPath}]] |

## 参会人员

- 

## 会议摘要

> AI 转写内容将显示在此处

## 要点记录

- 

## 行动项

- [ ] 

## 备注

`;
  }
}
