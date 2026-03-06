/**
 * summary-generator.ts - 会议纪要生成器
 *
 * 基于 LLM 服务，将转写文本转化为结构化会议纪要 (Markdown)。
 * 支持：
 *  - 提取会议主题、参与者、议题、决议、待办事项
 *  - 自定义 Prompt 模板
 *  - 生成会后行动建议
 */

import {
  TranscriptionResult,
  MeetingSummaryData,
  MeetingAdvice,
  SummaryGenerationRequest,
  AdviceGenerationRequest,
  SummaryGeneratorConfig,
  AgendaItem,
  Decision,
  ActionItem,
  ServiceError,
  ServiceErrorCode,
} from '../types/services';
import {
  LLMProvider,
  createLLMProvider,
  generateSummary as llmGenerateSummary,
  generateAdvice as llmGenerateAdvice,
} from './llm-service';

// ─── 默认 Prompt 模板 ─────────────────────────────────────────

const DEFAULT_SUMMARY_PROMPT = `你是一位专业的会议纪要助手。请根据以下会议转写文本，生成一份结构化的会议纪要。

请以 **严格的 JSON 格式** 返回，包含以下字段：

{
  "title": "会议主题（从内容推断）",
  "participants": ["参与者1", "参与者2"],
  "overview": "会议整体概要（2-3句话）",
  "agendas": [
    {
      "title": "议题标题",
      "summary": "讨论摘要",
      "keyPoints": ["关键点1", "关键点2"]
    }
  ],
  "decisions": [
    {
      "content": "决议内容",
      "participants": ["相关人员"]
    }
  ],
  "actionItems": [
    {
      "assignee": "负责人",
      "task": "任务描述",
      "deadline": "截止日期（如有）",
      "priority": "high/medium/low"
    }
  ],
  "notes": "其他补充说明（可选）"
}

注意：
- 仅返回 JSON，不要包含 markdown 代码块或其他文本
- 如果无法确定某些信息（如参与者姓名），请用 "未知" 或合理推断
- 待办事项的优先级根据语境判断
- 使用与转写文本相同的语言`;

const DEFAULT_ADVICE_PROMPT = `你是一位资深的会议效能顾问。请根据以下会议纪要，提供专业的建议和分析。

请以 **严格的 JSON 格式** 返回：

{
  "efficiencyAssessment": "对会议效率的整体评估",
  "followUpSuggestions": ["建议1", "建议2"],
  "risks": ["潜在风险1", "潜在风险2"],
  "improvements": ["改进建议1", "改进建议2"]
}

注意：
- 仅返回 JSON，不要包含 markdown 代码块或其他文本
- 建议应具体、可执行
- 关注待办事项的跟进和风险点`;

// ─── SummaryGenerator 类 ──────────────────────────────────────

export class SummaryGenerator {
  private readonly llmProvider: LLMProvider;
  private readonly defaultLanguage: string;
  private readonly defaultPromptTemplate: string;

  constructor(config: SummaryGeneratorConfig) {
    this.llmProvider = createLLMProvider(config.llmConfig);
    this.defaultLanguage = config.defaultLanguage ?? 'zh';
    this.defaultPromptTemplate =
      config.defaultPromptTemplate ?? DEFAULT_SUMMARY_PROMPT;
  }

  // ── 生成会议纪要 ───────────────────────────────────────────

  /**
   * 从转写结果生成结构化会议纪要
   */
  async generateMeetingSummary(
    request: SummaryGenerationRequest
  ): Promise<MeetingSummaryData> {
    const prompt = request.customPromptTemplate ?? this.defaultPromptTemplate;
    const transcriptionText = this.formatTranscription(
      request.transcription,
      request.meetingMeta
    );

    const response = await llmGenerateSummary(
      this.llmProvider,
      prompt,
      transcriptionText,
      {
        temperature: 0.2,
        maxTokens: 4096,
      }
    );

    const parsed = this.parseSummaryJSON(response.content);

    // 补充元信息
    if (request.meetingMeta?.date && !parsed.date) {
      parsed.date = request.meetingMeta.date;
    }
    if (!parsed.date) {
      parsed.date = new Date().toISOString().split('T')[0];
    }
    if (request.meetingMeta?.title && parsed.title === '未知') {
      parsed.title = request.meetingMeta.title;
    }
    if (request.transcription.duration) {
      parsed.duration = this.formatDuration(request.transcription.duration);
    }

    return parsed;
  }

  /**
   * 生成 Markdown 格式的会议纪要
   */
  async generateMarkdown(
    request: SummaryGenerationRequest
  ): Promise<string> {
    const data = await this.generateMeetingSummary(request);
    return this.toMarkdown(data);
  }

  // ── 生成会后建议 ───────────────────────────────────────────

