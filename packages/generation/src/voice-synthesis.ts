import { spawn } from "child_process";
import { ElevenLabsClient } from "elevenlabs";
import * as fs from "fs/promises";
import * as path from "path";

const DEFAULT_MAX_OUTPUT_BYTES = 512 * 1024;
const DEFAULT_MAX_CONCURRENCY = 2;
const DEFAULT_RETRY_OPTIONS = {
  retries: 3,
  minDelayMs: 500,
  maxDelayMs: 8000,
};

function sanitizeFileSegment(value: string, fallback = "segment", maxLength = 80): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return fallback;
  }

  const cleaned = raw.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const collapsed = cleaned.replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "");
  const safe = collapsed || fallback;
  const trimmed = safe.length > maxLength ? safe.slice(0, maxLength) : safe;

  if (trimmed === "." || trimmed === "..") {
    return fallback;
  }

  return trimmed;
}

function appendWithLimit(buffer: string, chunk: string, limit: number): string {
  const next = buffer + chunk;
  if (next.length <= limit) {
    return next;
  }
  return next.slice(next.length - limit);
}

function runCommand(
  command: string,
  args: string[],
  options: { stdio?: Array<"ignore" | "pipe">; cwd?: string; maxOutputBytes?: number } = {}
) {
  const {
    stdio = ["ignore", "pipe", "pipe"],
    cwd,
    maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
  } = options;
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio, cwd });
    let stdout = "";
    let stderr = "";

    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        stdout = appendWithLimit(stdout, chunk.toString(), maxOutputBytes);
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        stderr = appendWithLimit(stderr, chunk.toString(), maxOutputBytes);
      });
    }

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(`${command} exited with code ${code}`);
      (error as Error & { code?: number; stderr?: string }).code = code ?? undefined;
      (error as Error & { code?: number; stderr?: string }).stderr = stderr;
      reject(error);
    });
  });
}

async function probeMediaDurationMs(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await runCommand("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const durationSec = parseFloat(stdout.trim());
    if (Number.isFinite(durationSec)) {
      return Math.round(durationSec * 1000);
    }
  } catch {
    return null;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RetryOptions {
  retries?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
}

function getStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const maybeError = error as {
    status?: number;
    statusCode?: number;
    response?: { status?: number };
  };
  return maybeError.status ?? maybeError.statusCode ?? maybeError.response?.status;
}

function getHeaderValue(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== "object") {
    return null;
  }
  const getter = (headers as { get?: unknown }).get;
  if (typeof getter === "function") {
    return getter.call(headers, name);
  }
  const record = headers as Record<string, string>;
  const direct = record[name];
  if (typeof direct === "string") {
    return direct;
  }
  const lower = record[name.toLowerCase()];
  if (typeof lower === "string") {
    return lower;
  }
  const upper = record[name.toUpperCase()];
  if (typeof upper === "string") {
    return upper;
  }
  return null;
}

function getRetryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const maybeError = error as {
    retryAfter?: string | number;
    response?: { headers?: Record<string, string> | { get?: (name: string) => string | null } };
  };
  const headerValue = getHeaderValue(maybeError.response?.headers, "retry-after");
  const retryAfter = headerValue ?? maybeError.retryAfter;
  if (retryAfter === undefined || retryAfter === null) {
    return null;
  }
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.round(seconds * 1000));
  }
  return null;
}

function isRetryableError(error: unknown): boolean {
  const status = getStatusCode(error);
  if (status && [408, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }
  const message = String((error as Error | undefined)?.message ?? "");
  return /(rate limit|timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up)/i.test(message);
}

function getRetryDelayMs(attempt: number, options: RetryOptions, error: unknown): number {
  const minDelayMs = options.minDelayMs ?? DEFAULT_RETRY_OPTIONS.minDelayMs;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_RETRY_OPTIONS.maxDelayMs;
  const baseDelay = Math.min(maxDelayMs, minDelayMs * 2 ** attempt);
  const jitter = 0.5 + Math.random();
  const retryAfterMs = getRetryAfterMs(error) ?? 0;
  return Math.max(retryAfterMs, Math.round(baseDelay * jitter));
}

async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? DEFAULT_RETRY_OPTIONS.retries;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryableError(error) || attempt >= retries) {
        throw error;
      }
      const delayMs = getRetryDelayMs(attempt, options, error);
      await sleep(delayMs);
      attempt += 1;
    }
  }
}

/**
 * Configuration for voice synthesis
 */
export interface VoiceSynthesisConfig {
  apiKey: string;
  voiceId: string; // Custom voice ID from ElevenLabs
  modelId?: string; // Default: eleven_multilingual_v2
  outputFormat?: "mp3_44100_128" | "mp3_44100_192" | "pcm_16000" | "pcm_22050" | "pcm_24000";
}

