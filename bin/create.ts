#!/usr/bin/env node
import { createInterface } from "readline/promises";
import { execSync } from "child_process";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { randomBytes } from "crypto";
import webpush from "web-push";

const PACKAGE_NAME = "@am25/webpush";

const rl = createInterface({ input: process.stdin, output: process.stdout });

async function ask(prompt: string, defaultValue?: string): Promise<string> {
  const hint = defaultValue ? ` [${defaultValue}]` : "";
  const answer = await rl.question(`  ${prompt}${hint}: `);
  return answer.trim() || defaultValue || "";
}

function run(cmd: string, cwd?: string) {
  execSync(cmd, { stdio: "inherit", cwd });
}

async function main() {
  console.log(`\n  ${PACKAGE_NAME} — setup wizard\n`);

  // 1. Directory name
  const dirName = await ask("Project directory name", "webpush");
  const targetDir = resolve(process.cwd(), dirName);

  if (existsSync(targetDir)) {
    console.error(`\n  Error: the directory "${dirName}" already exists.\n`);
    process.exit(1);
  }

  // 2. VAPID keys — generated automatically, user can override
  const generatedVapid = webpush.generateVAPIDKeys();
  console.log("\n  VAPID keys generated automatically. Press Enter to accept or provide your own.\n");

  const vapidSubject = await ask("VAPID_SUBJECT (mailto: or https: URI)");
  if (!vapidSubject) {
    console.error("\n  Error: VAPID_SUBJECT is required.\n");
    process.exit(1);
  }

  const vapidPublicKey =
    (await ask("VAPID_PUBLIC_KEY", generatedVapid.publicKey)) || generatedVapid.publicKey;

  const vapidPrivateKey =
    (await ask("VAPID_PRIVATE_KEY", generatedVapid.privateKey)) || generatedVapid.privateKey;

  // 3. API key — auto-generated if left empty
  const generatedApiKey = randomBytes(32).toString("hex");
  const apiKey =
    (await ask("API_KEY (Enter to auto-generate)", generatedApiKey)) || generatedApiKey;

  // 4. Port
  const port = await ask("PORT", "5500");

  rl.close();

  // 5. Scaffold project directory
  mkdirSync(targetDir);

  // package.json
  const pkgJson = {
    name: dirName,
    version: "1.0.0",
    private: true,
    scripts: {
      start: "webpush",
    },
    dependencies: {
      [PACKAGE_NAME]: "latest",
    },
  };
  writeFileSync(join(targetDir, "package.json"), JSON.stringify(pkgJson, null, 2) + "\n");

  // .env
  const envContent = [
    `VAPID_SUBJECT=${vapidSubject}`,
    `VAPID_PUBLIC_KEY=${vapidPublicKey}`,
    `VAPID_PRIVATE_KEY=${vapidPrivateKey}`,
    `API_KEY=${apiKey}`,
    `PORT=${port}`,
  ].join("\n") + "\n";
  writeFileSync(join(targetDir, ".env"), envContent, "utf-8");

  // 6. Install dependencies
  console.log("\n  Installing dependencies...");
  try {
    run("pnpm add @am25/webpush", targetDir);
  } catch {
    run("npm install", targetDir);
  }

  console.log(`
  Done! Your webpush server is ready in ./${dirName}

  To start:
    cd ${dirName} && pnpm start

  Endpoints:
    GET  /health
    POST /send       — Authorization: Bearer <API_KEY>
    POST /send-many  — Authorization: Bearer <API_KEY>

  Your VAPID public key (add this to your web app):
    ${vapidPublicKey}
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