  /**
   * 基于纪要数据生成会后建议
   */
  async generateMeetingAdvice(
    request: AdviceGenerationRequest
  ): Promise<MeetingAdvice> {
    const prompt = request.customPromptTemplate ?? DEFAULT_ADVICE_PROMPT;
    const summaryText = this.toMarkdown(request.summaryData);

    let userContent = summaryText;
    if (request.focusAreas && request.focusAreas.length > 0) {
      userContent += `\n\n请特别关注以下方面：${request.focusAreas.join('、')}`;
    }

    const response = await llmGenerateAdvice(
      this.llmProvider,
      prompt,
      userContent,
      {
        temperature: 0.4,
        maxTokens: 2048,
      }
    );

    return this.parseAdviceJSON(response.content);
  }

  // ── 格式化转写文本 ─────────────────────────────────────────

  private formatTranscription(
    transcription: TranscriptionResult,
    meta?: SummaryGenerationRequest['meetingMeta']
  ): string {
    const parts: string[] = [];

    // 元信息上下文
    if (meta) {
      const metaParts: string[] = [];
      if (meta.title) metaParts.push(`会议主题: ${meta.title}`);
      if (meta.date) metaParts.push(`日期: ${meta.date}`);
      if (meta.participants && meta.participants.length > 0) {
        metaParts.push(`参与者: ${meta.participants.join(', ')}`);
      }
      if (meta.context) metaParts.push(`背景: ${meta.context}`);
      if (metaParts.length > 0) {
        parts.push(`[会议信息]\n${metaParts.join('\n')}`);
      }
    }

    // 转写文本（带时间戳和说话人）
    if (transcription.segments.length > 0) {
      const segTexts = transcription.segments.map((seg) => {
        const time = this.formatTimestamp(seg.start);
        const speaker = seg.speaker ? `[${seg.speaker}]` : '';
        return `${time} ${speaker} ${seg.text}`;
      });
      parts.push(`[转写内容]\n${segTexts.join('\n')}`);
    } else {
      parts.push(`[转写内容]\n${transcription.text}`);
    }

    return parts.join('\n\n');
  }

  // ── JSON 解析 ──────────────────────────────────────────────

  private parseSummaryJSON(raw: string): MeetingSummaryData {
    const jsonStr = this.extractJSON(raw);

    try {
      const obj = JSON.parse(jsonStr) as Record<string, unknown>;

      return {
        title: (obj.title as string) ?? '未知会议',
        date: (obj.date as string) ?? '',
        duration: obj.duration as string | undefined,
        participants: Array.isArray(obj.participants)
          ? (obj.participants as string[])
          : [],
        overview: (obj.overview as string) ?? '',
        agendas: this.parseAgendas(obj.agendas),
        decisions: this.parseDecisions(obj.decisions),
        actionItems: this.parseActionItems(obj.actionItems),
        notes: obj.notes as string | undefined,
      };
    } catch (err) {
      throw new ServiceError(
        `Failed to parse summary JSON: ${err instanceof Error ? err.message : String(err)}`,
        ServiceErrorCode.GENERATION_FAILED,
        { cause: err instanceof Error ? err : undefined }
      );
    }
  }

  private parseAdviceJSON(raw: string): MeetingAdvice {
    const jsonStr = this.extractJSON(raw);

    try {
      const obj = JSON.parse(jsonStr) as Record<string, unknown>;

      const advice: MeetingAdvice = {
        efficiencyAssessment: obj.efficiencyAssessment as string | undefined,
        followUpSuggestions: Array.isArray(obj.followUpSuggestions)
          ? (obj.followUpSuggestions as string[])
          : [],
        risks: Array.isArray(obj.risks)
          ? (obj.risks as string[])
          : undefined,
        improvements: Array.isArray(obj.improvements)
          ? (obj.improvements as string[])
          : undefined,
        rawMarkdown: '',
      };

      // 生成 rawMarkdown
      advice.rawMarkdown = this.adviceToMarkdown(advice);
      return advice;
    } catch (err) {
      // 如果 JSON 解析失败，将原始文本作为 rawMarkdown 返回
      return {
        followUpSuggestions: [],
        rawMarkdown: raw,
      };
    }
  }

