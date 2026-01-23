import * as fs from "fs/promises";
import * as path from "path";
import { checkFFmpeg, getMediaDuration, runFFmpeg } from "../utils/media.js";
import { getFlagValue, hasFlag } from "../utils/args.js";
import { getOutputPaths, resolveRoot, readJson, toAbsolute } from "../utils/paths.js";
import {
  getVideoEncodingArgs,
  parseQualityArgs,
  getQualityHelpText,
  logQualitySettings,
  DEFAULT_AUDIO_CODEC,
  DEFAULT_AUDIO_BITRATE,
  DEFAULT_CODEC,
  DEFAULT_QUALITY,
} from "../utils/quality.js";
import {
  parseOutputDimensions,
  getOutputDimensionsHelpText,
  logOutputDimensions,
} from "../utils/dimensions.js";

function printHelp() {
  console.log(`
Concatenate per-step video clips into final demo videos

Usage:
  sceneforge concat [options]

Options:
  --demo <name>         Process a specific demo by name
  --all                 Process all demos with step clips
  --intro <path>        Intro video to prepend (overrides YAML config)
  --outro <path>        Outro video to append (overrides YAML config)
  --music <path>        Background music file (overrides YAML config)
  --music-volume <0-1>  Background music volume (default: 0.15)
  --music-loop          Loop music if shorter than video
  --music-fade-in <s>   Fade in duration for music (default: 1)
  --music-fade-out <s>  Fade out duration for music (default: 2)
  --root <path>         Project root (defaults to cwd)
  --output-dir <path>   Output directory (defaults to e2e/output or output)
  --help, -h            Show this help message
${getQualityHelpText()}
${getOutputDimensionsHelpText()}

Examples:
  sceneforge concat --demo create-quote
  sceneforge concat --demo create-quote --quality high
  sceneforge concat --demo create-quote --output-size 1080p
  sceneforge concat --demo create-quote --output-size tiktok  # 1080x1920 vertical
  sceneforge concat --demo create-quote --intro intro.mp4 --outro outro.mp4
  sceneforge concat --demo create-quote --music background.mp3 --music-volume 0.2
  sceneforge concat --all --codec libx265
`);
}

async function resolveMediaPath(filePath, rootDir) {
  if (!filePath) return null;
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
  try {
    await fs.access(resolved);
    return resolved;
  } catch {
    return null;
  }
}

async function loadMediaConfig(demoName, paths, rootDir) {
  // Try to load script JSON which may contain the original definition's media config
  const scriptPath = path.join(paths.scriptsDir, `${demoName}.json`);
  try {
    const script = await readJson(scriptPath);
    return script.definition?.media || null;
  } catch {
    return null;
  }
}

// Build scale filter string for use in filter_complex
function buildScaleFilter(outputDimensions) {
  if (!outputDimensions) return "";
  const { width, height } = outputDimensions;
  if (width === -1 || height === -1) {
    return `scale=${width}:${height}`;
  }
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`;
}

async function concatByCopy(stepFiles, demoDir, outputPath, tempDir) {
  const workingDir = tempDir ?? demoDir;
  await fs.mkdir(workingDir, { recursive: true });
  const listPath = path.join(workingDir, "concat_list.txt");
  const listContent = stepFiles
    .map((file) => `file '${path.join(demoDir, file).replace(/'/g, "'\\''")}'`)
    .join("\n");
  await fs.writeFile(listPath, listContent, "utf-8");
  try {
    await runFFmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      outputPath,
    ]);
  } finally {
    await fs.unlink(listPath).catch(() => {});
  }
}

