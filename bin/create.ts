#!/usr/bin/env node
import { createInterface } from "readline/promises";
import { execSync } from "child_process";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, join, basename } from "path";
import { randomBytes } from "crypto";
import webpush from "web-push";

const PACKAGE_NAME = "@am25/webpush";

// ANSI helpers
const c = {
  reset: "\x1b[0m",
  bold:  "\x1b[1m",
  dim:   "\x1b[2m",
  red:   "\x1b[31m",
  green: "\x1b[32m",
  cyan:  "\x1b[36m",
};

const step  = (n: number, total: number, label: string) =>
  `\n  ${c.dim}[${n}/${total}]${c.reset} ${c.bold}${label}${c.reset}\n`;
const ok    = (msg: string) => `  ${c.green}✓${c.reset} ${msg}`;
const fail  = (msg: string) => `\n  ${c.red}✗ Error:${c.reset} ${msg}\n`;
const mask  = (value: string) => `${c.dim}${value.slice(0, 8)}...${c.reset}`;
const row   = (key: string, value: string) =>
  `  ${c.dim}${key.padEnd(14)}${c.reset}${value}`;

const rl = createInterface({ input: process.stdin, output: process.stdout });

async function ask(prompt: string, defaultValue?: string, displayDefault?: string): Promise<string> {
  const hint = defaultValue ? ` [${displayDefault ?? defaultValue}]` : "";
  const answer = await rl.question(`  ${c.cyan}${prompt}${c.reset}${c.dim}${hint}${c.reset}: `);
  return answer.trim() || defaultValue || "";
}

async function confirm(prompt: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = await rl.question(`  ${c.cyan}${prompt}${c.reset} ${c.dim}${hint}${c.reset}: `);
  const val = answer.trim().toLowerCase();
  if (!val) return defaultYes;
  return val === "y";
}

function run(cmd: string, cwd?: string) {
  execSync(cmd, { stdio: "inherit", cwd });
}

function scaffold(
  targetDir: string,
  dirName: string,
  isCurrentDir: boolean,
  vapidSubject: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  apiKey: string,
  port: string
) {
  if (!isCurrentDir) mkdirSync(targetDir);

  const pkgJson = {
    name: dirName,
    version: "1.0.0",
    private: true,
    scripts: { start: "webpush" },
    dependencies: { [PACKAGE_NAME]: "latest" },
  };
  writeFileSync(join(targetDir, "package.json"), JSON.stringify(pkgJson, null, 2) + "\n");

  const envContent = [
    `VAPID_SUBJECT=${vapidSubject}`,
    `VAPID_PUBLIC_KEY=${vapidPublicKey}`,
    `VAPID_PRIVATE_KEY=${vapidPrivateKey}`,
    `API_KEY=${apiKey}`,
    `PORT=${port}`,
  ].join("\n") + "\n";
  writeFileSync(join(targetDir, ".env"), envContent, "utf-8");
}

function install(targetDir: string, dirName: string, vapidPublicKey: string) {
  console.log(`\n  ${c.dim}Installing dependencies...${c.reset}\n`);
  try {
    run("pnpm add @am25/webpush", targetDir);
  } catch {
    run("npm install", targetDir);
  }

  console.log(`
${ok(`Done! ${c.bold}${dirName}${c.reset} is ready.`)}

  To start:
    ${c.dim}cd ${dirName} && pnpm start${c.reset}

  Endpoints:
    ${c.dim}GET  /health${c.reset}
    ${c.dim}POST /send        Authorization: Bearer <API_KEY>${c.reset}
    ${c.dim}POST /send-many   Authorization: Bearer <API_KEY>${c.reset}

  Add these to your web app's environment:
    ${c.dim}VAPID_PUBLIC_KEY${c.reset} = ${vapidPublicKey}
    ${c.dim}API_KEY${c.reset}          = ${c.dim}(see .env)${c.reset}
`);
}

