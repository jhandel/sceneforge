import * as path from "path";
import {
  createVoiceCache,
  getDefaultCacheDir,
} from "@t3lnet/sceneforge-generation";
import { getFlagValue, hasFlag } from "../utils/args.js";
import { resolveRoot } from "../utils/paths.js";

function printHelp() {
  console.log(`
Manage the voice cache for ElevenLabs API cost savings

Usage:
  sceneforge voice-cache [command] [options]

Commands:
  stats                 Show cache statistics
  list                  List all cached entries
  clear                 Clear all cached entries
  prune                 Remove entries older than specified days
  validate              Validate cache integrity and remove orphaned entries

Options:
  --cache-dir <path>    Cache directory (default: .voice-cache in project root)
  --root <path>         Project root (defaults to cwd)
  --days <n>            Days threshold for prune command (default: 30)
  --json                Output in JSON format
  --help, -h            Show this help message

Examples:
  sceneforge voice-cache stats
  sceneforge voice-cache list
  sceneforge voice-cache list --json
  sceneforge voice-cache clear
  sceneforge voice-cache prune --days 7
  sceneforge voice-cache validate
`);
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(isoString) {
  if (!isoString) return "N/A";
  return new Date(isoString).toLocaleString();
}

function truncateText(text, maxLength = 50) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

async function showStats(cache, jsonOutput) {
  const stats = await cache.getStats();

  if (jsonOutput) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  console.log("\nVoice Cache Statistics");
  console.log("=".repeat(50));
  console.log(`Total entries:     ${stats.totalEntries}`);
  console.log(`Total size:        ${formatBytes(stats.totalSizeBytes)}`);
  console.log(`Oldest entry:      ${formatDate(stats.oldestEntry)}`);
  console.log(`Newest entry:      ${formatDate(stats.newestEntry)}`);
  console.log(`Session hits:      ${stats.hitCount}`);
  console.log(`Session misses:    ${stats.missCount}`);

  if (stats.hitCount + stats.missCount > 0) {
    const hitRate = (stats.hitCount / (stats.hitCount + stats.missCount) * 100).toFixed(1);
    console.log(`Session hit rate:  ${hitRate}%`);
  }

  console.log("=".repeat(50));
}

async function listEntries(cache, jsonOutput) {
  const entries = await cache.list();

  if (jsonOutput) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  if (entries.length === 0) {
    console.log("\nCache is empty.");
    return;
  }

  console.log(`\nCached Voice Entries (${entries.length} total)`);
  console.log("=".repeat(100));

  for (const entry of entries) {
    console.log(`\nKey: ${entry.key.slice(0, 16)}...`);
    console.log(`  Voice ID:    ${entry.voiceId}`);
    console.log(`  Model:       ${entry.modelId}`);
    console.log(`  Text:        "${truncateText(entry.text)}"`);
    console.log(`  Duration:    ${entry.durationMs}ms`);
    console.log(`  Size:        ${formatBytes(entry.fileSizeBytes)}`);
    console.log(`  Created:     ${formatDate(entry.createdAt)}`);
    console.log(`  Last used:   ${formatDate(entry.lastUsedAt)}`);
  }

  console.log("\n" + "=".repeat(100));
}

async function clearCache(cache) {
  const count = await cache.clear();
  console.log(`\nCleared ${count} cache entries.`);
}

async function pruneCache(cache, days) {
  console.log(`\nPruning entries not used in the last ${days} days...`);
  const removed = await cache.pruneOlderThan(days);
  console.log(`Removed ${removed} entries.`);
}

async function validateCache(cache, jsonOutput) {
  console.log("\nValidating cache integrity...");
  const result = await cache.validate();

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Valid entries: ${result.valid}`);
  console.log(`Removed orphaned entries: ${result.removed}`);
}

export async function runVoiceCacheCommand(argv) {
  const args = argv ?? process.argv.slice(2);
  const help = hasFlag(args, "--help") || hasFlag(args, "-h");
  const root = getFlagValue(args, "--root");
  const cacheDirOverride = getFlagValue(args, "--cache-dir");
  const days = parseInt(getFlagValue(args, "--days") || "30", 10);
  const jsonOutput = hasFlag(args, "--json");

  if (help) {
    printHelp();
    return;
  }

  // Get command (first non-flag argument)
  const command = args.find((arg) => !arg.startsWith("-"));

  if (!command) {
    printHelp();
    return;
  }

  const rootDir = resolveRoot(root);
  const cacheDir = cacheDirOverride
    ? path.resolve(rootDir, cacheDirOverride)
    : getDefaultCacheDir(rootDir);

  const cache = createVoiceCache({ cacheDir, enabled: true });
  await cache.initialize();

  switch (command) {
    case "stats":
      await showStats(cache, jsonOutput);
      break;

    case "list":
      await listEntries(cache, jsonOutput);
      break;

    case "clear":
      await clearCache(cache);
      break;

    case "prune":
      await pruneCache(cache, days);
      break;

    case "validate":
      await validateCache(cache, jsonOutput);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}