  /**
   * 从 LLM 输出中提取 JSON 字符串（处理可能包裹在 ```json ``` 中的情况）
   */
  private extractJSON(raw: string): string {
    let cleaned = raw.trim();
    // 移除 markdown 代码块
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1].trim();
    }
    // 尝试找到第一个 { 到最后一个 }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
    return cleaned;
  }

  private parseAgendas(raw: unknown): AgendaItem[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((item: Record<string, unknown>) => ({
      title: (item.title as string) ?? '',
      summary: (item.summary as string) ?? '',
      keyPoints: Array.isArray(item.keyPoints)
        ? (item.keyPoints as string[])
        : undefined,
    }));
  }

  private parseDecisions(raw: unknown): Decision[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((item: Record<string, unknown>) => ({
      content: (item.content as string) ?? '',
      participants: Array.isArray(item.participants)
        ? (item.participants as string[])
        : undefined,
    }));
  }

  private parseActionItems(raw: unknown): ActionItem[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((item: Record<string, unknown>) => ({
      assignee: (item.assignee as string) ?? '未指定',
      task: (item.task as string) ?? '',
      deadline: item.deadline as string | undefined,
      priority: this.parsePriority(item.priority),
    }));
  }

  private parsePriority(
    raw: unknown
  ): 'high' | 'medium' | 'low' | undefined {
    if (typeof raw !== 'string') return undefined;
    const v = raw.toLowerCase();
    if (v === 'high' || v === 'medium' || v === 'low') return v;
    return undefined;
  }

  // ── Markdown 输出 ──────────────────────────────────────────

  /**
   * 将结构化纪要数据转换为 Markdown 文档
   */
  toMarkdown(data: MeetingSummaryData): string {
    const lines: string[] = [];

    // 标题
    lines.push(`# ${data.title}`);
    lines.push('');

    // 元信息
    lines.push('## 📋 会议信息');
    lines.push('');
    lines.push(`- **日期**：${data.date}`);
    if (data.duration) {
      lines.push(`- **时长**：${data.duration}`);
    }
    if (data.participants.length > 0) {
      lines.push(`- **参与者**：${data.participants.join('、')}`);
    }
    lines.push('');

    // 概要
    lines.push('## 📝 会议概要');
    lines.push('');
    lines.push(data.overview);
    lines.push('');

    // 议题
    if (data.agendas.length > 0) {
      lines.push('## 📌 议题讨论');
      lines.push('');
      for (let i = 0; i < data.agendas.length; i++) {
        const agenda = data.agendas[i];
        lines.push(`### ${i + 1}. ${agenda.title}`);
        lines.push('');
        lines.push(agenda.summary);
        if (agenda.keyPoints && agenda.keyPoints.length > 0) {
          lines.push('');
          lines.push('**关键点：**');
          for (const point of agenda.keyPoints) {
            lines.push(`- ${point}`);
          }
        }
        lines.push('');
      }
    }

    // 决议
    if (data.decisions.length > 0) {
      lines.push('## ✅ 关键决议');
      lines.push('');
      for (const decision of data.decisions) {
        let line = `- ${decision.content}`;
        if (decision.participants && decision.participants.length > 0) {
          line += ` *(${decision.participants.join('、')})*`;
        }
        lines.push(line);
      }
      lines.push('');
    }

    // 待办事项
    if (data.actionItems.length > 0) {
      lines.push('## 🎯 待办事项');
      lines.push('');
      lines.push('| 负责人 | 任务 | 截止日期 | 优先级 |');
      lines.push('|--------|------|----------|--------|');
      for (const item of data.actionItems) {
        const priority = item.priority
          ? this.priorityEmoji(item.priority)
          : '-';
        const deadline = item.deadline ?? '-';
        lines.push(
          `| ${item.assignee} | ${item.task} | ${deadline} | ${priority} |`
        );
      }
      lines.push('');
    }

    // 备注
    if (data.notes) {
      lines.push('## 💡 备注');
      lines.push('');
      lines.push(data.notes);
      lines.push('');
    }

    // 页脚
    lines.push('---');
    lines.push(`*由 Obsidian Meeting Assistant 自动生成*`);
    lines.push('');

    return lines.join('\n');
  }

  private adviceToMarkdown(advice: MeetingAdvice): string {
    const lines: string[] = [];

    lines.push('## 📊 会议分析与建议');
    lines.push('');

    if (advice.efficiencyAssessment) {
      lines.push('### 效率评估');
      lines.push('');
      lines.push(advice.efficiencyAssessment);
      lines.push('');
    }

    if (advice.followUpSuggestions.length > 0) {
      lines.push('### 后续行动建议');
      lines.push('');
      for (const s of advice.followUpSuggestions) {
        lines.push(`- ${s}`);
      }
      lines.push('');
    }

    if (advice.risks && advice.risks.length > 0) {
      lines.push('### ⚠️ 风险提示');
      lines.push('');
      for (const r of advice.risks) {
        lines.push(`- ${r}`);
      }
      lines.push('');
    }

    if (advice.improvements && advice.improvements.length > 0) {
      lines.push('### 💡 改进建议');
      lines.push('');
      for (const imp of advice.improvements) {
        lines.push(`- ${imp}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // ── 辅助方法 ──────────────────────────────────────────────

  private formatTimestamp(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  private formatDuration(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}小时${minutes > 0 ? ` ${minutes}分钟` : ''}`;
    }
    return `${minutes}分钟`;
  }

  private priorityEmoji(priority: 'high' | 'medium' | 'low'): string {
    switch (priority) {
      case 'high':
        return '🔴 高';
      case 'medium':
        return '🟡 中';
      case 'low':
        return '🟢 低';
    }
  }
}
