import { ElevenLabsClient } from "elevenlabs";
import * as fs from "fs/promises";
import * as path from "path";

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

    // Estimate duration from file size (rough approximation for MP3 at 128kbps)
    // More accurate would be to use a library to read MP3 duration
    const fileSizeBytes = audioBuffer.length;
    const estimatedDurationMs = (fileSizeBytes * 8) / 128; // 128kbps

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
    }
  ): Promise<void> {
    const audio = await this.client.textToSoundEffects.convert({
      text: description,
      duration_seconds: options?.durationSeconds ?? 1.0,
      prompt_influence: options?.promptInfluence ?? 0.3,
    });

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
    }
  ): Promise<VoiceSynthesisResult> {
    // Read script
    const scriptContent = await fs.readFile(scriptPath, "utf-8");
    const script: GeneratedScript = JSON.parse(scriptContent);

    // Ensure output directory exists
    const audioDir = path.join(outputDir, "audio", script.demoName);
    await fs.mkdir(audioDir, { recursive: true });

    const synthesizedSegments: SynthesizedSegment[] = [];

    // Synthesize each segment
    for (let i = 0; i < script.segments.length; i++) {
      const segment = script.segments[i];
      const audioFileName = `${String(i + 1).padStart(2, "0")}_${segment.stepId}.mp3`;
      const audioPath = path.join(audioDir, audioFileName);

      options?.onProgress?.(i + 1, script.segments.length, segment.stepId);

      try {
        const result = await this.synthesizeSegment(segment.text, audioPath, options?.voiceSettings);

        synthesizedSegments.push({
          stepId: segment.stepId,
          audioPath,
          durationMs: result.durationMs,
          text: segment.text,
        });

        console.log(`[voice] Synthesized: ${segment.stepId} (${result.durationMs.toFixed(0)}ms)`);
      } catch (error) {
        console.error(`[voice] Failed to synthesize ${segment.stepId}:`, error);
        throw error;
      }
    }

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
