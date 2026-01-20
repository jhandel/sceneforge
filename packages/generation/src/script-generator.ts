import * as fs from "fs/promises";
import * as path from "path";

/**
 * A single segment of narration with timing information.
 */
export interface ScriptSegment {
  stepId: string;
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  estimatedDurationMs: number;
  pauseBeforeMs?: number;
  pauseAfterMs?: number;
}

/**
 * Video step boundary for splitting videos per step.
 */
export interface StepBoundary {
  stepId: string;
  stepIndex: number;
  videoStartMs: number;
  videoEndMs: number;
}

/**
 * Complete script output with metadata.
 */
export interface ScriptOutput {
  demoName: string;
  title: string;
  generatedAt: string;
  totalDurationMs: number;
  segments: ScriptSegment[];
  stepBoundaries: StepBoundary[];
}

/**
 * Tracks narration segments during demo execution.
 */
export class ScriptGenerator {
  private segments: ScriptSegment[] = [];
  private stepBoundaries: StepBoundary[] = [];
  private currentStepId: string | null = null;
  private currentStepStartMs: number | null = null;
  private demoName: string;
  private title: string;
  private startTime: number;

  constructor(demoName: string, title: string, startTimeMs?: number) {
    this.demoName = demoName;
    this.title = title;
    this.startTime = startTimeMs ?? Date.now();
  }

  /**
   * Marks the start of a step (for video splitting).
   */
  startStep(stepId: string): void {
    // End previous step if there was one
    if (this.currentStepId && this.currentStepStartMs !== null) {
      this.stepBoundaries.push({
        stepId: this.currentStepId,
        stepIndex: this.stepBoundaries.length,
        videoStartMs: this.currentStepStartMs,
        videoEndMs: Date.now() - this.startTime,
      });
    }

    this.currentStepId = stepId;
    this.currentStepStartMs = Date.now() - this.startTime;
  }

  /**
   * Marks the end of all steps (call at demo completion).
   */
  finishAllSteps(): void {
    if (this.currentStepId && this.currentStepStartMs !== null) {
      this.stepBoundaries.push({
        stepId: this.currentStepId,
        stepIndex: this.stepBoundaries.length,
        videoStartMs: this.currentStepStartMs,
        videoEndMs: Date.now() - this.startTime,
      });
      this.currentStepId = null;
      this.currentStepStartMs = null;
    }
  }

  /**
   * Estimates reading duration for text.
   * Based on ~150 words per minute average speaking rate.
   */
  private estimateReadingDuration(text: string): number {
    const words = text.split(/\s+/).length;
    const wpm = 150; // Words per minute
    return Math.round((words / wpm) * 60 * 1000);
  }

  /**
   * Adds a narration segment with automatic timing.
   */
  addSegment(
    stepId: string,
    text: string,
    options?: {
      timing?: "on_start" | "on_complete";
      pauseBeforeMs?: number;
      pauseAfterMs?: number;
    }
  ): void {
    const now = Date.now();
    const startTimeMs = now - this.startTime;
    const estimatedDurationMs = this.estimateReadingDuration(text);

    this.segments.push({
      stepId,
      text,
      startTimeMs,
      endTimeMs: startTimeMs + estimatedDurationMs,
      estimatedDurationMs,
      pauseBeforeMs: options?.pauseBeforeMs,
      pauseAfterMs: options?.pauseAfterMs,
    });
  }

  /**
   * Updates the end time of the last segment.
   * Call this when a step completes to capture actual duration.
   */
  completeLastSegment(): void {
    if (this.segments.length > 0) {
      const lastSegment = this.segments[this.segments.length - 1];
      lastSegment.endTimeMs = Date.now() - this.startTime;
    }
  }

  /**
   * Generates the complete script output.
   */
  getOutput(): ScriptOutput {
    const now = Date.now();
    return {
      demoName: this.demoName,
      title: this.title,
      generatedAt: new Date().toISOString(),
      totalDurationMs: now - this.startTime,
      segments: this.segments,
      stepBoundaries: this.stepBoundaries,
    };
  }

  /**
   * Exports script as JSON.
   */
  async exportJSON(outputPath: string): Promise<void> {
    const output = this.getOutput();
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
  }

