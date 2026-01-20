import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function checkFFmpeg() {
  try {
    await execAsync("ffmpeg -version");
    return true;
  } catch {
    return false;
  }
}

export async function getMediaDuration(filePath) {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
  );
  return parseFloat(stdout.trim());
}

export { execAsync };
