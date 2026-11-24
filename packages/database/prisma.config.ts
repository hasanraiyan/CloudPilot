import { defineConfig, env } from "prisma/config";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

const envPath = fileURLToPath(new URL("../../.env", import.meta.url));
config({ path: envPath });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