  /**
   * Exports script as SRT subtitle format.
   */
  async exportSRT(outputPath: string): Promise<void> {
    const output = this.getOutput();
    let srt = "";

    output.segments.forEach((segment, index) => {
      const startTime = formatSRTTime(segment.startTimeMs);
      const endTime = formatSRTTime(segment.endTimeMs);

      srt += `${index + 1}\n`;
      srt += `${startTime} --> ${endTime}\n`;
      srt += `${segment.text}\n\n`;
    });

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, srt.trim());
  }

  /**
   * Exports script in a format suitable for AI voice generation services.
   * Includes SSML-like pause markers.
   */
  async exportAIVoiceScript(outputPath: string): Promise<void> {
    const output = this.getOutput();

    interface AIVoiceSegment {
      index: number;
      stepId: string;
      text: string;
      ssmlHints: string;
      pauseBeforeMs: number;
      pauseAfterMs: number;
      syncPointMs: number;
    }

    const voiceScript = {
      demoName: output.demoName,
      title: output.title,
      totalDuration: formatReadableTime(output.totalDurationMs),
      segments: output.segments.map((segment, index) => ({
        index: index + 1,
        stepId: segment.stepId,
        text: segment.text,
        ssmlHints: generateSSMLHints(segment),
        pauseBeforeMs: segment.pauseBeforeMs || 0,
        pauseAfterMs: segment.pauseAfterMs || 500,
        syncPointMs: segment.startTimeMs,
      } satisfies AIVoiceSegment)),
    };

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(voiceScript, null, 2));
  }

  /**
   * Exports script as human-readable markdown for voice actors.
   */
  async exportMarkdown(outputPath: string): Promise<void> {
    const output = this.getOutput();

    let markdown = `# ${output.title}\n\n`;
    markdown += `**Demo:** ${output.demoName}\n`;
    markdown += `**Total Duration:** ${formatReadableTime(output.totalDurationMs)}\n`;
    markdown += `**Generated:** ${output.generatedAt}\n\n`;
    markdown += `---\n\n`;
    markdown += `## Script\n\n`;

    output.segments.forEach((segment, index) => {
      markdown += `### ${index + 1}. ${segment.stepId}\n\n`;
      markdown += `**Timing:** ${formatReadableTime(segment.startTimeMs)} - ${formatReadableTime(segment.endTimeMs)}\n\n`;

      if (segment.pauseBeforeMs) {
        markdown += `*[Pause ${segment.pauseBeforeMs}ms before]*\n\n`;
      }

      markdown += `> ${segment.text}\n\n`;

      if (segment.pauseAfterMs) {
        markdown += `*[Pause ${segment.pauseAfterMs}ms after]*\n\n`;
      }

      markdown += `---\n\n`;
    });

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, markdown);
  }
}

/**
 * Formats milliseconds to SRT timestamp format (HH:MM:SS,mmm).
 */
function formatSRTTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(milliseconds, 3)}`;
}

/**
 * Formats milliseconds to human-readable time (M:SS or H:MM:SS).
 */
function formatReadableTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${pad(minutes, 2)}:${pad(seconds, 2)}`;
  }
  return `${minutes}:${pad(seconds, 2)}`;
}

/**
 * Pads a number with leading zeros.
 */
function pad(num: number, size: number): string {
  let s = num.toString();
  while (s.length < size) s = "0" + s;
  return s;
}

/**
 * Generates SSML hints for AI voice services.
 */
function generateSSMLHints(segment: ScriptSegment): string {
  let ssml = segment.text;

  // Add break before if specified
  if (segment.pauseBeforeMs) {
    ssml = `<break time="${segment.pauseBeforeMs}ms"/> ${ssml}`;
  }

  // Add break after if specified
  if (segment.pauseAfterMs) {
    ssml = `${ssml} <break time="${segment.pauseAfterMs}ms"/>`;
  }

  return ssml;
}

/**
 * Creates a new ScriptGenerator instance.
 */
export function createScriptGenerator(
  demoName: string,
  title: string,
  startTimeMs?: number
): ScriptGenerator {
  return new ScriptGenerator(demoName, title, startTimeMs);
}
