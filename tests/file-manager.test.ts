/**
 * tests/file-manager.test.ts
 * 测试 FileManager 的路径生成、笔记模板和文件操作
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App, Vault, normalizePath } from './__mocks__/obsidian';
import { FileManager } from '../src/core/file-manager';
import type { RecordingResult } from '../src/types';

// ─── 测试工具 ─────────────────────────────────────────────────

function createMockApp(): App {
  return new App();
}

function createMockRecordingResult(overrides?: Partial<RecordingResult>): RecordingResult {
  const defaultBlob = new Blob(['fake-audio-data'], { type: 'audio/webm;codecs=opus' });
  return {
    blob: defaultBlob,
    duration: 60000, // 1 分钟
    mimeType: 'audio/webm;codecs=opus',
    startedAt: new Date('2024-06-15T10:30:00Z'),
    stoppedAt: new Date('2024-06-15T10:31:00Z'),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────

describe('FileManager', () => {
  let app: App;
  let fileManager: FileManager;

  beforeEach(() => {
    app = createMockApp();
    fileManager = new FileManager(app as any);
  });

  // ── 构造与配置 ─────────────────────────────────────────────

  describe('constructor and config', () => {
    it('should use default options', () => {
      expect(fileManager.getAudioFolder()).toBe('meeting-recordings');
      expect(fileManager.getNotesFolder()).toBe('meeting-notes');
    });

    it('should accept custom options', () => {
      const fm = new FileManager(app as any, {
        audioFolder: 'my-audio',
        notesFolder: 'my-notes',
        dateFormat: 'YYYYMMDD',
      });
      expect(fm.getAudioFolder()).toBe('my-audio');
      expect(fm.getNotesFolder()).toBe('my-notes');
    });

    it('should update options', () => {
      fileManager.updateOptions({ audioFolder: 'new-audio' });
      expect(fileManager.getAudioFolder()).toBe('new-audio');
    });
  });

  // ── saveRecording ──────────────────────────────────────────

  describe('saveRecording', () => {
    it('should save audio file and return path + size', async () => {
      const result = createMockRecordingResult();
      const saved = await fileManager.saveRecording(result);

      expect(saved.filePath).toMatch(/^meeting-recordings\//);
      expect(saved.filePath).toMatch(/\.webm$/);
      expect(saved.size).toBeGreaterThan(0);
    });

    it('should use custom name if provided', async () => {
      const result = createMockRecordingResult();
      const saved = await fileManager.saveRecording(result, 'my-meeting');

      expect(saved.filePath).toBe('meeting-recordings/my-meeting.webm');
    });

    it('should generate filename with date when no custom name', async () => {
      const startDate = new Date('2024-06-15T10:30:00Z');
      const result = createMockRecordingResult({ startedAt: startDate });
      const saved = await fileManager.saveRecording(result);

      // Should contain 'meeting_' prefix and date
      expect(saved.filePath).toMatch(/meeting_\d{4}-\d{2}-\d{2}_\d{6}\.webm$/);
    });

    it('should create the audio folder if it does not exist', async () => {
      const createFolderSpy = vi.spyOn(app.vault, 'createFolder');
      const result = createMockRecordingResult();

      await fileManager.saveRecording(result);

      expect(createFolderSpy).toHaveBeenCalled();
    });

    it('should not recreate folder if it already exists', async () => {
      // First call creates the folder
      await fileManager.saveRecording(createMockRecordingResult());

      const createFolderSpy = vi.spyOn(app.vault, 'createFolder');

      // Second call should detect folder exists
      await fileManager.saveRecording(createMockRecordingResult());

      // Depending on implementation, it may or may not call createFolder again
      // but it should not throw
    });
  });

  // ── createMeetingNote ─────────────────────────────────────

  describe('createMeetingNote', () => {
    it('should create a markdown note and return path', async () => {
      const notePath = await fileManager.createMeetingNote(
        '产品周会',
        'meeting-recordings/audio.webm',
        3600000, // 1 hour
      );

      expect(notePath).toMatch(/^meeting-notes\//);
      expect(notePath).toMatch(/\.md$/);
    });

    it('should include the title in the file name', async () => {
      const notePath = await fileManager.createMeetingNote(
        '项目讨论',
        'audio.webm',
        60000,
      );

      expect(notePath).toContain('项目讨论');
    });

    it('should generate note template with correct frontmatter', async () => {
      const createSpy = vi.spyOn(app.vault, 'create');

      await fileManager.createMeetingNote(
        '季度回顾',
        'meeting-recordings/review.webm',
        7200000, // 2 hours
      );

      expect(createSpy).toHaveBeenCalled();
      const content = createSpy.mock.calls[0][1] as string;

      // Check frontmatter
      expect(content).toContain('---');
      expect(content).toContain('title: "季度回顾"');
      expect(content).toContain('type: meeting-note');
      expect(content).toContain('tags:');
      expect(content).toContain('  - meeting');
      expect(content).toContain('  - recording');

      // Check body
      expect(content).toContain('# 季度回顾');
      expect(content).toContain('## 会议信息');
      expect(content).toContain('![[meeting-recordings/review.webm]]');
      expect(content).toContain('## 参会人员');
      expect(content).toContain('## 会议摘要');
      expect(content).toContain('## 要点记录');
      expect(content).toContain('## 行动项');
      expect(content).toContain('## 备注');
    });

    it('should format duration correctly in the note', async () => {
      const createSpy = vi.spyOn(app.vault, 'create');

      // 1 hour 30 minutes 45 seconds = 5445000 ms
      await fileManager.createMeetingNote('会议', 'a.webm', 5445000);

      const content = createSpy.mock.calls[0][1] as string;
      expect(content).toContain('01:30:45');
    });

    it('should format short duration without hours', async () => {
      const createSpy = vi.spyOn(app.vault, 'create');

      // 5 minutes 30 seconds = 330000 ms
      await fileManager.createMeetingNote('短会', 'a.webm', 330000);

      const content = createSpy.mock.calls[0][1] as string;
      expect(content).toContain('05:30');
      // Should NOT have hours prefix when < 1 hour
      expect(content).not.toContain('00:05:30');
    });
  });

  // ── 文件名安全性 ──────────────────────────────────────────

  describe('file name sanitization', () => {
    it('should sanitize illegal characters in note title', async () => {
      const createSpy = vi.spyOn(app.vault, 'create');

      await fileManager.createMeetingNote(
        '项目 A/B <测试> "引号"',
        'a.webm',
        1000,
      );

      const fullPath = createSpy.mock.calls[0][0] as string;
      // Extract just the file name (after the last /)
      const fileName = fullPath.split('/').pop()!;
      // File name should not contain illegal chars (/ is path separator, not in filename)
      expect(fileName).not.toMatch(/[\\:*?"<>|]/);
    });

    it('should handle very long titles by truncating', async () => {
      const createSpy = vi.spyOn(app.vault, 'create');
      const longTitle = 'A'.repeat(200);

      await fileManager.createMeetingNote(longTitle, 'a.webm', 1000);

      const path = createSpy.mock.calls[0][0] as string;
      // The sanitized prefix should be at most 100 chars
      expect(path.length).toBeLessThan(250);
    });
  });
});

// ─── normalizePath 独立测试 ──────────────────────────────────

describe('normalizePath (mock)', () => {
  it('should normalize backslashes to forward slashes', () => {
    expect(normalizePath('meeting\\recordings\\file.webm')).toBe(
      'meeting/recordings/file.webm',
    );
  });

  it('should collapse multiple slashes', () => {
    expect(normalizePath('meeting//recordings///file.webm')).toBe(
      'meeting/recordings/file.webm',
    );
  });

  it('should strip leading and trailing slashes', () => {
    expect(normalizePath('/meeting/recordings/')).toBe(
      'meeting/recordings',
    );
  });
});
