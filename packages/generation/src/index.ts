export {
  VoiceSynthesizer,
  createVoiceSynthesizer,
  generateTimingManifest,
  type VoiceSynthesisConfig,
  type VoiceSynthesisResult,
  type SynthesizedSegment,
  type GeneratedScript,
  type ScriptSegment as VoiceScriptSegment,
  type AudioTimingManifest,
} from "./voice-synthesis";

export {
  ScriptGenerator,
  createScriptGenerator,
  type ScriptSegment,
  type ScriptOutput,
  type StepBoundary,
} from "./script-generator";

export {
  VoiceCache,
  createVoiceCache,
  generateCacheKey,
  normalizeVoiceSettings,
  getDefaultCacheDir,
  DEFAULT_VOICE_SETTINGS,
  type VoiceCacheConfig,
  type VoiceCacheEntry,
  type VoiceCacheSettings,
  type VoiceCacheStats,
  type VoiceCacheIndex,
} from "./voice-cache";
