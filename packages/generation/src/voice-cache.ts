import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Voice settings that affect the generated audio output
 */
export interface VoiceCacheSettings {
  stability: number;
  similarityBoost: number;
  style: number;
  useSpeakerBoost: boolean;
}

/**
 * A single entry in the voice cache
 */
export interface VoiceCacheEntry {
  key: string;
  voiceId: string;
  modelId: string;
  text: string;
  voiceSettings: VoiceCacheSettings;
  audioFileName: string;
  durationMs: number;
  fileSizeBytes: number;
  createdAt: string;
  lastUsedAt: string;
}

/**
 * The cache index structure stored on disk
 */
export interface VoiceCacheIndex {
  version: number;
  entries: Record<string, VoiceCacheEntry>;
}

/**
 * Configuration for the voice cache
 */
export interface VoiceCacheConfig {
  /** Directory where cache files are stored */
  cacheDir: string;
  /** Whether caching is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Statistics about the voice cache
 */
export interface VoiceCacheStats {
  totalEntries: number;
  totalSizeBytes: number;
  oldestEntry: string | null;
  newestEntry: string | null;
  hitCount: number;
  missCount: number;
}

const CACHE_VERSION = 1;
const INDEX_FILE = "index.json";
const AUDIO_DIR = "audio";

/**
 * Default voice settings used when none are specified
 */
export const DEFAULT_VOICE_SETTINGS: VoiceCacheSettings = {
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0.0,
  useSpeakerBoost: true,
};

/**
 * Normalizes voice settings by applying defaults for missing values
 */
export function normalizeVoiceSettings(
  settings?: Partial<VoiceCacheSettings>
): VoiceCacheSettings {
  return {
    stability: settings?.stability ?? DEFAULT_VOICE_SETTINGS.stability,
    similarityBoost: settings?.similarityBoost ?? DEFAULT_VOICE_SETTINGS.similarityBoost,
    style: settings?.style ?? DEFAULT_VOICE_SETTINGS.style,
    useSpeakerBoost: settings?.useSpeakerBoost ?? DEFAULT_VOICE_SETTINGS.useSpeakerBoost,
  };
}

/**
 * Generates a deterministic cache key from voice synthesis parameters.
 * The key is a SHA-256 hash of the normalized inputs.
 */
export function generateCacheKey(
  voiceId: string,
  modelId: string,
  text: string,
  voiceSettings: VoiceCacheSettings
): string {
  // Normalize text by trimming whitespace
  const normalizedText = text.trim();

  // Create a deterministic string representation of all parameters
  const keyData = JSON.stringify({
    voiceId,
    modelId,
    text: normalizedText,
    voiceSettings: {
      stability: voiceSettings.stability,
      similarityBoost: voiceSettings.similarityBoost,
      style: voiceSettings.style,
      useSpeakerBoost: voiceSettings.useSpeakerBoost,
    },
  });

  // Generate SHA-256 hash
  return crypto.createHash("sha256").update(keyData).digest("hex");
}

/**
 * Voice cache manager for storing and retrieving synthesized audio.
 * This helps avoid duplicate API calls to ElevenLabs for the same text/voice combinations.
 */
export class VoiceCache {
  private config: VoiceCacheConfig;
  private index: VoiceCacheIndex | null = null;
  private stats: { hits: number; misses: number } = { hits: 0, misses: 0 };
  private indexDirty = false;

  constructor(config: VoiceCacheConfig) {
    this.config = {
      ...config,
      enabled: config.enabled ?? true,
    };
  }

  /**
   * Gets the path to the cache index file
   */
  private get indexPath(): string {
    return path.join(this.config.cacheDir, INDEX_FILE);
  }

  /**
   * Gets the path to the audio cache directory
   */
  private get audioDir(): string {
    return path.join(this.config.cacheDir, AUDIO_DIR);
  }

  /**
   * Whether caching is enabled
   */
  get enabled(): boolean {
    return this.config.enabled ?? true;
  }

  /**
   * Initializes the cache directory and loads the index
   */
  async initialize(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    // Ensure cache directories exist
    await fs.mkdir(this.config.cacheDir, { recursive: true });
    await fs.mkdir(this.audioDir, { recursive: true });

    // Load existing index or create new one
    await this.loadIndex();
  }

  /**
   * Loads the cache index from disk
   */
  private async loadIndex(): Promise<void> {
    try {
      const content = await fs.readFile(this.indexPath, "utf-8");
      const parsed = JSON.parse(content) as VoiceCacheIndex;

      // Handle version migrations if needed
      if (parsed.version !== CACHE_VERSION) {
        console.warn(
          `[voice-cache] Index version mismatch (${parsed.version} vs ${CACHE_VERSION}), rebuilding cache`
        );
        this.index = { version: CACHE_VERSION, entries: {} };
        this.indexDirty = true;
        return;
      }

      this.index = parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // Index doesn't exist, create a new one
        this.index = { version: CACHE_VERSION, entries: {} };
        this.indexDirty = true;
      } else {
        console.warn(`[voice-cache] Failed to load index, creating new one:`, error);
        this.index = { version: CACHE_VERSION, entries: {} };
        this.indexDirty = true;
      }
    }
  }

  /**
   * Saves the cache index to disk
   */
  async saveIndex(): Promise<void> {
    if (!this.enabled || !this.index || !this.indexDirty) {
      return;
    }

    await fs.writeFile(this.indexPath, JSON.stringify(this.index, null, 2));
    this.indexDirty = false;
  }

