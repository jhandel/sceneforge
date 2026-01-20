import { config as loadEnv } from "dotenv";
import { runFFmpeg, runFFprobe } from "../utils/media.js";
import { getFlagValue, hasFlag } from "../utils/args.js";
import { resolveEnvFile, resolveRoot } from "../utils/paths.js";

function printHelp() {
  console.log(`
Run environment diagnostics for sceneforge

Usage:
  sceneforge doctor [options]

Options:
  --root <path>       Project root (defaults to cwd)
  --env-file <path>   Environment file to load
  --json              Output diagnostics as JSON
  --help, -h          Show this help message
`);
}

async function checkBinary(name, runner) {
  try {
    const { stdout, stderr } = await runner(["-version"]);
    const output = `${stdout}\n${stderr}`.trim();
    const firstLine = output.split("\n")[0] || "";
    return { ok: true, version: firstLine };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function runDoctorCommand(argv) {
  const args = argv ?? process.argv.slice(2);
  const help = hasFlag(args, "--help") || hasFlag(args, "-h");
  const asJson = hasFlag(args, "--json");
  const root = getFlagValue(args, "--root");
  const envFile = getFlagValue(args, "--env-file");

  if (help) {
    printHelp();
    return;
  }

  const rootDir = resolveRoot(root);
  const resolvedEnvFile = await resolveEnvFile(rootDir, envFile);
  if (resolvedEnvFile) {
    loadEnv({ path: resolvedEnvFile });
  }

  const checks = [];

  const ffmpeg = await checkBinary("ffmpeg", runFFmpeg);
  checks.push({
    name: "ffmpeg",
    status: ffmpeg.ok ? "ok" : "missing",
    detail: ffmpeg.ok ? ffmpeg.version : ffmpeg.error,
  });

  const ffprobe = await checkBinary("ffprobe", runFFprobe);
  checks.push({
    name: "ffprobe",
    status: ffprobe.ok ? "ok" : "missing",
    detail: ffprobe.ok ? ffprobe.version : ffprobe.error,
  });

  const envChecks = [
    { key: "ELEVENLABS_API_KEY", required: false },
    { key: "ELEVENLABS_VOICE_ID", required: false },
  ];
  for (const envCheck of envChecks) {
    const value = process.env[envCheck.key];
    checks.push({
      name: envCheck.key,
      status: value ? "ok" : envCheck.required ? "missing" : "optional",
      detail: value ? "set" : "not set",
    });
  }

  const diagnostics = {
    ok: checks.every((check) => check.status === "ok" || check.status === "optional"),
    rootDir,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    checks,
  };

  if (asJson) {
    console.log(JSON.stringify(diagnostics, null, 2));
    return;
  }

  console.log("\n[doctor] SceneForge diagnostics\n");
  for (const check of checks) {
    const statusLabel = check.status === "ok" ? "✓" : check.status === "optional" ? "•" : "✗";
    console.log(`[doctor] ${statusLabel} ${check.name}: ${check.detail}`);
  }
  console.log(`\n[doctor] Result: ${diagnostics.ok ? "OK" : "Issues detected"}`);
  if (!diagnostics.ok) {
    process.exitCode = 1;
  }
}
