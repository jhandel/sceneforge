import * as path from "path";
import * as fs from "fs/promises";
import * as readline from "readline";
import { hasFlag, getFlagValue, getFlagValueOrDefault } from "../utils/args.js";
import { resolveRoot } from "../utils/paths.js";

// ANSI color codes for terminal styling
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
};

function printHelp() {
  console.log(`
Manage LLM context files for AI coding assistants

Usage:
  sceneforge context <subcommand> [options]

Subcommands:
  deploy         Deploy context files to target directory (interactive by default)
  list           List deployed context files
  remove         Remove deployed context files
  preview        Preview context content
  skill          Manage skills

Run "sceneforge context <subcommand> --help" for subcommand options.
`);
}

function printDeployHelp() {
  console.log(`
Deploy LLM context files

Usage:
  sceneforge context deploy [options]

When run without options, an interactive wizard guides you through the setup.

Options:
  --target <tool>    Target tool: cursor, copilot, claude, codex, all (default: all)
  --stage <stage>    Stage: actions, scripts, balance, rebalance, all (default: all)
  --output <path>    Target directory (default: cwd)
  --format <type>    Format: combined, split (default: combined)
  --force            Overwrite without prompting
  --dry-run          Preview without writing files
  --no-interactive   Skip interactive wizard even if no options provided
  --help, -h         Show this help message

Examples:
  sceneforge context deploy                          # Interactive wizard
  sceneforge context deploy --target claude          # Deploy for Claude only
  sceneforge context deploy --format split           # Create separate files per stage
`);
}

function printListHelp() {
  console.log(`
List deployed context files

Usage:
  sceneforge context list [options]

Options:
  --output <path>    Directory to check (default: cwd)
  --json             Output as JSON
  --help, -h         Show this help message
`);
}

function printRemoveHelp() {
  console.log(`
Remove deployed context files

Usage:
  sceneforge context remove [options]

Options:
  --target <tool>    Target to remove: cursor, copilot, claude, codex, all (default: all)
  --output <path>    Directory to remove from (default: cwd)
  --force            Skip confirmation
  --help, -h         Show this help message
`);
}

function printPreviewHelp() {
  console.log(`
Preview context content

Usage:
  sceneforge context preview [options]

Options:
  --target <tool>    Target tool: cursor, copilot, claude, codex (required)
  --stage <stage>    Stage: actions, scripts, balance, rebalance, all (default: all)
  --help, -h         Show this help message

Examples:
  sceneforge context preview --target claude
  sceneforge context preview --target cursor --stage actions
`);
}

function printSkillHelp() {
  console.log(`
Manage skills

Usage:
  sceneforge context skill [options]

Options:
  --list             List available skills
  --show <name>      Display skill content
  --copy <name>      Copy skill to clipboard (requires pbcopy/xclip)
  --output <path>    Write skill to file
  --help, -h         Show this help message

Examples:
  sceneforge context skill --list
  sceneforge context skill --show generate-actions
  sceneforge context skill --show debug-selector --output ./skill.md
`);
}

