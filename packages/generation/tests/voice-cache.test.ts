import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  VoiceCache,
  generateCacheKey,
  normalizeVoiceSettings,
  getDefaultCacheDir,
  DEFAULT_VOICE_SETTINGS,
  type VoiceCacheSettings,
} from "../src/voice-cache";

describe("voice cache utilities", () => {
  describe("generateCacheKey", () => {
    it("generates consistent keys for same inputs", () => {
      const settings: VoiceCacheSettings = {
        stability: 0.5,
        similarityBoost: 0.75,
        style: 0.0,
        useSpeakerBoost: true,
      };

      const key1 = generateCacheKey("voice-123", "model-v2", "Hello world", settings);
      const key2 = generateCacheKey("voice-123", "model-v2", "Hello world", settings);

      expect(key1).toBe(key2);
      expect(key1).toHaveLength(64); // SHA-256 hex length
    });

    it("generates different keys for different voice IDs", () => {
      const settings: VoiceCacheSettings = DEFAULT_VOICE_SETTINGS;

      const key1 = generateCacheKey("voice-123", "model-v2", "Hello", settings);
      const key2 = generateCacheKey("voice-456", "model-v2", "Hello", settings);

      expect(key1).not.toBe(key2);
    });

    it("generates different keys for different text", () => {
      const settings: VoiceCacheSettings = DEFAULT_VOICE_SETTINGS;

      const key1 = generateCacheKey("voice-123", "model-v2", "Hello", settings);
      const key2 = generateCacheKey("voice-123", "model-v2", "Goodbye", settings);

      expect(key1).not.toBe(key2);
    });

    it("generates different keys for different model IDs", () => {
      const settings: VoiceCacheSettings = DEFAULT_VOICE_SETTINGS;

      const key1 = generateCacheKey("voice-123", "model-v1", "Hello", settings);
      const key2 = generateCacheKey("voice-123", "model-v2", "Hello", settings);

      expect(key1).not.toBe(key2);
    });

    it("generates different keys for different voice settings", () => {
      const settings1: VoiceCacheSettings = { ...DEFAULT_VOICE_SETTINGS, stability: 0.5 };
      const settings2: VoiceCacheSettings = { ...DEFAULT_VOICE_SETTINGS, stability: 0.8 };

      const key1 = generateCacheKey("voice-123", "model-v2", "Hello", settings1);
      const key2 = generateCacheKey("voice-123", "model-v2", "Hello", settings2);

      expect(key1).not.toBe(key2);
    });

    it("normalizes text by trimming whitespace", () => {
      const settings: VoiceCacheSettings = DEFAULT_VOICE_SETTINGS;

      const key1 = generateCacheKey("voice-123", "model-v2", "  Hello world  ", settings);
      const key2 = generateCacheKey("voice-123", "model-v2", "Hello world", settings);

      expect(key1).toBe(key2);
    });
  });

  describe("normalizeVoiceSettings", () => {
    it("returns defaults when no settings provided", () => {
      const normalized = normalizeVoiceSettings();

      expect(normalized).toEqual(DEFAULT_VOICE_SETTINGS);
    });

    it("returns defaults when empty object provided", () => {
      const normalized = normalizeVoiceSettings({});

      expect(normalized).toEqual(DEFAULT_VOICE_SETTINGS);
    });

    it("preserves provided values and fills defaults", () => {
      const normalized = normalizeVoiceSettings({ stability: 0.8 });

      expect(normalized.stability).toBe(0.8);
      expect(normalized.similarityBoost).toBe(DEFAULT_VOICE_SETTINGS.similarityBoost);
      expect(normalized.style).toBe(DEFAULT_VOICE_SETTINGS.style);
      expect(normalized.useSpeakerBoost).toBe(DEFAULT_VOICE_SETTINGS.useSpeakerBoost);
    });

    it("handles all settings being provided", () => {
      const custom: VoiceCacheSettings = {
        stability: 0.9,
        similarityBoost: 0.6,
        style: 0.3,
        useSpeakerBoost: false,
      };

      const normalized = normalizeVoiceSettings(custom);

      expect(normalized).toEqual(custom);
    });
  });

  describe("getDefaultCacheDir", () => {
    it("returns .voice-cache in project root", () => {
      const cacheDir = getDefaultCacheDir("/my/project");

      expect(cacheDir).toBe("/my/project/.voice-cache");
    });

    it("uses cwd when no project root provided", () => {
      const cacheDir = getDefaultCacheDir();

      expect(cacheDir).toBe(path.join(process.cwd(), ".voice-cache"));
    });
  });
});

