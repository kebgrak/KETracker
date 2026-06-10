import app from "./app";
import { logger } from "./lib/logger";
import { initAllStep99 } from "./lib/step99";
import { initDb } from "@workspace/db";

export interface ServerOptions {
  port?: number;
  databaseUrl?: string;
  adminPassword?: string;
  sessionSecret?: string;
}

export async function startServer(options: ServerOptions = {}): Promise<{ port: number; close: () => void }> {
  // Set env vars from options (for Electron mode where they come from config)
  if (options.databaseUrl) {
    process.env.DATABASE_URL = options.databaseUrl;
  }
  if (options.adminPassword) {
    process.env.ADMIN_PASSWORD = options.adminPassword;
  }
  if (options.sessionSecret) {
    process.env.SESSION_SECRET = options.sessionSecret;
  }

  // Initialize database connection
  await initDb(options.databaseUrl);

  const port = options.port ?? Number(process.env.PORT) ?? 0;

  return new Promise((resolve, reject) => {
    const server = app.listen(port, async (err: Error | undefined) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        reject(err);
        return;
      }

      const actualPort = (server.address() as any).port;
      logger.info({ port: actualPort }, "Server listening");

      try {
        await initAllStep99();
        logger.info("Step 99 initialized for all products");
      } catch (e) {
        logger.error({ err: e }, "Failed to initialize step 99");
      }

      resolve({ port: actualPort, close: () => server.close() });
    });
  });
}

// Auto-start when run directly as CLI (not when imported by Electron or other modules).
// The __STANDALONE_SERVER__ define is set by the esbuild build.mjs config.
declare const __STANDALONE_SERVER__: boolean;
const isStandalone = typeof __STANDALONE_SERVER__ !== "undefined"
  ? __STANDALONE_SERVER__
  : !process.env.ELECTRON_RUN_AS_NODE && process.argv[1]?.includes("api-server");

if (isStandalone) {
  const rawPort = process.env["PORT"];
  if (!rawPort) {
    throw new Error("PORT environment variable is required but was not provided.");
  }
  const port = Number(rawPort);
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }
  startServer({ port }).catch((err) => {
    logger.error({ err }, "Failed to start server");
    process.exit(1);
  });
}
