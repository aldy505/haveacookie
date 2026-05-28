import { readFile } from "node:fs/promises";
import { Client } from "pg";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

async function readDatabaseUrlFromConfig() {
  try {
    const configRaw = await readFile("/app/config.json", "utf8");
    const config = JSON.parse(configRaw);

    if (isNonEmptyString(config?.databaseUrl)) {
      return config.databaseUrl.trim();
    }
  } catch (error) {
    console.error("healthcheck warning: unable to read /app/config.json");
    console.error(error instanceof Error ? error.message : String(error));
  }

  return null;
}

async function main() {
  const connectionString = process.env.DATABASE_URL ?? (await readDatabaseUrlFromConfig());
  if (!isNonEmptyString(connectionString)) {
    console.error("healthcheck failed: DATABASE_URL or config.databaseUrl is required");
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 3000,
  });

  try {
    await client.connect();
    await client.query("SELECT 1");
  } catch (error) {
    console.error("healthcheck failed: database connectivity error");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    try {
      await client.end();
    } catch (error) {
      console.error("healthcheck warning: failed to close database connection cleanly");
      console.error(error instanceof Error ? error.message : String(error));
    }
  }
}

await main();