async function buildConcatWithIntroOutro(stepFiles, demoDir, introPath, outroPath, outputPath, qualityOptions = {}, outputDimensions = null) {
  const allInputs = [];
  const inputPaths = [];
  let inputIndex = 0;

  // Add intro if present
  if (introPath) {
    allInputs.push("-i", introPath);
    inputPaths.push({ type: "intro", index: inputIndex });
    inputIndex++;
  }

  // Add step files
  for (const file of stepFiles) {
    allInputs.push("-i", path.join(demoDir, file));
    inputPaths.push({ type: "step", index: inputIndex, file });
    inputIndex++;
  }

  // Add outro if present
  if (outroPath) {
    allInputs.push("-i", outroPath);
    inputPaths.push({ type: "outro", index: inputIndex });
    inputIndex++;
  }

  const concatInputs = inputPaths.map(({ index }) => `[${index}:v:0][${index}:a:0]`).join("");
  const scaleFilter = buildScaleFilter(outputDimensions);
  // If scaling, we need to output concat to temp labels, then apply scale to video only
  const filterGraph = scaleFilter
    ? `${concatInputs}concat=n=${inputPaths.length}:v=1:a=1[tmpv][outa];[tmpv]${scaleFilter}[outv]`
    : `${concatInputs}concat=n=${inputPaths.length}:v=1:a=1[outv][outa]`;
  const encodingArgs = getVideoEncodingArgs(qualityOptions);

  await runFFmpeg([
    "-y",
    ...allInputs,
    "-filter_complex",
    filterGraph,
    "-map",
    "[outv]",
    "-map",
    "[outa]",
    ...encodingArgs,
    "-movflags",
    "+faststart",
    outputPath,
  ]);
}

async function addBackgroundMusic(videoPath, musicPath, outputPath, options = {}) {
  const {
    volume = 0.15,
    loop = true,
    fadeIn = 1,
    fadeOut = 2,
    startAt = null,
    endAt = null,
  } = options;

  const videoDuration = await getMediaDuration(videoPath);
  const musicDuration = await getMediaDuration(musicPath);

  // Calculate start and end times
  let musicStart = 0;
  let musicEnd = videoDuration;

  if (startAt) {
    if (startAt.type === "time") {
      musicStart = startAt.seconds;
    } else if (startAt.type === "afterIntro" && startAt.introDuration) {
      musicStart = startAt.introDuration;
    }
  }

  if (endAt) {
    if (endAt.type === "time") {
      musicEnd = endAt.seconds;
    } else if (endAt.type === "beforeOutro" && endAt.outroDuration) {
      musicEnd = videoDuration - endAt.outroDuration;
    }
  }

  const musicPlayDuration = musicEnd - musicStart;

  // Build the audio filter
  let audioFilter = "";

  if (loop && musicDuration < musicPlayDuration) {
    // Loop the music to cover the duration
    const loopCount = Math.ceil(musicPlayDuration / musicDuration);
    audioFilter = `[1:a]aloop=loop=${loopCount}:size=${Math.ceil(musicDuration * 48000)},atrim=0:${musicPlayDuration}`;
  } else {
    audioFilter = `[1:a]atrim=0:${Math.min(musicDuration, musicPlayDuration)}`;
  }

  // Add fade in/out
  if (fadeIn > 0) {
    audioFilter += `,afade=t=in:st=0:d=${fadeIn}`;
  }
  if (fadeOut > 0) {
    const fadeOutStart = Math.max(0, musicPlayDuration - fadeOut);
    audioFilter += `,afade=t=out:st=${fadeOutStart}:d=${fadeOut}`;
  }

  // Apply volume
  audioFilter += `,volume=${volume}`;

  // Delay if starting after the beginning
  if (musicStart > 0) {
    audioFilter += `,adelay=${Math.round(musicStart * 1000)}|${Math.round(musicStart * 1000)}`;
  }

  // Pad to match video duration
  audioFilter += `,apad=whole_dur=${videoDuration}`;
  audioFilter += "[music];";

  // Mix with original audio
  audioFilter += `[0:a][music]amix=inputs=2:duration=first:dropout_transition=0[outa]`;

  await runFFmpeg([
    "-y",
    "-i",
    videoPath,
    "-i",
    musicPath,
    "-filter_complex",
    audioFilter,
    "-map",
    "0:v",
    "-map",
    "[outa]",
    "-c:v",
    "copy",
    "-c:a",
    DEFAULT_AUDIO_CODEC,
    "-b:a",
    DEFAULT_AUDIO_BITRATE,
    "-movflags",
    "+faststart",
    outputPath,
  ]);
}

