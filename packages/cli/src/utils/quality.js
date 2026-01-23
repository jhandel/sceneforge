/**
 * Video quality configuration for FFmpeg encoding
 *
 * Quality Presets:
 * - low: Fast encoding, smaller files, suitable for drafts
 * - medium: Balanced quality and file size (default)
 * - high: Best quality, larger files, suitable for final delivery
 *
 * Supported Codecs:
 * - libx264: H.264, excellent compatibility (default)
 * - libx265: H.265/HEVC, ~50% smaller files, slower encoding
 */

export const QUALITY_PRESETS = {
  low: {
    crf: 28,
    preset: "fast",
    description: "Fast encoding, smaller files, suitable for drafts",
  },
  medium: {
    crf: 18,
    preset: "medium",
    description: "Balanced quality and file size (default)",
  },
  high: {
    crf: 10,
    preset: "slow",
    description: "Best quality, larger files, suitable for final delivery",
  },
};

export const SUPPORTED_CODECS = {
  libx264: {
    name: "H.264",
    description: "Excellent compatibility, plays everywhere",
    crfRange: "0-51 (lower = better)",
  },
  libx265: {
    name: "H.265/HEVC",
    description: "~50% smaller files, slower encoding, good compatibility",
    crfRange: "0-51 (lower = better)",
  },
};

export const DEFAULT_CODEC = "libx264";
export const DEFAULT_QUALITY = "medium";
export const DEFAULT_AUDIO_CODEC = "aac";
export const DEFAULT_AUDIO_BITRATE = "192k";

// Lossless encoding for intermediate files to prevent generation loss
// CRF 0 = mathematically lossless for x264/x265
// Using "ultrafast" preset since these are temporary files and encoding speed matters
export const INTERMEDIATE_CRF = 0;
export const INTERMEDIATE_PRESET = "ultrafast";

/**
 * Get video encoding arguments for FFmpeg
 * @param {Object} options
 * @param {string} [options.quality] - Quality preset: low, medium, high
 * @param {number} [options.crf] - Override CRF value (0-51, lower = better)
 * @param {string} [options.codec] - Video codec: libx264, libx265
 * @param {boolean} [options.includeAudio] - Include audio encoding args
 * @returns {string[]} FFmpeg arguments for video encoding
 */
export function getVideoEncodingArgs(options = {}) {
  const {
    quality = DEFAULT_QUALITY,
    crf: crfOverride,
    codec = DEFAULT_CODEC,
    includeAudio = true,
  } = options;

  const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS[DEFAULT_QUALITY];
  // Only use crfOverride if it's a valid finite number
  const crf = (crfOverride !== undefined && Number.isFinite(crfOverride)) ? crfOverride : preset.crf;
  const encodingPreset = preset.preset;

  const args = ["-c:v", codec, "-preset", encodingPreset, "-crf", String(crf)];

  if (includeAudio) {
    args.push("-c:a", DEFAULT_AUDIO_CODEC, "-b:a", DEFAULT_AUDIO_BITRATE);
  }

  return args;
}

/**
 * Get lossless encoding arguments for intermediate files.
 * Uses CRF 0 (lossless) to prevent generation loss during multi-step processing.
 * Final compression should be applied only at the last step (concat).
 *
 * @param {Object} options
 * @param {string} [options.codec] - Video codec: libx264, libx265 (default: libx264)
 * @param {boolean} [options.includeAudio] - Include audio encoding args
 * @returns {string[]} FFmpeg arguments for lossless intermediate encoding
 */
export function getIntermediateEncodingArgs(options = {}) {
  const {
    codec = DEFAULT_CODEC,
    includeAudio = true,
  } = options;

  const args = [
    "-c:v", codec,
    "-preset", INTERMEDIATE_PRESET,
    "-crf", String(INTERMEDIATE_CRF),
  ];

  if (includeAudio) {
    // Use high-quality audio for intermediates too
    args.push("-c:a", DEFAULT_AUDIO_CODEC, "-b:a", DEFAULT_AUDIO_BITRATE);
  }

  return args;
}

/**
 * Parse quality-related CLI arguments
 * @param {string[]} args - CLI arguments
 * @param {Function} getFlagValue - Function to get flag values
 * @param {Function} hasFlag - Function to check flag presence
 * @returns {Object} Parsed quality options
 */
export function parseQualityArgs(args, getFlagValue, hasFlag) {
  const quality = getFlagValue(args, "--quality") || DEFAULT_QUALITY;
  const crfValue = getFlagValue(args, "--crf");
  const codec = getFlagValue(args, "--codec") || DEFAULT_CODEC;

  // Validate quality preset
  if (!QUALITY_PRESETS[quality]) {
    console.warn(
      `[warning] Unknown quality preset "${quality}", using "${DEFAULT_QUALITY}"`
    );
  }

  // Validate codec
  if (!SUPPORTED_CODECS[codec]) {
    console.warn(
      `[warning] Unknown codec "${codec}", using "${DEFAULT_CODEC}"`
    );
  }

  // Parse CRF value, only set if it's a valid number
  let crf = undefined;
  if (crfValue !== undefined && crfValue !== null && crfValue !== "") {
    const parsed = parseInt(crfValue, 10);
    if (!Number.isNaN(parsed)) {
      crf = parsed;
    }
  }

  return {
    quality: QUALITY_PRESETS[quality] ? quality : DEFAULT_QUALITY,
    crf,
    codec: SUPPORTED_CODECS[codec] ? codec : DEFAULT_CODEC,
  };
}

/**
 * Get help text for quality options
 * @returns {string} Help text for quality CLI options
 */
export function getQualityHelpText() {
  return `
Video Quality Options:
  --quality <preset>    Quality preset: low, medium, high (default: medium)
                        - low: CRF 28, fast preset (smaller files, quick encoding)
                        - medium: CRF 18, medium preset (balanced)
                        - high: CRF 10, slow preset (best quality, larger files)
  --crf <value>         Override CRF value (0-51, lower = better quality)
  --codec <codec>       Video codec: libx264, libx265 (default: libx264)
                        - libx264: H.264, excellent compatibility
                        - libx265: H.265/HEVC, ~50% smaller files`;
}

/**
 * Log the quality settings being used
 * @param {Object} options - Quality options
 * @param {string} prefix - Log prefix (e.g., "[split]")
 */
export function logQualitySettings(options, prefix = "") {
  const { quality, crf, codec } = options;
  const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS[DEFAULT_QUALITY];
  const effectiveCrf = crf !== undefined ? crf : preset.crf;
  const codecInfo = SUPPORTED_CODECS[codec] || SUPPORTED_CODECS[DEFAULT_CODEC];

  console.log(
    `${prefix} Quality: ${quality} (CRF ${effectiveCrf}, ${preset.preset} preset, ${codecInfo.name})`
  );
}
