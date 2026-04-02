#!/usr/bin/env node
if (process.argv[2] === "create-webpush") {
  await import("./create.js");
} else {
  await import("../src/server.js");
}