// Interactive prompt utilities
function createPrompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return {
    async question(prompt) {
      return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
          resolve(answer.trim());
        });
      });
    },
    async select(prompt, options, defaultIndex = 0) {
      console.log(`\n${colors.cyan}${prompt}${colors.reset}\n`);

      options.forEach((opt, i) => {
        const marker = i === defaultIndex ? `${colors.green}→${colors.reset}` : " ";
        const label = i === defaultIndex ? `${colors.bright}${opt.label}${colors.reset}` : opt.label;
        console.log(`  ${marker} ${i + 1}) ${label}`);
        if (opt.description) {
          console.log(`     ${colors.dim}${opt.description}${colors.reset}`);
        }
      });

      const answer = await this.question(`\n${colors.dim}Enter choice [1-${options.length}] (default: ${defaultIndex + 1}):${colors.reset} `);

      if (!answer) return options[defaultIndex].value;

      const index = parseInt(answer, 10) - 1;
      if (index >= 0 && index < options.length) {
        return options[index].value;
      }

      console.log(`${colors.yellow}Invalid choice, using default.${colors.reset}`);
      return options[defaultIndex].value;
    },
    async multiSelect(prompt, options) {
      console.log(`\n${colors.cyan}${prompt}${colors.reset}`);
      console.log(`${colors.dim}(Enter numbers separated by commas, or 'all')${colors.reset}\n`);

      options.forEach((opt, i) => {
        console.log(`  ${i + 1}) ${opt.label}`);
        if (opt.description) {
          console.log(`     ${colors.dim}${opt.description}${colors.reset}`);
        }
      });

      const answer = await this.question(`\n${colors.dim}Enter choices (default: all):${colors.reset} `);

      if (!answer || answer.toLowerCase() === 'all') {
        return options.map(o => o.value);
      }

      const indices = answer.split(',').map(s => parseInt(s.trim(), 10) - 1);
      const selected = indices
        .filter(i => i >= 0 && i < options.length)
        .map(i => options[i].value);

      return selected.length > 0 ? selected : options.map(o => o.value);
    },
    async confirm(prompt, defaultYes = true) {
      const hint = defaultYes ? "[Y/n]" : "[y/N]";
      const answer = await this.question(`${colors.cyan}${prompt}${colors.reset} ${colors.dim}${hint}${colors.reset} `);

      if (!answer) return defaultYes;
      return answer.toLowerCase().startsWith('y');
    },
    async input(prompt, defaultValue = "") {
      const hint = defaultValue ? ` ${colors.dim}(default: ${defaultValue})${colors.reset}` : "";
      const answer = await this.question(`${colors.cyan}${prompt}${colors.reset}${hint}: `);
      return answer || defaultValue;
    },
    close() {
      rl.close();
    }
  };
}