describe("VoiceCache", () => {
  let tempDir: string;
  let cache: VoiceCache;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = path.join(os.tmpdir(), `voice-cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });

    cache = new VoiceCache({ cacheDir: tempDir, enabled: true });
    await cache.initialize();
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("initialization", () => {
    it("creates cache directories on initialize", async () => {
      const indexExists = await fs.access(path.join(tempDir, "index.json")).then(() => true).catch(() => false);
      const audioDirExists = await fs.access(path.join(tempDir, "audio")).then(() => true).catch(() => false);

      expect(audioDirExists).toBe(true);
      // Index is created lazily or on first save
    });

    it("enabled property reflects config", () => {
      expect(cache.enabled).toBe(true);

      const disabledCache = new VoiceCache({ cacheDir: tempDir, enabled: false });
      expect(disabledCache.enabled).toBe(false);
    });
  });

  describe("put and get", () => {
    const voiceId = "test-voice-id";
    const modelId = "eleven_multilingual_v2";
    const text = "Hello, this is a test.";
    const settings: VoiceCacheSettings = DEFAULT_VOICE_SETTINGS;
    const audioData = Buffer.from("fake audio data for testing");
    const durationMs = 1500;

    it("stores and retrieves cache entries", async () => {
      // Store
      const entry = await cache.put(voiceId, modelId, text, settings, audioData, durationMs);

      expect(entry.voiceId).toBe(voiceId);
      expect(entry.modelId).toBe(modelId);
      expect(entry.text).toBe(text.trim());
      expect(entry.durationMs).toBe(durationMs);
      expect(entry.fileSizeBytes).toBe(audioData.length);

      // Retrieve
      const retrieved = await cache.get(voiceId, modelId, text, settings);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.key).toBe(entry.key);
      expect(retrieved!.durationMs).toBe(durationMs);
    });

    it("returns null for cache miss", async () => {
      const result = await cache.get(voiceId, modelId, "nonexistent text", settings);

      expect(result).toBeNull();
    });

    it("retrieves correct audio file path", async () => {
      const entry = await cache.put(voiceId, modelId, text, settings, audioData, durationMs);
      const audioPath = cache.getAudioPath(entry);

      expect(audioPath).toContain(tempDir);
      expect(audioPath).toContain(entry.audioFileName);

      // Verify file exists
      const fileExists = await fs.access(audioPath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      // Verify content
      const content = await fs.readFile(audioPath);
      expect(content.equals(audioData)).toBe(true);
    });

    it("updates lastUsedAt on cache hit", async () => {
      await cache.put(voiceId, modelId, text, settings, audioData, durationMs);

      // Wait a tiny bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const retrieved = await cache.get(voiceId, modelId, text, settings);
      const firstUsedAt = retrieved!.lastUsedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));

      const retrieved2 = await cache.get(voiceId, modelId, text, settings);
      const secondUsedAt = retrieved2!.lastUsedAt;

      expect(new Date(secondUsedAt).getTime()).toBeGreaterThanOrEqual(new Date(firstUsedAt).getTime());
    });
  });

  describe("list", () => {
    it("returns empty array for empty cache", async () => {
      const entries = await cache.list();

      expect(entries).toEqual([]);
    });

    it("returns all entries sorted by lastUsedAt descending", async () => {
      const settings = DEFAULT_VOICE_SETTINGS;
      const audioData = Buffer.from("test");

      await cache.put("voice1", "model", "text1", settings, audioData, 1000);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await cache.put("voice2", "model", "text2", settings, audioData, 2000);

      const entries = await cache.list();

      expect(entries).toHaveLength(2);
      // Most recently used should be first
      expect(entries[0].text).toBe("text2");
      expect(entries[1].text).toBe("text1");
    });
  });

  describe("remove", () => {
    it("removes specific entry from cache", async () => {
      const settings = DEFAULT_VOICE_SETTINGS;
      const audioData = Buffer.from("test");

      const entry = await cache.put("voice1", "model", "text1", settings, audioData, 1000);

      const removed = await cache.remove(entry.key);
      expect(removed).toBe(true);

      const retrieved = await cache.get("voice1", "model", "text1", settings);
      expect(retrieved).toBeNull();
    });

    it("returns false for nonexistent key", async () => {
      const removed = await cache.remove("nonexistent-key");

      expect(removed).toBe(false);
    });
  });

  describe("clear", () => {
    it("removes all entries from cache", async () => {
      const settings = DEFAULT_VOICE_SETTINGS;
      const audioData = Buffer.from("test");

      await cache.put("voice1", "model", "text1", settings, audioData, 1000);
      await cache.put("voice2", "model", "text2", settings, audioData, 2000);

      const count = await cache.clear();

      expect(count).toBe(2);

      const entries = await cache.list();
      expect(entries).toHaveLength(0);
    });

    it("returns 0 for empty cache", async () => {
      const count = await cache.clear();

      expect(count).toBe(0);
    });
  });

  describe("getStats", () => {
    it("returns correct statistics", async () => {
      const settings = DEFAULT_VOICE_SETTINGS;
      const audioData = Buffer.from("test audio data");

      await cache.put("voice1", "model", "text1", settings, audioData, 1000);
      await cache.put("voice2", "model", "text2", settings, audioData, 2000);

      // Trigger a cache hit
      await cache.get("voice1", "model", "text1", settings);

      // Trigger a cache miss
      await cache.get("voice3", "model", "nonexistent", settings);

      const stats = await cache.getStats();

      expect(stats.totalEntries).toBe(2);
      expect(stats.totalSizeBytes).toBe(audioData.length * 2);
      expect(stats.hitCount).toBe(1);
      expect(stats.missCount).toBe(1);
      expect(stats.oldestEntry).not.toBeNull();
      expect(stats.newestEntry).not.toBeNull();
    });
  });

  describe("validate", () => {
    it("removes orphaned entries when audio file is missing", async () => {
      const settings = DEFAULT_VOICE_SETTINGS;
      const audioData = Buffer.from("test");

      const entry = await cache.put("voice1", "model", "text1", settings, audioData, 1000);
      await cache.saveIndex();

      // Manually delete the audio file
      await fs.unlink(cache.getAudioPath(entry));

      const result = await cache.validate();

      expect(result.valid).toBe(0);
      expect(result.removed).toBe(1);

      const entries = await cache.list();
      expect(entries).toHaveLength(0);
    });

    it("keeps valid entries", async () => {
      const settings = DEFAULT_VOICE_SETTINGS;
      const audioData = Buffer.from("test");

      await cache.put("voice1", "model", "text1", settings, audioData, 1000);
      await cache.saveIndex();

      const result = await cache.validate();

      expect(result.valid).toBe(1);
      expect(result.removed).toBe(0);
    });
  });

  describe("disabled cache", () => {
    it("returns null on get when disabled", async () => {
      const disabledCache = new VoiceCache({ cacheDir: tempDir, enabled: false });

      const result = await disabledCache.get("voice", "model", "text", DEFAULT_VOICE_SETTINGS);

      expect(result).toBeNull();
    });
  });
});
