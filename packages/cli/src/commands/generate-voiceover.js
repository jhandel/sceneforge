import * as fs from "fs/promises";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import {
  createVoiceSynthesizer,
  generateTimingManifest,
} from "@t3lnet/sceneforge-generation";
import { getFlagValue, hasFlag } from "../utils/args.js";
import {
  getOutputPaths,
  resolveEnvFile,
  resolveRoot,
  toAbsolute,
} from "../utils/paths.js";

function printHelp() {
  console.log(`
Generate voiceover audio from demo script JSON files using ElevenLabs

Usage:
  sceneforge voiceover [options]

Options:
  --demo <name>         Generate voiceover for a specific demo (e.g., create-quote)
  --script <path>       Generate voiceover for a specific script JSON file
  --all                 Generate voiceover for all scripts in output/scripts/
  --list-voices         List available voices from your ElevenLabs account
  --generate-sounds     Generate UI sound effects (click, hover, etc.)
  --generate-music      Generate background music tracks
  --voice-id <id>       Override the voice ID (default: ELEVENLABS_VOICE_ID env var)
  --music-style <s>     Music style: corporate, tech, calm, upbeat (default: tech)
  --root <path>         Project root (defaults to cwd)
  --output-dir <path>   Output directory (defaults to e2e/output or output)
  --env-file <path>     Environment file to load
  --help, -h            Show this help message

Environment Variables:
  ELEVENLABS_API_KEY    Your ElevenLabs API key (required)
  ELEVENLABS_VOICE_ID   Default voice ID for narration

Examples:
  sceneforge voiceover --list-voices
  sceneforge voiceover --demo create-quote
  sceneforge voiceover --script output/scripts/create-quote.json
  sceneforge voiceover --all
  sceneforge voiceover --generate-sounds
  sceneforge voiceover --generate-music --music-style calm
`);
}

async function getConfig(flags) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("[error] ELEVENLABS_API_KEY environment variable is required");
    console.error("[error] Get your API key from: https://elevenlabs.io/app/settings/api-keys");
    process.exit(1);
  }

  const voiceId = flags.voiceId || process.env.ELEVENLABS_VOICE_ID;
  if (!voiceId && !flags.listVoices && !flags.generateSounds && !flags.generateMusic) {
    console.error("[error] Voice ID is required for voiceover generation");
    console.error("[error] Set ELEVENLABS_VOICE_ID env var or use --voice-id flag");
    console.error("[error] Run with --list-voices to see available voices");
    process.exit(1);
  }

  return {
    apiKey,
    voiceId: voiceId || "",
    modelId: "eleven_multilingual_v2",
  };
}

async function listVoices(config) {
  console.log("\n[voice] Fetching available voices...\n");

  const synthesizer = createVoiceSynthesizer(config);
  const voices = await synthesizer.listVoices();

  console.log("Available Voices:");
  console.log("─".repeat(70));

  const grouped = voices.reduce((acc, voice) => {
    if (!acc[voice.category]) acc[voice.category] = [];
    acc[voice.category].push(voice);
    return acc;
  }, {});

  for (const [category, categoryVoices] of Object.entries(grouped)) {
    console.log(`\n${category.toUpperCase()}:`);
    for (const voice of categoryVoices) {
      console.log(`  ${voice.name.padEnd(30)} ${voice.voiceId}`);
    }
  }

  console.log("\n" + "─".repeat(70));
  console.log(`Total: ${voices.length} voices`);
  console.log("\nTo use a voice, set ELEVENLABS_VOICE_ID=<voiceId> or use --voice-id <voiceId>");
}

async function generateSoundEffects(config, soundsDir) {
  console.log("\n[sounds] Generating UI sound effects...\n");

  await fs.mkdir(soundsDir, { recursive: true });

  const synthesizer = createVoiceSynthesizer(config);

  const sounds = [
    {
      name: "click",
      description: "soft UI button click, subtle digital interface sound, clean",
      duration: 0.5,
    },
    {
      name: "hover",
      description: "very subtle UI hover sound, soft whoosh, gentle digital feedback",
      duration: 0.5,
    },
    {
      name: "success",
      description: "positive success chime, gentle confirmation sound, pleasant digital tone",
      duration: 1.0,
    },
    {
      name: "upload",
      description: "file upload complete sound, subtle positive notification, digital",
      duration: 0.8,
    },
    {
      name: "transition",
      description: "smooth page transition whoosh, subtle, modern UI sound",
      duration: 0.6,
    },
  ];

  for (const sound of sounds) {
    const outputPath = path.join(soundsDir, `${sound.name}.mp3`);
    console.log(`[sounds] Generating: ${sound.name}...`);

    try {
      await synthesizer.generateSoundEffect(sound.description, outputPath, {
        durationSeconds: sound.duration,
        promptInfluence: 0.4,
      });
      console.log(`[sounds] ✓ Created: ${outputPath}`);
    } catch (error) {
      console.error(`[sounds] ✗ Failed to generate ${sound.name}:`, error);
    }
  }

  console.log("\n[sounds] Sound effects generation complete!");
  console.log(`[sounds] Output directory: ${soundsDir}`);
}