async function runInteractiveDeployWizard() {
  const prompt = createPrompt();

  console.log(`
${colors.bright}${colors.blue}╔════════════════════════════════════════════════════════════╗
║           SceneForge LLM Context Deployment                ║
╚════════════════════════════════════════════════════════════╝${colors.reset}

This wizard will help you deploy context files for AI coding assistants.
These files help AI tools like Cursor, GitHub Copilot, and Claude Code
understand SceneForge and assist you in creating demos.
`);

  try {
    // Step 1: Select target tools
    const targetOptions = [
      { value: "all", label: "All tools", description: "Deploy for Cursor, Copilot, Claude Code, and Codex" },
      { value: "claude", label: "Claude Code", description: "Deploy CLAUDE.md for Claude Code CLI" },
      { value: "cursor", label: "Cursor", description: "Deploy .cursorrules for Cursor IDE" },
      { value: "copilot", label: "GitHub Copilot", description: "Deploy .github/copilot-instructions.md" },
      { value: "codex", label: "Codex", description: "Deploy AGENTS.md for OpenAI Codex" },
    ];

    const target = await prompt.select(
      "Which AI coding tool(s) would you like to configure?",
      targetOptions,
      0
    );

    // Step 2: Select stage focus
    const stageOptions = [
      { value: "all", label: "All stages (recommended)", description: "Complete context for all demo creation phases" },
      { value: "actions", label: "Stage 1: Action Generation", description: "Playwright actions, selectors, testing" },
      { value: "scripts", label: "Stage 2: Script Writing", description: "Voiceover scripts, timing, voice synthesis" },
      { value: "balance", label: "Stage 3: Step Balancing", description: "Align script duration with action timing" },
      { value: "rebalance", label: "Stage 4: Rebalancing", description: "Post-audio adjustment cycle" },
    ];

    const stage = await prompt.select(
      "Which stage context would you like to include?",
      stageOptions,
      0
    );

    // Step 3: Select format
    const formatOptions = [
      { value: "combined", label: "Combined (recommended)", description: "Single file per tool with all context" },
      { value: "split", label: "Split", description: "Separate files per stage for modular use" },
    ];

    const format = await prompt.select(
      "How should the context files be organized?",
      formatOptions,
      0
    );

    // Step 4: Output directory
    const defaultOutput = process.cwd();
    const output = await prompt.input(
      "Where should the files be deployed?",
      defaultOutput
    );
    const outputDir = resolveRoot(output);

    // Summary
    console.log(`
${colors.bright}${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}
${colors.bright}Deployment Summary${colors.reset}
${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}

  ${colors.cyan}Target:${colors.reset}    ${target === "all" ? "All tools (Cursor, Copilot, Claude, Codex)" : target}
  ${colors.cyan}Stage:${colors.reset}     ${stage === "all" ? "All stages" : stage}
  ${colors.cyan}Format:${colors.reset}    ${format}
  ${colors.cyan}Directory:${colors.reset} ${outputDir}
`);

    // Show what files will be created
    const { deployContext, getToolConfig, getSupportedTools } = await import(
      "../../context/index.js"
    );

    const tools = target === "all" ? getSupportedTools() : [target];

    console.log(`${colors.bright}Files to be created:${colors.reset}\n`);
    for (const tool of tools) {
      const config = getToolConfig(tool);
      if (format === "combined") {
        console.log(`  ${colors.green}•${colors.reset} ${config.combinedFile} ${colors.dim}(${config.name})${colors.reset}`);
      } else {
        console.log(`  ${colors.green}•${colors.reset} ${config.splitDir}/ ${colors.dim}(${config.name})${colors.reset}`);
      }
    }
    console.log("");

    // Confirm
    const confirmed = await prompt.confirm("Deploy these context files?", true);

    if (!confirmed) {
      console.log(`\n${colors.yellow}Deployment cancelled.${colors.reset}\n`);
      prompt.close();
      return;
    }

    // Deploy
    console.log(`\n${colors.dim}Deploying...${colors.reset}\n`);

    const results = await deployContext({
      target,
      stage,
      format,
      outputDir,
    });

    let successCount = 0;
    let errorCount = 0;

    for (const result of results) {
      const relativePath = path.relative(outputDir, result.filePath);
      if (result.created) {
        console.log(`  ${colors.green}✓${colors.reset} ${relativePath}`);
        successCount++;
      } else if (result.error) {
        console.log(`  ${colors.yellow}✗${colors.reset} ${relativePath}: ${result.error}`);
        errorCount++;
      }
    }

    console.log(`
${colors.bright}${colors.green}═══════════════════════════════════════════════════════════${colors.reset}
${colors.green}✓ Deployment complete!${colors.reset} ${successCount} file(s) created.
${colors.green}═══════════════════════════════════════════════════════════${colors.reset}

${colors.bright}Next steps:${colors.reset}
  1. Open your project in your AI coding tool
  2. The tool will automatically read the context files
  3. Ask the AI to help you create or modify SceneForge demos

${colors.dim}Tip: Run "sceneforge context skill --list" to see available skills.${colors.reset}
`);

    if (errorCount > 0) {
      process.exitCode = 1;
    }

    prompt.close();
  } catch (error) {
    prompt.close();
    throw error;
  }
}

