import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;

export default defineConfig(
  url
    ? {
        dialect: "postgresql",
        schema: "./src/db/schema.ts",
        dbCredentials: { url },
      }
    : {
        dialect: "postgresql",
        driver: "pglite",
        schema: "./src/db/schema.ts",
        dbCredentials: { url: process.env.PGLITE_DIR ?? "./.data/pglite" },
      }
);