  /**
   * Looks up a cached audio file by its synthesis parameters.
   * Returns the cache entry if found, null otherwise.
   */
  async get(
    voiceId: string,
    modelId: string,
    text: string,
    voiceSettings: VoiceCacheSettings
  ): Promise<VoiceCacheEntry | null> {
    if (!this.enabled || !this.index) {
      this.stats.misses++;
      return null;
    }

    const key = generateCacheKey(voiceId, modelId, text, voiceSettings);
    const entry = this.index.entries[key];

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Verify the cached file still exists
    const audioPath = path.join(this.audioDir, entry.audioFileName);
    try {
      await fs.access(audioPath);
    } catch {
      // File doesn't exist, remove from index
      delete this.index.entries[key];
      this.indexDirty = true;
      this.stats.misses++;
      return null;
    }

    // Update last used timestamp
    entry.lastUsedAt = new Date().toISOString();
    this.indexDirty = true;
    this.stats.hits++;

    return entry;
  }

  /**
   * Gets the full path to a cached audio file
   */
  getAudioPath(entry: VoiceCacheEntry): string {
    return path.join(this.audioDir, entry.audioFileName);
  }

  /**
   * Stores a synthesized audio file in the cache.
   * The audio data should be provided as a Buffer.
   */
  async put(
    voiceId: string,
    modelId: string,
    text: string,
    voiceSettings: VoiceCacheSettings,
    audioData: Buffer,
    durationMs: number
  ): Promise<VoiceCacheEntry> {
    if (!this.index) {
      await this.initialize();
    }

    const key = generateCacheKey(voiceId, modelId, text, voiceSettings);
    const audioFileName = `${key}.mp3`;
    const audioPath = path.join(this.audioDir, audioFileName);

    // Write audio file
    await fs.writeFile(audioPath, audioData);

    const now = new Date().toISOString();
    const entry: VoiceCacheEntry = {
      key,
      voiceId,
      modelId,
      text: text.trim(),
      voiceSettings,
      audioFileName,
      durationMs,
      fileSizeBytes: audioData.length,
      createdAt: now,
      lastUsedAt: now,
    };

    this.index!.entries[key] = entry;
    this.indexDirty = true;

    return entry;
  }

  /**
   * Removes a specific entry from the cache
   */
  async remove(key: string): Promise<boolean> {
    if (!this.enabled || !this.index) {
      return false;
    }

    const entry = this.index.entries[key];
    if (!entry) {
      return false;
    }

    // Delete the audio file
    const audioPath = path.join(this.audioDir, entry.audioFileName);
    try {
      await fs.unlink(audioPath);
    } catch {
      // File might not exist, that's okay
    }

    delete this.index.entries[key];
    this.indexDirty = true;

    return true;
  }

  /**
   * Clears all entries from the cache
   */
  async clear(): Promise<number> {
    if (!this.index) {
      await this.initialize();
    }

    const count = Object.keys(this.index!.entries).length;

    // Delete all audio files
    try {
      const files = await fs.readdir(this.audioDir);
      await Promise.all(
        files.map((file) => fs.unlink(path.join(this.audioDir, file)).catch(() => {}))
      );
    } catch {
      // Directory might not exist
    }

    this.index!.entries = {};
    this.indexDirty = true;
    await this.saveIndex();

    return count;
  }

  /**
   * Lists all entries in the cache
   */
  async list(): Promise<VoiceCacheEntry[]> {
    if (!this.index) {
      await this.initialize();
    }

    return Object.values(this.index!.entries).sort(
      (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
    );
  }

  /**
   * Gets statistics about the cache
   */
  async getStats(): Promise<VoiceCacheStats> {
    if (!this.index) {
      await this.initialize();
    }

    const entries = Object.values(this.index!.entries);
    const totalSizeBytes = entries.reduce((sum, e) => sum + e.fileSizeBytes, 0);

    let oldestEntry: string | null = null;
    let newestEntry: string | null = null;

    if (entries.length > 0) {
      const sorted = [...entries].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      oldestEntry = sorted[0].createdAt;
      newestEntry = sorted[sorted.length - 1].createdAt;
    }

    return {
      totalEntries: entries.length,
      totalSizeBytes,
      oldestEntry,
      newestEntry,
      hitCount: this.stats.hits,
      missCount: this.stats.misses,
    };
  }

  /**
   * Prunes entries older than the specified age (in days)
   */
  async pruneOlderThan(days: number): Promise<number> {
    if (!this.index) {
      await this.initialize();
    }

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const [key, entry] of Object.entries(this.index!.entries)) {
      const lastUsed = new Date(entry.lastUsedAt).getTime();
      if (lastUsed < cutoff) {
        await this.remove(key);
        removed++;
      }
    }

    await this.saveIndex();
    return removed;
  }

  /**
   * Validates the cache by checking that all indexed files exist
   * and removing orphaned entries
   */
  async validate(): Promise<{ valid: number; removed: number }> {
    if (!this.index) {
      await this.initialize();
    }

    let valid = 0;
    let removed = 0;

    for (const [key, entry] of Object.entries(this.index!.entries)) {
      const audioPath = path.join(this.audioDir, entry.audioFileName);
      try {
        await fs.access(audioPath);
        valid++;
      } catch {
        delete this.index!.entries[key];
        this.indexDirty = true;
        removed++;
      }
    }

    if (removed > 0) {
      await this.saveIndex();
    }

    return { valid, removed };
  }
}

/**
 * Creates a new VoiceCache instance with the given configuration
 */
export function createVoiceCache(config: VoiceCacheConfig): VoiceCache {
  return new VoiceCache(config);
}

/**
 * Gets the default cache directory path
 */
export function getDefaultCacheDir(projectRoot?: string): string {
  const root = projectRoot || process.cwd();
  return path.join(root, ".voice-cache");
}