/**
 * Script segment from the generated JSON
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
 * Generated script JSON structure
 */
export interface GeneratedScript {
  demoName: string;
  title: string;
  generatedAt: string;
  totalDurationMs: number;
  segments: ScriptSegment[];
}

/**
 * Result of synthesizing a segment
 */
export interface SynthesizedSegment {
  stepId: string;
  audioPath: string;
  durationMs: number;
  text: string;
}

/**
 * Result of full voice synthesis
 */
export interface VoiceSynthesisResult {
  demoName: string;
  segments: SynthesizedSegment[];
  combinedAudioPath?: string;
  soundEffectsPath?: string;
  backgroundMusicPath?: string;
}

/**
 * ElevenLabs voice synthesizer for demo narration
 */
export class VoiceSynthesizer {
  private client: ElevenLabsClient;
  private config: VoiceSynthesisConfig;

  constructor(config: VoiceSynthesisConfig) {
    this.config = config;
    this.client = new ElevenLabsClient({
      apiKey: config.apiKey,
    });
  }

  /**
   * List available voices (useful for finding voice IDs)
   */
  async listVoices(): Promise<Array<{ voiceId: string; name: string; category: string }>> {
    const response = await this.client.voices.getAll();
    return response.voices.map((voice) => ({
      voiceId: voice.voice_id,
      name: voice.name || "Unnamed",
      category: voice.category || "unknown",
    }));
  }

  /**
   * Synthesize a single text segment to audio
   */
  async synthesizeSegment(
    text: string,
    outputPath: string,
    options?: {
      stability?: number; // 0-1, higher = more consistent
      similarityBoost?: number; // 0-1, higher = more similar to original voice
      style?: number; // 0-1, style exaggeration
      useSpeakerBoost?: boolean;
    }
  ): Promise<{ durationMs: number }> {
    const audio = await this.client.textToSpeech.convert(this.config.voiceId, {
      text,
      model_id: this.config.modelId || "eleven_multilingual_v2",
      voice_settings: {
        stability: options?.stability ?? 0.5,
        similarity_boost: options?.similarityBoost ?? 0.75,
        style: options?.style ?? 0.0,
        use_speaker_boost: options?.useSpeakerBoost ?? true,
      },
    });

    // Collect audio chunks
    const chunks: Buffer[] = [];
    for await (const chunk of audio) {
      chunks.push(Buffer.from(chunk));
    }
    const audioBuffer = Buffer.concat(chunks);

    // Write to file
    await fs.writeFile(outputPath, audioBuffer);

    const probedDurationMs = await probeMediaDurationMs(outputPath);
    if (probedDurationMs !== null) {
      return { durationMs: probedDurationMs };
    }

    const fileSizeBytes = audioBuffer.length;
    const estimatedDurationMs = Math.round((fileSizeBytes * 8) / 128); // 128kbps
    console.warn(`[voice] ffprobe unavailable, using estimated duration for ${outputPath}`);
    return { durationMs: estimatedDurationMs };
  }

  /**
   * Generate a sound effect from text description
   */
  async generateSoundEffect(
    description: string,
    outputPath: string,
    options?: {
      durationSeconds?: number; // 0.5-30
      promptInfluence?: number; // 0-1
      retry?: RetryOptions;
    }
  ): Promise<void> {
    const audio = await withRetry(
      () =>
        this.client.textToSoundEffects.convert({
          text: description,
          duration_seconds: options?.durationSeconds ?? 1.0,
          prompt_influence: options?.promptInfluence ?? 0.3,
        }),
      options?.retry
    );

    const chunks: Buffer[] = [];
    for await (const chunk of audio) {
      chunks.push(Buffer.from(chunk));
    }
    await fs.writeFile(outputPath, Buffer.concat(chunks));
  }

