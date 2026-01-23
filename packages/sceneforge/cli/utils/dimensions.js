/**
 * Viewport and output dimensions configuration
 *
 * Browser Viewport:
 * - Controls the browser window size during recording
 *
 * Output Dimensions:
 * - Controls the final video resolution after processing
 * - Supports common presets (720p, 1080p, 4k) or custom WxH
 */

export const VIEWPORT_PRESETS = {
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "1440p": { width: 2560, height: 1440 },
  "4k": { width: 3840, height: 2160 },
};

export const OUTPUT_PRESETS = {
  // Landscape formats
  "720p": { width: 1280, height: 720, description: "HD 720p (landscape)" },
  "1080p": { width: 1920, height: 1080, description: "Full HD 1080p (landscape)" },
  "1440p": { width: 2560, height: 1440, description: "QHD 1440p (landscape)" },
  "4k": { width: 3840, height: 2160, description: "4K UHD (landscape)" },
  // Portrait/vertical formats (for mobile, TikTok, YouTube Shorts, Reels)
  "720p-portrait": { width: 720, height: 1280, description: "HD 720p (portrait)" },
  "1080p-portrait": { width: 1080, height: 1920, description: "Full HD 1080p (portrait)" },
  "tiktok": { width: 1080, height: 1920, description: "TikTok/Reels (1080x1920)" },
  "shorts": { width: 1080, height: 1920, description: "YouTube Shorts (1080x1920)" },
  "reels": { width: 1080, height: 1920, description: "Instagram Reels (1080x1920)" },
  // Square format (Instagram posts)
  "square": { width: 1080, height: 1080, description: "Square (1080x1080)" },
  "square-720": { width: 720, height: 720, description: "Square (720x720)" },
};

export const DEFAULT_VIEWPORT = { width: 1440, height: 900 };

/**
 * Parse a dimension string like "1920x1080" or a preset name like "1080p"
 * @param {string} value - Dimension string or preset name
 * @param {Object} presets - Presets object to check against
 * @param {Object} defaultValue - Default dimensions if parsing fails
 * @returns {Object} { width, height }
 */
export function parseDimensions(value, presets, defaultValue) {
  if (!value) {
    return defaultValue;
  }

  // Check if it's a preset name
  const preset = presets[value.toLowerCase()];
  if (preset) {
    return { width: preset.width, height: preset.height };
  }

  // Try to parse WxH format
  const match = value.match(/^(\d+)x(\d+)$/i);
  if (match) {
    return { width: Number(match[1]), height: Number(match[2]) };
  }

  return defaultValue;
}

/**
 * Parse viewport options from CLI arguments
 * @param {string[]} args - CLI arguments
 * @param {Function} getFlagValue - Function to get flag values
 * @returns {Object} { width, height }
 */
export function parseViewportArgs(args, getFlagValue) {
  const viewportValue = getFlagValue(args, "--viewport");
  const widthValue = getFlagValue(args, "--width");
  const heightValue = getFlagValue(args, "--height");

  // Individual width/height override viewport string
  if (widthValue || heightValue) {
    const width = widthValue ? Number(widthValue) : DEFAULT_VIEWPORT.width;
    const height = heightValue ? Number(heightValue) : DEFAULT_VIEWPORT.height;
    return { width, height };
  }

  return parseDimensions(viewportValue, VIEWPORT_PRESETS, DEFAULT_VIEWPORT);
}

/**
 * Parse output dimensions from CLI arguments
 * @param {string[]} args - CLI arguments
 * @param {Function} getFlagValue - Function to get flag values
 * @returns {Object|null} { width, height } or null if not specified
 */
export function parseOutputDimensions(args, getFlagValue) {
  const outputSize = getFlagValue(args, "--output-size");
  const outputWidth = getFlagValue(args, "--output-width");
  const outputHeight = getFlagValue(args, "--output-height");

  // Individual width/height override --output-size
  if (outputWidth || outputHeight) {
    // Need both for explicit dimensions, or use -1 for auto-scale
    const width = outputWidth ? Number(outputWidth) : -1;
    const height = outputHeight ? Number(outputHeight) : -1;
    if ((width > 0 || width === -1) && (height > 0 || height === -1)) {
      return { width, height };
    }
  }

  if (!outputSize) {
    return null; // No scaling, keep original dimensions
  }

  // Check if it's a preset
  const preset = OUTPUT_PRESETS[outputSize.toLowerCase()];
  if (preset) {
    return { width: preset.width, height: preset.height };
  }

  // Try to parse WxH format
  const match = outputSize.match(/^(\d+)x(\d+)$/i);
  if (match) {
    return { width: Number(match[1]), height: Number(match[2]) };
  }

  console.warn(`[warning] Invalid output size "${outputSize}", keeping original dimensions`);
  return null;
}

/**
 * Get FFmpeg scale filter arguments
 * @param {Object|null} dimensions - { width, height } or null for no scaling
 *                                   Use -1 for auto-scale maintaining aspect ratio
 * @returns {string[]} FFmpeg arguments for scaling, or empty array
 */
export function getScaleFilterArgs(dimensions) {
  if (!dimensions) {
    return [];
  }

  const { width, height } = dimensions;

  // If either dimension is -1, scale while maintaining aspect ratio (no padding)
  if (width === -1 || height === -1) {
    return ["-vf", `scale=${width}:${height}`];
  }

  // Use scale filter with padding to maintain aspect ratio and fit exact dimensions
  // scale=W:H:force_original_aspect_ratio=decrease,pad=W:H:(ow-iw)/2:(oh-ih)/2
  return [
    "-vf",
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
  ];
}

/**
 * Get help text for viewport options (recording)
 * @returns {string}
 */
export function getViewportHelpText() {
  return `
Viewport Options (Recording):
  --viewport <WxH|preset>  Target video resolution (default: 1440x900)
                           Presets: 720p, 1080p, 1440p, 4k
                           Example: --viewport 1920x1080 or --viewport 1080p
  --width <px>             Video width (overrides --viewport)
  --height <px>            Video height (overrides --viewport)`;
}

/**
 * Get help text for output dimension options (video processing)
 * @returns {string}
 */
export function getOutputDimensionsHelpText() {
  return `
Output Dimensions:
  --output-size <WxH|preset>  Scale output video to dimensions
                              Landscape: 720p, 1080p, 1440p, 4k
                              Portrait:  720p-portrait, 1080p-portrait
                              Mobile:    tiktok, shorts, reels (1080x1920)
                              Square:    square (1080x1080), square-720
                              Custom:    --output-size 1920x1080
  --output-width <px>         Output width (use with --output-height or -1 for auto)
  --output-height <px>        Output height (use with --output-width or -1 for auto)
                              If not specified, keeps original recording dimensions`;
}

/**
 * Log output dimension settings
 * @param {Object|null} dimensions - { width, height } or null
 * @param {string} prefix - Log prefix
 */
export function logOutputDimensions(dimensions, prefix = "") {
  if (dimensions) {
    console.log(`${prefix} Output size: ${dimensions.width}x${dimensions.height}`);
  }
}
