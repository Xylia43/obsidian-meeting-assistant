/**
 * tests/summary-generator.test.ts
 * 测试 SummaryGenerator 的端到端流程
 * Mock LLM 服务，测试 prompt 构建、JSON 解析、Markdown 生成
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TranscriptionResult,
  MeetingSummaryData,
  SummaryGenerationRequest,
  AdviceGenerationRequest,
  ServiceError,
  ServiceErrorCode,
  SummaryGeneratorConfig,
} from '../src/types/services';
import { SummaryGenerator } from '../src/services/summary-generator';

// ─── Mock LLM service (via obsidian requestUrl) ──────────────

const mockRequestUrl = vi.fn();

vi.mock('obsidian', async () => {
  const actual = await import('./__mocks__/obsidian');
  return {
    ...actual,
    requestUrl: (...args: unknown[]) => mockRequestUrl(...args),
  };
});

// ─── Test data ────────────────────────────────────────────────

function createTranscriptionResult(
  overrides?: Partial<TranscriptionResult>,
): TranscriptionResult {
  return {
    text: '好的，我们开始讨论项目进展。张三说进度正常。李四提到有些风险需要关注。',
    segments: [
      {
        id: 0,
        start: 0,
        end: 10,
        text: '好的，我们开始讨论项目进展。',
        speaker: 'Speaker 1',
      },
      {
        id: 1,
        start: 10,
        end: 20,
        text: '张三说进度正常。',
        speaker: 'Speaker 2',
      },
      {
        id: 2,
        start: 20,
        end: 30,
        text: '李四提到有些风险需要关注。',
        speaker: 'Speaker 3',
      },
    ],
    language: 'zh',
    duration: 30,
    speakers: ['Speaker 1', 'Speaker 2', 'Speaker 3'],
    ...overrides,
  };
}

function createSummaryData(): MeetingSummaryData {
  return {
    title: '项目进展讨论',
    date: '2024-06-15',
    duration: '30分钟',
    participants: ['张三', '李四', '主持人'],
    overview: '团队讨论了项目进展，确认进度正常但存在风险。',
    agendas: [
      {
        title: '项目进展汇报',
        summary: '张三汇报了当前进度，整体进展正常。',
        keyPoints: ['进度正常', '已完成核心功能'],
      },
      {
        title: '风险评估',
        summary: '李四提出了潜在的技术风险。',
        keyPoints: ['依赖库版本问题', '性能瓶颈'],
      },
    ],
    decisions: [
      {
        content: '本周内完成风险评估报告',
        participants: ['李四'],
      },
    ],
    actionItems: [
      {
        assignee: '李四',
        task: '编写风险评估报告',
        deadline: '2024-06-22',
        priority: 'high',
      },
      {
        assignee: '张三',
        task: '更新项目文档',
        priority: 'medium',
      },
    ],
    notes: '下次会议定于下周一。',
  };
}

function createConfig(overrides?: Partial<SummaryGeneratorConfig>): SummaryGeneratorConfig {
  return {
    llmConfig: {
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4o',
    },
    defaultLanguage: 'zh',
    ...overrides,
  };
}

function mockLLMResponse(content: string) {
  mockRequestUrl.mockResolvedValue({
    status: 200,
    json: {
      model: 'gpt-4o',
      choices: [{ message: { content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
    },
  });
}

// ─── Tests ────────────────────────────────────────────────────

describe('SummaryGenerator', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  // ── 构造函数 ──────────────────────────────────────────────

  describe('constructor', () => {
    it('should create with valid config', () => {
      const generator = new SummaryGenerator(createConfig());
      expect(generator).toBeDefined();
    });

    it('should throw if LLM config is invalid', () => {
      expect(
        () =>
          new SummaryGenerator(
            createConfig({
              llmConfig: { provider: 'openai', apiKey: '', model: 'gpt-4o' },
            }),
          ),
      ).toThrow();
    });
  });

  // ── generateMeetingSummary ─────────────────────────────────

  describe('generateMeetingSummary', () => {
    it('should generate structured summary from transcription', async () => {
      const summaryData = createSummaryData();
      mockLLMResponse(JSON.stringify(summaryData));

      const generator = new SummaryGenerator(createConfig());
      const result = await generator.generateMeetingSummary({
        transcription: createTranscriptionResult(),
      });

      expect(result.title).toBe('项目进展讨论');
      expect(result.participants).toContain('张三');
      expect(result.participants).toContain('李四');
      expect(result.agendas).toHaveLength(2);
      expect(result.decisions).toHaveLength(1);
      expect(result.actionItems).toHaveLength(2);
    });

    it('should handle JSON wrapped in code blocks', async () => {
      const summaryData = createSummaryData();
      mockLLMResponse('```json\n' + JSON.stringify(summaryData) + '\n```');

      const generator = new SummaryGenerator(createConfig());
      const result = await generator.generateMeetingSummary({
        transcription: createTranscriptionResult(),
      });

      expect(result.title).toBe('项目进展讨论');
    });

    it('should handle JSON with surrounding text', async () => {
      const summaryData = createSummaryData();
      mockLLMResponse(
        'Here is the summary:\n' +
          JSON.stringify(summaryData) +
          '\nThank you.',
      );

      const generator = new SummaryGenerator(createConfig());
      const result = await generator.generateMeetingSummary({
        transcription: createTranscriptionResult(),
      });

      expect(result.title).toBe('项目进展讨论');
    });

    it('should fill in date from meta if missing', async () => {
      const data = createSummaryData();
      delete (data as any).date;
      data.date = '';
      mockLLMResponse(JSON.stringify(data));

      const generator = new SummaryGenerator(createConfig());
      const result = await generator.generateMeetingSummary({
        transcription: createTranscriptionResult(),
        meetingMeta: { date: '2024-07-01' },
      });

      expect(result.date).toBe('2024-07-01');
    });

    it('should fill in title from meta if LLM returns "未知"', async () => {
      const data = createSummaryData();
      data.title = '未知';
      mockLLMResponse(JSON.stringify(data));

      const generator = new SummaryGenerator(createConfig());
      const result = await generator.generateMeetingSummary({
        transcription: createTranscriptionResult(),
        meetingMeta: { title: '产品评审会' },
      });

      expect(result.title).toBe('产品评审会');
    });

    it('should format duration from transcription', async () => {
      const data = createSummaryData();
      mockLLMResponse(JSON.stringify(data));

      const generator = new SummaryGenerator(createConfig());
      const result = await generator.generateMeetingSummary({
        transcription: createTranscriptionResult({ duration: 3720 }), // 62 minutes
      });

      expect(result.duration).toContain('1小时');
      expect(result.duration).toContain('2分钟');
    });

    it('should throw ServiceError on invalid JSON response', async () => {
      mockLLMResponse('This is not valid JSON at all.');

      const generator = new SummaryGenerator(createConfig());
      await expect(
        generator.generateMeetingSummary({
          transcription: createTranscriptionResult(),
        }),
      ).rejects.toThrow(ServiceError);
    });

    it('should include meeting meta in the prompt context', async () => {
      mockLLMResponse(JSON.stringify(createSummaryData()));

      const generator = new SummaryGenerator(createConfig());
      await generator.generateMeetingSummary({
        transcription: createTranscriptionResult(),
        meetingMeta: {
          title: '产品评审',
          date: '2024-06-15',
          participants: ['张三', '李四'],
          context: '第三季度产品评审',
        },
      });

      // Check that the request was sent with correct content
      const body = JSON.parse(mockRequestUrl.mock.calls[0][0].body);
      const userContent = body.messages[1].content;
      expect(userContent).toContain('产品评审');
      expect(userContent).toContain('2024-06-15');
      expect(userContent).toContain('张三');
      expect(userContent).toContain('第三季度产品评审');
    });

    it('should format transcription with timestamps and speakers', async () => {
      mockLLMResponse(JSON.stringify(createSummaryData()));

      const generator = new SummaryGenerator(createConfig());
      await generator.generateMeetingSummary({
        transcription: createTranscriptionResult(),
      });

      const body = JSON.parse(mockRequestUrl.mock.calls[0][0].body);
      const userContent = body.messages[1].content;

      expect(userContent).toContain('[Speaker 1]');
      expect(userContent).toContain('[Speaker 2]');
      expect(userContent).toContain('00:00');
    });

    it('should use custom prompt template if provided', async () => {
      mockLLMResponse(JSON.stringify(createSummaryData()));

      const generator = new SummaryGenerator(createConfig());
      await generator.generateMeetingSummary({
        transcription: createTranscriptionResult(),
        customPromptTemplate: 'Custom: summarize the following meeting.',
      });

      const body = JSON.parse(mockRequestUrl.mock.calls[0][0].body);
      expect(body.messages[0].content).toBe(
        'Custom: summarize the following meeting.',
      );
    });
  });

  // ── generateMarkdown ──────────────────────────────────────

  describe('generateMarkdown', () => {
    it('should generate Markdown string', async () => {
      mockLLMResponse(JSON.stringify(createSummaryData()));

      const generator = new SummaryGenerator(createConfig());
      const md = await generator.generateMarkdown({
        transcription: createTranscriptionResult(),
      });

      expect(md).toContain('# 项目进展讨论');
      expect(md).toContain('## 📋 会议信息');
      expect(md).toContain('## 📝 会议概要');
      expect(md).toContain('## 📌 议题讨论');
      expect(md).toContain('## ✅ 关键决议');
      expect(md).toContain('## 🎯 待办事项');
    });
  });

  // ── toMarkdown ────────────────────────────────────────────

  describe('toMarkdown', () => {
    it('should produce complete markdown with all sections', () => {
      const generator = new SummaryGenerator(createConfig());
      const data = createSummaryData();
      const md = generator.toMarkdown(data);

      // Header
      expect(md).toContain('# 项目进展讨论');

      // Meeting info
      expect(md).toContain('- **日期**：2024-06-15');
      expect(md).toContain('- **时长**：30分钟');
      expect(md).toContain('- **参与者**：张三、李四、主持人');

      // Overview
      expect(md).toContain('团队讨论了项目进展');

      // Agendas
      expect(md).toContain('### 1. 项目进展汇报');
      expect(md).toContain('### 2. 风险评估');
      expect(md).toContain('**关键点：**');

      // Decisions
      expect(md).toContain('本周内完成风险评估报告');
      expect(md).toContain('*(李四)*');

      // Action items table
      expect(md).toContain('| 负责人 | 任务 | 截止日期 | 优先级 |');
      expect(md).toContain('🔴 高');
      expect(md).toContain('🟡 中');

      // Notes
      expect(md).toContain('下次会议定于下周一');

      // Footer
      expect(md).toContain('Obsidian Meeting Assistant');
    });

    it('should handle missing optional fields gracefully', () => {
      const generator = new SummaryGenerator(createConfig());
      const data: MeetingSummaryData = {
        title: '简单会议',
        date: '2024-06-15',
        participants: [],
        overview: '一个简单的会议。',
        agendas: [],
        decisions: [],
        actionItems: [],
      };

      const md = generator.toMarkdown(data);
      expect(md).toContain('# 简单会议');
      expect(md).not.toContain('时长');
      expect(md).not.toContain('📌 议题讨论');
      expect(md).not.toContain('✅ 关键决议');
      expect(md).not.toContain('🎯 待办事项');
    });

    it('should render priority emojis correctly', () => {
      const generator = new SummaryGenerator(createConfig());
      const data = createSummaryData();
      data.actionItems = [
        { assignee: 'A', task: 'Task1', priority: 'high' },
        { assignee: 'B', task: 'Task2', priority: 'medium' },
        { assignee: 'C', task: 'Task3', priority: 'low' },
      ];

      const md = generator.toMarkdown(data);
      expect(md).toContain('🔴 高');
      expect(md).toContain('🟡 中');
      expect(md).toContain('🟢 低');
    });
  });

  // ── generateMeetingAdvice ─────────────────────────────────

  describe('generateMeetingAdvice', () => {
    it('should generate advice from summary data', async () => {
      const adviceJson = {
        efficiencyAssessment: '会议效率较高，议题明确。',
        followUpSuggestions: ['跟进风险评估', '定期检查进度'],
        risks: ['技术债务积累'],
        improvements: ['缩短会议时间'],
      };
      mockLLMResponse(JSON.stringify(adviceJson));

      const generator = new SummaryGenerator(createConfig());
      const advice = await generator.generateMeetingAdvice({
        summaryData: createSummaryData(),
      });

      expect(advice.efficiencyAssessment).toContain('会议效率较高');
      expect(advice.followUpSuggestions).toHaveLength(2);
      expect(advice.risks).toContain('技术债务积累');
      expect(advice.improvements).toContain('缩短会议时间');
      expect(advice.rawMarkdown).toContain('## 📊 会议分析与建议');
    });

    it('should include focus areas in the request', async () => {
      mockLLMResponse(
        JSON.stringify({
          followUpSuggestions: ['建议1'],
        }),
      );

      const generator = new SummaryGenerator(createConfig());
      await generator.generateMeetingAdvice({
        summaryData: createSummaryData(),
        focusAreas: ['风险管理', '时间效率'],
      });

      const body = JSON.parse(mockRequestUrl.mock.calls[0][0].body);
      const userContent = body.messages[1].content;
      expect(userContent).toContain('风险管理');
      expect(userContent).toContain('时间效率');
    });

    it('should fall back to raw text when JSON parsing fails', async () => {
      mockLLMResponse('This is a free-text advice response, not JSON.');

      const generator = new SummaryGenerator(createConfig());
      const advice = await generator.generateMeetingAdvice({
        summaryData: createSummaryData(),
      });

      expect(advice.rawMarkdown).toContain('free-text advice');
      expect(advice.followUpSuggestions).toEqual([]);
    });
  });

  // ── JSON 解析边界情况 ──────────────────────────────────────

  describe('JSON parsing edge cases', () => {
    it('should handle response with missing participants', async () => {
      const data = { title: 'Test', overview: 'Overview' };
      mockLLMResponse(JSON.stringify(data));

      const generator = new SummaryGenerator(createConfig());
      const result = await generator.generateMeetingSummary({
        transcription: createTranscriptionResult(),
      });

      expect(result.participants).toEqual([]);
      expect(result.agendas).toEqual([]);
    });

    it('should handle empty segments in transcription', async () => {
      mockLLMResponse(JSON.stringify(createSummaryData()));

      const generator = new SummaryGenerator(createConfig());
      await generator.generateMeetingSummary({
        transcription: createTranscriptionResult({
          segments: [],
          text: '完整的转写文本',
        }),
      });

      const body = JSON.parse(mockRequestUrl.mock.calls[0][0].body);
      const userContent = body.messages[1].content;
      expect(userContent).toContain('完整的转写文本');
    });

    it('should handle invalid priority values gracefully', async () => {
      const data = createSummaryData();
      data.actionItems = [
        { assignee: 'A', task: 'Task', priority: 'critical' as any },
      ];
      mockLLMResponse(JSON.stringify(data));

      const generator = new SummaryGenerator(createConfig());
      const result = await generator.generateMeetingSummary({
        transcription: createTranscriptionResult(),
      });

      expect(result.actionItems[0].priority).toBeUndefined();
    });
  });
});
