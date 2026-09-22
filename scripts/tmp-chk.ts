import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { describeTarget } from "@/lib/env-target";
async function main() {
  console.log("cible :", describeTarget());
  const r = await db.execute(sql`select table_name from information_schema.tables where table_schema='public' order by table_name`);
  console.log((r as unknown as { rows: { table_name: string }[] }).rows.map(x => x.table_name).join(", "));
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