async function main() {
  // Resolve directory from optional CLI argument
  // Filter out "create-webpush" in case invoked via: pnpm dlx @am25/webpush create-webpush [dir]
  const dirArg = process.argv.slice(2).find((a) => a !== "create-webpush");
  const isCurrentDir = dirArg === ".";

  let dirName: string;
  let targetDir: string;

  if (isCurrentDir) {
    targetDir = process.cwd();
    dirName = basename(targetDir);
  } else if (dirArg) {
    dirName = dirArg;
    targetDir = resolve(process.cwd(), dirName);
  } else {
    dirName = "";
    targetDir = "";
  }

  console.log(`\n  ${c.bold}${PACKAGE_NAME}${c.reset} — setup wizard\n`);

  // Mode selection
  const isAuto = await confirm("Auto setup? Generates everything automatically", true);

  if (isAuto) {
    rl.close();
    // ── Auto mode ──────────────────────────────────────────────
    if (!dirName) {
      dirName = "webpush";
      targetDir = resolve(process.cwd(), dirName);
    }

    if (!isCurrentDir && existsSync(targetDir)) {
      console.error(fail(`the directory "${dirName}" already exists.`));
      process.exit(1);
    }

    if (isCurrentDir && existsSync(join(targetDir, ".env"))) {
      console.error(fail(`.env already exists in the current directory.`));
      process.exit(1);
    }

    const { publicKey, privateKey } = webpush.generateVAPIDKeys();
    const apiKey = randomBytes(32).toString("hex");
    const port = "5500";
    const vapidSubject = "mailto:change-me@example.com";

    scaffold(targetDir, dirName, isCurrentDir, vapidSubject, publicKey, privateKey, apiKey, port);
    install(targetDir, dirName, publicKey);

    console.log(`  ${c.red}!${c.reset} Update ${c.bold}VAPID_SUBJECT${c.reset} in ${c.dim}${dirName}/.env${c.reset} before starting the server.\n`);

  } else {
    // ── Manual mode ────────────────────────────────────────────

    // [1/4] Project
    console.log(step(1, 4, "Project"));
    if (!dirName) {
      dirName = await ask("Directory name", "webpush");
      targetDir = resolve(process.cwd(), dirName);
    } else {
      console.log(`  ${c.dim}Directory:${c.reset} ${dirName}`);
    }

    if (!isCurrentDir && existsSync(targetDir)) {
      console.error(fail(`the directory "${dirName}" already exists.`));
      process.exit(1);
    }

    if (isCurrentDir && existsSync(join(targetDir, ".env"))) {
      console.error(fail(`.env already exists in the current directory.`));
      process.exit(1);
    }

    // [2/4] VAPID
    console.log(step(2, 4, "VAPID keys"));
    console.log(`  ${c.dim}Generated automatically — press Enter to accept or provide your own.${c.reset}\n`);

    const generatedVapid = webpush.generateVAPIDKeys();

    const vapidSubject = await ask("VAPID_SUBJECT  (mailto: or https: URI)");
    if (!vapidSubject) {
      console.error(fail("VAPID_SUBJECT is required."));
      process.exit(1);
    }

    const vapidPublicKey =
      (await ask("VAPID_PUBLIC_KEY", generatedVapid.publicKey, mask(generatedVapid.publicKey))) ||
      generatedVapid.publicKey;

    const vapidPrivateKey =
      (await ask("VAPID_PRIVATE_KEY", generatedVapid.privateKey, mask(generatedVapid.privateKey))) ||
      generatedVapid.privateKey;

    // [3/4] Server
    console.log(step(3, 4, "Server"));

    const generatedApiKey = randomBytes(32).toString("hex");
    const apiKey =
      (await ask("API_KEY         (Enter to auto-generate)", generatedApiKey, mask(generatedApiKey))) ||
      generatedApiKey;

    const port = await ask("PORT", "5500");

    // [4/4] Review
    console.log(step(4, 4, "Review"));
    console.log(row("Directory",   dirName));
    console.log(row("Subject",     vapidSubject));
    console.log(row("Public key",  mask(vapidPublicKey)));
    console.log(row("Private key", mask(vapidPrivateKey)));
    console.log(row("API key",     mask(apiKey)));
    console.log(row("Port",        port));
    console.log();

    const confirmed = await confirm("Create project?");
    rl.close();

    if (!confirmed) {
      console.log(`\n  ${c.dim}Aborted.${c.reset}\n`);
      process.exit(0);
    }

    scaffold(targetDir, dirName, isCurrentDir, vapidSubject, vapidPublicKey, vapidPrivateKey, apiKey, port);
    install(targetDir, dirName, vapidPublicKey);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