async function concatDemo(demoName, paths, options = {}) {
  console.log(`\n[concat] Processing: ${demoName}\n`);
  if (options.qualityOptions) {
    logQualitySettings(options.qualityOptions, "[concat]");
  }
  if (options.outputDimensions) {
    logOutputDimensions(options.outputDimensions, "[concat]");
  }

  const { rootDir, introOverride, outroOverride, musicOverride, musicOptions = {} } = options;
  const demoDir = path.join(paths.videosDir, demoName);

  try {
    const files = await fs.readdir(demoDir);
    const stepFiles = files.filter((file) => file.endsWith("_with_audio.mp4")).sort();

    if (stepFiles.length === 0) {
      console.error(`[concat] ✗ No step clips with audio found in ${demoDir}`);
      console.error("[concat]   Run sceneforge add-audio first");
      return;
    }

    console.log(`[concat] Found ${stepFiles.length} step clips with audio`);

    // Load media config from definition
    const mediaConfig = await loadMediaConfig(demoName, paths, rootDir);

    // Resolve intro path (CLI override takes precedence)
    let introPath = null;
    if (introOverride) {
      introPath = await resolveMediaPath(introOverride, rootDir);
      if (!introPath) {
        console.warn(`[concat] ⚠ Intro file not found: ${introOverride}`);
      }
    } else if (mediaConfig?.intro?.file) {
      introPath = await resolveMediaPath(mediaConfig.intro.file, rootDir);
      if (!introPath) {
        console.warn(`[concat] ⚠ Intro file from config not found: ${mediaConfig.intro.file}`);
      }
    }

    // Resolve outro path
    let outroPath = null;
    if (outroOverride) {
      outroPath = await resolveMediaPath(outroOverride, rootDir);
      if (!outroPath) {
        console.warn(`[concat] ⚠ Outro file not found: ${outroOverride}`);
      }
    } else if (mediaConfig?.outro?.file) {
      outroPath = await resolveMediaPath(mediaConfig.outro.file, rootDir);
      if (!outroPath) {
        console.warn(`[concat] ⚠ Outro file from config not found: ${mediaConfig.outro.file}`);
      }
    }

    // Resolve music path
    let musicPath = null;
    let finalMusicOptions = { ...musicOptions };
    if (musicOverride) {
      musicPath = await resolveMediaPath(musicOverride, rootDir);
      if (!musicPath) {
        console.warn(`[concat] ⚠ Music file not found: ${musicOverride}`);
      }
    } else if (mediaConfig?.backgroundMusic?.file) {
      musicPath = await resolveMediaPath(mediaConfig.backgroundMusic.file, rootDir);
      if (!musicPath) {
        console.warn(`[concat] ⚠ Music file from config not found: ${mediaConfig.backgroundMusic.file}`);
      }
      // Use config values as defaults
      finalMusicOptions = {
        volume: mediaConfig.backgroundMusic.volume ?? finalMusicOptions.volume,
        loop: mediaConfig.backgroundMusic.loop ?? finalMusicOptions.loop,
        fadeIn: mediaConfig.backgroundMusic.fadeIn ?? finalMusicOptions.fadeIn,
        fadeOut: mediaConfig.backgroundMusic.fadeOut ?? finalMusicOptions.fadeOut,
        startAt: mediaConfig.backgroundMusic.startAt ?? finalMusicOptions.startAt,
        endAt: mediaConfig.backgroundMusic.endAt ?? finalMusicOptions.endAt,
      };
    }

    await fs.mkdir(paths.finalDir, { recursive: true });

    const hasIntroOutro = introPath || outroPath;
    const hasMusic = musicPath;
    const tempConcatPath = path.join(paths.finalDir, `${demoName}_temp_concat.mp4`);
    const outputPath = path.join(paths.finalDir, `${demoName}.mp4`);

    // Fast-path: copy concat when no intro/outro, no music, no scaling, and default quality
    const qualityOptions = options.qualityOptions || {};
    const outputDimensions = options.outputDimensions || null;
    const canStreamCopy =
      !hasIntroOutro &&
      !hasMusic &&
      !outputDimensions &&
      qualityOptions.quality === DEFAULT_QUALITY &&
      qualityOptions.crf === undefined &&
      qualityOptions.codec === DEFAULT_CODEC;

    if (canStreamCopy) {
      try {
        await concatByCopy(stepFiles, demoDir, outputPath, paths.tempDir);
        console.log("[concat] ✓ Concatenated via stream copy (no re-encode)");
        return;
      } catch (error) {
        console.warn("[concat] ⚠ Fast concat failed, falling back to re-encode:", error?.message ?? error);
      }
    }

    // Step 1: Concatenate steps with optional intro/outro
    if (hasIntroOutro) {
      if (introPath) console.log(`[concat] Adding intro: ${path.basename(introPath)}`);
      if (outroPath) console.log(`[concat] Adding outro: ${path.basename(outroPath)}`);
    }

    console.log("[concat] Concatenating clips...");

    if (hasIntroOutro) {
      await buildConcatWithIntroOutro(
        stepFiles,
        demoDir,
        introPath,
        outroPath,
        hasMusic ? tempConcatPath : outputPath,
        qualityOptions,
        outputDimensions
      );
    } else {
      // Original concatenation logic for steps only
      const inputArgs = stepFiles.flatMap((file) => ["-i", path.join(demoDir, file)]);
      const concatInputs = stepFiles.map((_, index) => `[${index}:v:0][${index}:a:0]`).join("");
      const scaleFilter = buildScaleFilter(outputDimensions);
      // If scaling, we need to output concat to temp labels, then apply scale to video only
      const filterGraph = scaleFilter
        ? `${concatInputs}concat=n=${stepFiles.length}:v=1:a=1[tmpv][outa];[tmpv]${scaleFilter}[outv]`
        : `${concatInputs}concat=n=${stepFiles.length}:v=1:a=1[outv][outa]`;
      const encodingArgs = getVideoEncodingArgs(qualityOptions);

      await runFFmpeg([
        "-y",
        ...inputArgs,
        "-filter_complex",
        filterGraph,
        "-map",
        "[outv]",
        "-map",
        "[outa]",
        ...encodingArgs,
        "-movflags",
        "+faststart",
        hasMusic ? tempConcatPath : outputPath,
      ]);
    }

    // Step 2: Add background music if present
    if (hasMusic) {
      console.log(`[concat] Adding background music: ${path.basename(musicPath)}`);
      console.log(`[concat]   Volume: ${(finalMusicOptions.volume ?? 0.15) * 100}%`);
      if (finalMusicOptions.loop !== false) console.log("[concat]   Loop: enabled");

      // Calculate intro/outro durations for startAt/endAt
      let introDuration = 0;
      let outroDuration = 0;
      if (introPath) {
        introDuration = await getMediaDuration(introPath);
      }
      if (outroPath) {
        outroDuration = await getMediaDuration(outroPath);
      }

      // Enhance startAt/endAt with calculated durations
      if (finalMusicOptions.startAt?.type === "afterIntro") {
        finalMusicOptions.startAt = { ...finalMusicOptions.startAt, introDuration };
      }
      if (finalMusicOptions.endAt?.type === "beforeOutro") {
        finalMusicOptions.endAt = { ...finalMusicOptions.endAt, outroDuration };
      }

      const musicInputPath = hasIntroOutro ? tempConcatPath : tempConcatPath;
      // If we had intro/outro, input is tempConcatPath; otherwise we need to create it
      if (!hasIntroOutro) {
        // Rename the previous output to temp for music processing
        await fs.rename(outputPath, tempConcatPath);
      }

      await addBackgroundMusic(tempConcatPath, musicPath, outputPath, finalMusicOptions);

      // Clean up temp file
      await fs.unlink(tempConcatPath).catch(() => {});
    }

    const duration = await getMediaDuration(outputPath);

    console.log(`[concat] ✓ Created: ${outputPath}`);
    console.log(`[concat]   Duration: ${duration.toFixed(2)}s`);

    // Log what was included
    const features = [];
    if (introPath) features.push("intro");
    if (outroPath) features.push("outro");
    if (musicPath) features.push("background music");
    if (features.length > 0) {
      console.log(`[concat]   Includes: ${features.join(", ")}`);
    }
  } catch (error) {
    console.error(`[concat] Error processing ${demoName}:`, error);
    throw error;
  }
}

