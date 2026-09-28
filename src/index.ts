import type { Server } from "node:http";
import { createApp } from "./app.js";
import { assertSafeConfiguration, env } from "./config/env.js";
import { close, initializeDatabase } from "./db/database.js";

const FORCE_EXIT_MS = 10_000;

async function bootstrap(): Promise<void> {
  // Refuses to start with development credentials while NODE_ENV=production.
  assertSafeConfiguration();
  if (env.usesDevJwtSecret && !env.isTest) {
    console.warn("[auth] using the built-in development JWT secret - set JWT_SECRET before deploying");
  }

  await initializeDatabase();
  console.log(`[db] sqlite ready at ${env.dbFile}`);

  const app = createApp();
  const server: Server = app.listen(env.port, () => {
    console.log(`[server] listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    console.log(`[server] ${signal} received, shutting down`);
    const forcedExit = setTimeout(() => {
      console.error("[server] shutdown timed out, exiting forcefully");
      process.exit(1);
    }, FORCE_EXIT_MS);
    forcedExit.unref();

    server.close((closeError) => {
      if (closeError) {
        console.error("[server] failed to close http server", closeError);
        process.exitCode = 1;
      }
      close()
        .then(() => console.log("[db] connection closed"))
        .catch((error: unknown) => {
          console.error("[db] failed to close connection", error);
          process.exitCode = 1;
        })
        .finally(() => {
          clearTimeout(forcedExit);
          process.exit(process.exitCode ?? 0);
        });
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((error: unknown) => {
  console.error("[server] failed to start", error);
  process.exitCode = 1;
});
