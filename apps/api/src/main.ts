import { assertProductionSecrets, config } from "@baoxian-news/backend/config";
import { closeDb } from "@baoxian-news/backend/db";
import { installModules } from "@baoxian-news/backend/modules";
import { SERVER_MODULES } from "@baoxian-news/site/modules/server";
import { DEPLOYMENT } from "@baoxian-news/site";
import { startHeartbeat } from "@baoxian-news/backend/operations/heartbeat";
import { startWorkerWatchdog } from "@baoxian-news/backend/operations/watch";
import { buildApp } from "./app.ts";

installModules(SERVER_MODULES);
assertProductionSecrets([
  ["auth", "SESSION_SECRET"],
  ["auth", "IMG_PROXY_SIGN_SECRET"],
  ...DEPLOYMENT.requiredSecrets,
]);
// Somebody must be able to sign in to the admin.
if (config.environmentName === "production" && !(config.adminPassword && config.adminPassword.length >= 12)) {
  throw new Error("Refusing to start in production: set ADMIN_PASSWORD (at least 12 characters)");
}

const app = await buildApp();
await app.listen({ port: config.apiPort, host: process.env.API_HOST || "127.0.0.1" });
startHeartbeat(`api:${config.apiPort}`);
startWorkerWatchdog();

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  await app.close();
  await closeDb();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