async function concatAll(paths, options) {
  console.log("\n[concat] Processing all demos...\n");

  try {
    const demoDirs = await fs.readdir(paths.videosDir);
    const demosToProcess = [];

    for (const dir of demoDirs) {
      const demoPath = path.join(paths.videosDir, dir);
      const stat = await fs.stat(demoPath);

      if (!stat.isDirectory()) continue;

      const files = await fs.readdir(demoPath);
      const hasAudioClips = files.some((file) => file.endsWith("_with_audio.mp4"));

      if (hasAudioClips) {
        demosToProcess.push(dir);
      }
    }

    if (demosToProcess.length === 0) {
      console.log("[concat] No demos ready for concatenation");
      console.log("[concat] Make sure you've run sceneforge add-audio");
      return;
    }

    console.log(`[concat] Found ${demosToProcess.length} demo(s) to process\n`);

    for (const demo of demosToProcess) {
      await concatDemo(demo, paths, options);
    }

    console.log("\n[concat] All demos processed!");
    console.log(`[concat] Output: ${paths.finalDir}`);
  } catch (error) {
    console.error("[concat] Error:", error);
  }
}

export async function runConcatCommand(argv) {
  const args = argv ?? process.argv.slice(2);
  const help = hasFlag(args, "--help") || hasFlag(args, "-h");
  const demo = getFlagValue(args, "--demo");
  const all = hasFlag(args, "--all");
  const root = getFlagValue(args, "--root");
  const outputDir = getFlagValue(args, "--output-dir");

  // New media options
  const introOverride = getFlagValue(args, "--intro");
  const outroOverride = getFlagValue(args, "--outro");
  const musicOverride = getFlagValue(args, "--music");
  const musicVolume = parseFloat(getFlagValue(args, "--music-volume") ?? "0.15");
  const musicLoop = hasFlag(args, "--music-loop");
  const musicFadeIn = parseFloat(getFlagValue(args, "--music-fade-in") ?? "1");
  const musicFadeOut = parseFloat(getFlagValue(args, "--music-fade-out") ?? "2");

  if (help) {
    printHelp();
    return;
  }

  const hasFFmpeg = await checkFFmpeg();
  if (!hasFFmpeg) {
    console.error("[error] FFmpeg is not installed");
    process.exit(1);
  }

  const rootDir = resolveRoot(root);
  const paths = await getOutputPaths(rootDir, outputDir);
  const qualityOptions = parseQualityArgs(args, getFlagValue, hasFlag);
  const outputDimensions = parseOutputDimensions(args, getFlagValue);

  const options = {
    rootDir,
    introOverride,
    outroOverride,
    musicOverride,
    musicOptions: {
      volume: musicVolume,
      loop: musicLoop || true, // Default to true
      fadeIn: musicFadeIn,
      fadeOut: musicFadeOut,
    },
    qualityOptions,
    outputDimensions,
  };

  if (demo) {
    await concatDemo(demo, paths, options);
    return;
  }

  if (all) {
    await concatAll(paths, options);
    return;
  }

  printHelp();
}
