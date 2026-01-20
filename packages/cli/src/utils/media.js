import { spawn } from "child_process";

const DEFAULT_MAX_OUTPUT_BYTES = 512 * 1024;

function appendWithLimit(buffer, chunk, limit) {
  const next = buffer + chunk;
  if (next.length <= limit) {
    return next;
  }
  return next.slice(next.length - limit);
}

function runCommand(command, args, options = {}) {
  const { stdio = ["ignore", "pipe", "pipe"], cwd, maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES } = options;
  return new Promise((resolve, reject) => {
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
      error.code = code;
      error.stderr = stderr;
      reject(error);
    });
  });
}

export async function checkFFmpeg() {
  try {
    await runCommand("ffmpeg", ["-version"], { stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

export async function getMediaDuration(filePath) {
  const { stdout } = await runCommand("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const duration = parseFloat(stdout.trim());
  if (!Number.isFinite(duration)) {
    throw new Error(`Unable to parse media duration for ${filePath}`);
  }
  return duration;
}

export function runFFmpeg(args, options = {}) {
  return runCommand("ffmpeg", args, options);
}

export function runFFprobe(args, options = {}) {
  return runCommand("ffprobe", args, options);
}