  /**
   * Synthesize all segments from a script JSON file
   */
  async synthesizeScript(
    scriptPath: string,
    outputDir: string,
    options?: {
      voiceSettings?: {
        stability?: number;
        similarityBoost?: number;
        style?: number;
      };
      generateClickSounds?: boolean;
      onProgress?: (current: number, total: number, stepId: string) => void;
      maxConcurrency?: number;
      retry?: RetryOptions;
    }
  ): Promise<VoiceSynthesisResult> {
    // Read script
    const scriptContent = await fs.readFile(scriptPath, "utf-8");
    const script: GeneratedScript = JSON.parse(scriptContent);

    // Ensure output directory exists
    const audioDir = path.join(outputDir, "audio", script.demoName);
    await fs.mkdir(audioDir, { recursive: true });

    const synthesizedSegments: SynthesizedSegment[] = new Array(script.segments.length);
    const maxConcurrency = Math.max(
      1,
      options?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY
    );
    let progressCount = 0;
    let nextIndex = 0;

    const workers = Array.from({ length: Math.min(maxConcurrency, script.segments.length) }, async () => {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= script.segments.length) {
          break;
        }

        const segment = script.segments[index];
        const safeStepId = sanitizeFileSegment(segment.stepId, `step-${index + 1}`);
        const audioFileName = `${String(index + 1).padStart(2, "0")}_${safeStepId}.mp3`;
        const audioPath = path.join(audioDir, audioFileName);

        progressCount += 1;
        options?.onProgress?.(progressCount, script.segments.length, segment.stepId);

        try {
          const result = await withRetry(
            () => this.synthesizeSegment(segment.text, audioPath, options?.voiceSettings),
            options?.retry
          );

          synthesizedSegments[index] = {
            stepId: segment.stepId,
            audioPath,
            durationMs: result.durationMs,
            text: segment.text,
          };

          console.log(`[voice] Synthesized: ${segment.stepId} (${result.durationMs.toFixed(0)}ms)`);
        } catch (error) {
          console.error(`[voice] Failed to synthesize ${segment.stepId}:`, error);
          throw error;
        }
      }
    });

    await Promise.all(workers);

    // Generate click sounds if requested
    let soundEffectsPath: string | undefined;
    if (options?.generateClickSounds) {
      soundEffectsPath = path.join(audioDir, "click.mp3");
      await this.generateClickSound(soundEffectsPath);
    }

    return {
      demoName: script.demoName,
      segments: synthesizedSegments,
      soundEffectsPath,
    };
  }

  /**
   * Generate a UI click sound effect
   */
  async generateClickSound(outputPath: string): Promise<void> {
    await this.generateSoundEffect(
      "soft UI button click, subtle, digital, clean interface sound",
      outputPath,
      { durationSeconds: 0.5, promptInfluence: 0.5 }
    );
    console.log("[voice] Generated click sound effect");
  }

  /**
   * Generate ambient background music
   */
  async generateBackgroundMusic(
    outputPath: string,
    options?: {
      style?: "corporate" | "tech" | "calm" | "upbeat";
      durationSeconds?: number;
    }
  ): Promise<void> {
    const styleDescriptions: Record<string, string> = {
      corporate: "soft corporate background music, professional, minimal, ambient technology sounds",
      tech: "modern technology background music, subtle electronic, innovative, clean",
      calm: "calm ambient background music, peaceful, soft piano, gentle",
      upbeat: "light upbeat background music, positive, motivational, subtle energy",
    };

    const description = styleDescriptions[options?.style || "tech"];
    const duration = options?.durationSeconds ?? 30;

    // Note: ElevenLabs sound effects max is 30 seconds
    // For longer music, you'd need to loop or use their music generation API
    await this.generateSoundEffect(description, outputPath, {
      durationSeconds: Math.min(duration, 30),
      promptInfluence: 0.4,
    });
    console.log(`[voice] Generated background music (${options?.style || "tech"} style)`);
  }
}

/**
 * Create a timing manifest for video editing
 * Maps audio files to their intended start times in the video
 */
export interface AudioTimingManifest {
  demoName: string;
  segments: Array<{
    stepId: string;
    audioFile: string;
    videoStartTimeMs: number;
    audioDurationMs: number;
    text: string;
  }>;
  soundEffects?: {
    clickSound?: string;
  };
  backgroundMusic?: string;
}

/**
 * Generate a timing manifest from synthesized results and original script
 */
export async function generateTimingManifest(
  scriptPath: string,
  synthesisResult: VoiceSynthesisResult,
  outputPath: string
): Promise<AudioTimingManifest> {
  const scriptContent = await fs.readFile(scriptPath, "utf-8");
  const script: GeneratedScript = JSON.parse(scriptContent);

  const manifest: AudioTimingManifest = {
    demoName: script.demoName,
    segments: synthesisResult.segments.map((synth) => {
      const originalSegment = script.segments.find((s) => s.stepId === synth.stepId);
      return {
        stepId: synth.stepId,
        audioFile: synth.audioPath,
        videoStartTimeMs: originalSegment?.startTimeMs ?? 0,
        audioDurationMs: synth.durationMs,
        text: synth.text,
      };
    }),
    soundEffects: synthesisResult.soundEffectsPath
      ? { clickSound: synthesisResult.soundEffectsPath }
      : undefined,
    backgroundMusic: synthesisResult.backgroundMusicPath,
  };

  await fs.writeFile(outputPath, JSON.stringify(manifest, null, 2));
  return manifest;
}

/**
 * Default export for easy instantiation
 */
export function createVoiceSynthesizer(config: VoiceSynthesisConfig): VoiceSynthesizer {
  return new VoiceSynthesizer(config);
}