async function generateBackgroundMusic(config, audioDir, style) {
  console.log(`\n[music] Generating background music (${style} style)...\n`);

  const musicDir = path.join(audioDir, "music");
  await fs.mkdir(musicDir, { recursive: true });

  const synthesizer = createVoiceSynthesizer(config);

  const outputPath = path.join(musicDir, `background_${style}.mp3`);

  try {
    await synthesizer.generateBackgroundMusic(outputPath, {
      style,
      durationSeconds: 30,
    });
    console.log(`[music] ✓ Created: ${outputPath}`);
    console.log("\n[music] Note: For longer music, you may want to loop this track");
  } catch (error) {
    console.error("[music] ✗ Failed to generate music:", error);
  }
}

async function generateVoiceoverForScript(config, scriptPath, outputDir) {
  console.log(`\n[voice] Processing: ${scriptPath}\n`);

  const synthesizer = createVoiceSynthesizer(config);

  try {
    const result = await synthesizer.synthesizeScript(scriptPath, outputDir, {
      voiceSettings: {
        stability: 0.5,
        similarityBoost: 0.75,
        style: 0.0,
      },
      generateClickSounds: false,
      onProgress: (current, total, stepId) => {
        console.log(`[voice] [${current}/${total}] Synthesizing: ${stepId}`);
      },
    });

    const manifestPath = path.join(outputDir, "audio", result.demoName, "manifest.json");
    await generateTimingManifest(scriptPath, result, manifestPath);

    console.log(`\n[voice] ✓ Completed: ${result.demoName}`);
    console.log(`[voice]   Segments: ${result.segments.length}`);
    console.log(`[voice]   Output: ${path.join(outputDir, "audio", result.demoName)}`);
    console.log(`[voice]   Manifest: ${manifestPath}`);

    return result;
  } catch (error) {
    console.error(`[voice] ✗ Failed to process ${scriptPath}:`, error);
    throw error;
  }
}

async function generateAllVoiceovers(config, scriptsDir, outputDir) {
  console.log("\n[voice] Generating voiceovers for all scripts...\n");

  const files = await fs.readdir(scriptsDir);
  const scriptFiles = files.filter(
    (file) => file.endsWith(".json") && !file.endsWith(".voice.json") && !file.endsWith("manifest.json")
  );

  if (scriptFiles.length === 0) {
    console.log("[voice] No script files found in", scriptsDir);
    console.log("[voice] Generate scripts before running voiceover");
    return;
  }

  console.log(`[voice] Found ${scriptFiles.length} script(s) to process\n`);

  for (const file of scriptFiles) {
    const scriptPath = path.join(scriptsDir, file);
    await generateVoiceoverForScript(config, scriptPath, outputDir);
  }

  console.log("\n[voice] All voiceovers generated!");
}

export async function runGenerateVoiceoverCommand(argv) {
  const args = argv ?? process.argv.slice(2);
  const help = hasFlag(args, "--help") || hasFlag(args, "-h");
  const root = getFlagValue(args, "--root");
  const outputDirOverride = getFlagValue(args, "--output-dir");
  const envFile = getFlagValue(args, "--env-file");

  const flags = {
    script: getFlagValue(args, "--script"),
    demo: getFlagValue(args, "--demo"),
    all: hasFlag(args, "--all"),
    listVoices: hasFlag(args, "--list-voices"),
    generateSounds: hasFlag(args, "--generate-sounds"),
    generateMusic: hasFlag(args, "--generate-music"),
    voiceId: getFlagValue(args, "--voice-id"),
    musicStyle: getFlagValue(args, "--music-style") || "tech",
  };

  if (help) {
    printHelp();
    return;
  }

  const rootDir = resolveRoot(root);
  const outputPaths = await getOutputPaths(rootDir, outputDirOverride);

  if (flags.demo && !flags.script) {
    flags.script = path.join(outputPaths.scriptsDir, `${flags.demo}.json`);
  }

  if (flags.script) {
    flags.script = toAbsolute(rootDir, flags.script);
  }

  const resolvedEnvFile = await resolveEnvFile(rootDir, envFile);
  if (resolvedEnvFile) {
    loadEnv({ path: resolvedEnvFile });
  }

  const config = await getConfig(flags);

  if (flags.listVoices) {
    await listVoices(config);
    return;
  }

  if (flags.generateSounds) {
    await generateSoundEffects(config, path.join(outputPaths.audioDir, "sounds"));
    return;
  }

  if (flags.generateMusic) {
    const style = ["corporate", "tech", "calm", "upbeat"].includes(flags.musicStyle)
      ? flags.musicStyle
      : "tech";
    await generateBackgroundMusic(config, outputPaths.audioDir, style);
    return;
  }

  if (flags.script) {
    await generateVoiceoverForScript(config, flags.script, outputPaths.outputDir);
    return;
  }

  if (flags.all) {
    await generateAllVoiceovers(config, outputPaths.scriptsDir, outputPaths.outputDir);
    return;
  }

  printHelp();
}