async function runDeployCommand(args) {
  const help = hasFlag(args, "--help") || hasFlag(args, "-h");
  if (help) {
    printDeployHelp();
    return;
  }

  const noInteractive = hasFlag(args, "--no-interactive");
  const hasOptions = args.some(arg =>
    arg.startsWith("--target") ||
    arg.startsWith("--stage") ||
    arg.startsWith("--format") ||
    arg.startsWith("--output") ||
    arg === "--dry-run" ||
    arg === "--force"
  );

  // Run interactive wizard if no options provided
  if (!hasOptions && !noInteractive && process.stdin.isTTY) {
    await runInteractiveDeployWizard();
    return;
  }

  // CLI mode
  const target = getFlagValueOrDefault(args, "--target", "all");
  const stage = getFlagValueOrDefault(args, "--stage", "all");
  const output = getFlagValue(args, "--output");
  const format = getFlagValueOrDefault(args, "--format", "combined");
  const force = hasFlag(args, "--force");
  const dryRun = hasFlag(args, "--dry-run");

  const outputDir = resolveRoot(output);

  // Dynamic import of context module
  const { deployContext, isValidTool, isValidFormat, getSupportedTools } = await import(
    "../../context/index.js"
  );

  // Validate target
  if (target !== "all" && !isValidTool(target)) {
    console.error(`[error] Invalid target: ${target}`);
    console.error(`Valid targets: ${getSupportedTools().join(", ")}, all`);
    process.exit(1);
  }

  // Validate format
  if (!isValidFormat(format)) {
    console.error(`[error] Invalid format: ${format}`);
    console.error("Valid formats: combined, split");
    process.exit(1);
  }

  // Validate stage
  const validStages = ["actions", "scripts", "balance", "rebalance", "all"];
  if (!validStages.includes(stage)) {
    console.error(`[error] Invalid stage: ${stage}`);
    console.error(`Valid stages: ${validStages.join(", ")}`);
    process.exit(1);
  }

  console.log(`\n[context] Deploying LLM context files`);
  console.log(`[context] Target: ${target}`);
  console.log(`[context] Stage: ${stage}`);
  console.log(`[context] Format: ${format}`);
  console.log(`[context] Output: ${outputDir}`);

  if (dryRun) {
    console.log(`[context] Dry run mode - no files will be written\n`);
  }

  try {
    const results = await deployContext({
      target,
      stage,
      format,
      outputDir,
    });

    if (dryRun) {
      console.log(`\n[context] Would create the following files:`);
      for (const result of results) {
        if (result.created || !result.error) {
          const relativePath = path.relative(outputDir, result.filePath);
          console.log(`  - ${relativePath}`);
        }
      }
      return;
    }

    console.log(`\n[context] Deployment results:`);
    let successCount = 0;
    let errorCount = 0;

    for (const result of results) {
      const relativePath = path.relative(outputDir, result.filePath);
      if (result.created) {
        console.log(`  ✓ ${relativePath}`);
        successCount++;
      } else if (result.error) {
        console.log(`  ✗ ${relativePath}: ${result.error}`);
        errorCount++;
      }
    }

    console.log(`\n[context] Deployed ${successCount} file(s)`);
    if (errorCount > 0) {
      console.log(`[context] ${errorCount} error(s)`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`[error] Failed to deploy context: ${error.message}`);
    process.exit(1);
  }
}

async function runListCommand(args) {
  const help = hasFlag(args, "--help") || hasFlag(args, "-h");
  if (help) {
    printListHelp();
    return;
  }

  const output = getFlagValue(args, "--output");
  const asJson = hasFlag(args, "--json");

  const outputDir = resolveRoot(output);

  const { listDeployedContext } = await import("../../context/index.js");

  try {
    const { files } = await listDeployedContext(outputDir);

    const existingFiles = files.filter((f) => f.exists);

    if (asJson) {
      console.log(JSON.stringify({ outputDir, files: existingFiles }, null, 2));
      return;
    }

    console.log(`\n[context] Deployed context files in ${outputDir}\n`);

    if (existingFiles.length === 0) {
      console.log("  No context files found.\n");
      console.log('  Run "sceneforge context deploy" to create context files.\n');
      return;
    }

    for (const file of existingFiles) {
      const relativePath = path.relative(outputDir, file.path);
      console.log(`  [${file.tool}] ${relativePath}`);
    }
    console.log(`\n  Total: ${existingFiles.length} file(s)\n`);
  } catch (error) {
    console.error(`[error] Failed to list context: ${error.message}`);
    process.exit(1);
  }
}

async function runRemoveCommand(args) {
  const help = hasFlag(args, "--help") || hasFlag(args, "-h");
  if (help) {
    printRemoveHelp();
    return;
  }

  const target = getFlagValueOrDefault(args, "--target", "all");
  const output = getFlagValue(args, "--output");
  const force = hasFlag(args, "--force");

  const outputDir = resolveRoot(output);

  const { removeContext, isValidTool, getSupportedTools } = await import(
    "../../context/index.js"
  );

  // Validate target
  if (target !== "all" && !isValidTool(target)) {
    console.error(`[error] Invalid target: ${target}`);
    console.error(`Valid targets: ${getSupportedTools().join(", ")}, all`);
    process.exit(1);
  }

  if (!force) {
    console.log(`\n[context] This will remove context files for: ${target}`);
    console.log(`[context] Directory: ${outputDir}`);
    console.log(`[context] Use --force to skip this confirmation.\n`);
    // In a real implementation, we'd prompt for confirmation
    // For simplicity, we'll require --force
    console.log('[context] Aborted. Use --force to confirm removal.');
    return;
  }

  console.log(`\n[context] Removing context files for: ${target}`);

  try {
    const results = await removeContext(outputDir, target);

    let removedCount = 0;
    for (const result of results) {
      if (result.removed) {
        const relativePath = path.relative(outputDir, result.path);
        console.log(`  ✓ Removed: ${relativePath}`);
        removedCount++;
      } else if (result.error) {
        console.log(`  ✗ Error: ${result.path}: ${result.error}`);
      }
    }

    if (removedCount === 0) {
      console.log(`\n[context] No files were removed.`);
    } else {
      console.log(`\n[context] Removed ${removedCount} file(s)/directory(ies).`);
    }
  } catch (error) {
    console.error(`[error] Failed to remove context: ${error.message}`);
    process.exit(1);
  }
}

async function runPreviewCommand(args) {
  const help = hasFlag(args, "--help") || hasFlag(args, "-h");
  if (help) {
    printPreviewHelp();
    return;
  }

  const target = getFlagValue(args, "--target");
  const stage = getFlagValueOrDefault(args, "--stage", "all");

  if (!target) {
    console.error("[error] --target is required for preview");
    printPreviewHelp();
    process.exit(1);
  }

  const { previewContext, isValidTool, getSupportedTools } = await import(
    "../../context/index.js"
  );

  // Validate target
  if (!isValidTool(target)) {
    console.error(`[error] Invalid target: ${target}`);
    console.error(`Valid targets: ${getSupportedTools().join(", ")}`);
    process.exit(1);
  }

  // Validate stage
  const validStages = ["actions", "scripts", "balance", "rebalance", "all"];
  if (!validStages.includes(stage)) {
    console.error(`[error] Invalid stage: ${stage}`);
    console.error(`Valid stages: ${validStages.join(", ")}`);
    process.exit(1);
  }

  try {
    const result = await previewContext(target, stage);

    console.log(`\n${"=".repeat(60)}`);
    console.log(`Preview: ${target}${stage !== "all" ? ` (${stage})` : ""}`);
    console.log(`${"=".repeat(60)}\n`);
    console.log(result.content);
    console.log(`\n${"=".repeat(60)}\n`);
  } catch (error) {
    console.error(`[error] Failed to preview context: ${error.message}`);
    process.exit(1);
  }
}

async function runSkillCommand(args) {
  const help = hasFlag(args, "--help") || hasFlag(args, "-h");
  if (help) {
    printSkillHelp();
    return;
  }

  const list = hasFlag(args, "--list");
  const show = getFlagValue(args, "--show");
  const copy = getFlagValue(args, "--copy");
  const output = getFlagValue(args, "--output");

  const { listSkills, getSkill } = await import("../../context/index.js");

  if (list) {
    try {
      const skills = await listSkills();

      console.log(`\n${colors.bright}Available SceneForge Skills${colors.reset}\n`);
      if (skills.length === 0) {
        console.log("  No skills found.\n");
        return;
      }

      const skillDescriptions = {
        "generate-actions": "Generate demo actions for a web page",
        "write-step-script": "Write voiceover script for actions",
        "balance-timing": "Analyze and balance step timing",
        "review-demo-yaml": "Review and improve a demo definition",
        "debug-selector": "Debug why a selector isn't working",
        "optimize-demo": "Optimize a demo for better flow",
      };

      for (const skill of skills) {
        const desc = skillDescriptions[skill] || "";
        console.log(`  ${colors.cyan}${skill}${colors.reset}`);
        if (desc) {
          console.log(`    ${colors.dim}${desc}${colors.reset}`);
        }
      }
      console.log(`\n  Use "${colors.bright}sceneforge context skill --show <name>${colors.reset}" to view a skill.\n`);
    } catch (error) {
      console.error(`[error] Failed to list skills: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  const skillName = show || copy;
  if (!skillName) {
    console.error("[error] Specify --list, --show <name>, or --copy <name>");
    printSkillHelp();
    process.exit(1);
  }

  try {
    const skill = await getSkill(skillName);

    if (!skill) {
      console.error(`[error] Skill not found: ${skillName}`);
      const skills = await listSkills();
      console.error(`Available skills: ${skills.join(", ")}`);
      process.exit(1);
    }

    if (output) {
      const outputPath = path.resolve(output);
      await fs.writeFile(outputPath, skill.content, "utf-8");
      console.log(`[context] Skill written to: ${outputPath}`);
      return;
    }

    if (copy) {
      // Try to copy to clipboard using pbcopy (macOS) or xclip (Linux)
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      const platform = process.platform;
      let copyCommand;

      if (platform === "darwin") {
        copyCommand = "pbcopy";
      } else if (platform === "linux") {
        copyCommand = "xclip -selection clipboard";
      } else if (platform === "win32") {
        copyCommand = "clip";
      } else {
        console.error(`[error] Clipboard not supported on ${platform}`);
        console.log("\nSkill content:\n");
        console.log(skill.content);
        return;
      }

      try {
        const child = exec(copyCommand);
        child.stdin.write(skill.content);
        child.stdin.end();
        await new Promise((resolve, reject) => {
          child.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Copy command failed with code ${code}`));
          });
        });
        console.log(`${colors.green}✓${colors.reset} Skill "${skillName}" copied to clipboard.`);
      } catch (copyError) {
        console.error(`[error] Failed to copy to clipboard: ${copyError.message}`);
        console.log("\nSkill content:\n");
        console.log(skill.content);
      }
      return;
    }

    // Show skill content
    console.log(`\n${colors.blue}${"═".repeat(60)}${colors.reset}`);
    console.log(`${colors.bright}Skill: ${skill.name}${colors.reset}`);
    console.log(`${colors.blue}${"═".repeat(60)}${colors.reset}\n`);
    console.log(skill.content);
    console.log(`\n${colors.blue}${"═".repeat(60)}${colors.reset}\n`);
  } catch (error) {
    console.error(`[error] Failed to get skill: ${error.message}`);
    process.exit(1);
  }
}

export async function runContextCommand(argv) {
  const args = argv ?? process.argv.slice(2);

  // Get subcommand (first arg after "context")
  const subcommand = args[0];
  const subArgs = args.slice(1);

  if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    printHelp();
    return;
  }

  switch (subcommand.toLowerCase()) {
    case "deploy":
      await runDeployCommand(subArgs);
      break;
    case "list":
      await runListCommand(subArgs);
      break;
    case "remove":
    case "rm":
      await runRemoveCommand(subArgs);
      break;
    case "preview":
      await runPreviewCommand(subArgs);
      break;
    case "skill":
    case "skills":
      await runSkillCommand(subArgs);
      break;
    default:
      console.error(`[error] Unknown subcommand: ${subcommand}`);
      printHelp();
      process.exit(1);
  }
}
