import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { demo } from "../src/demo.js";
test("SQL migration enforces membership, ownership, atomic replacement and formal names", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610160001_workspace.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const userA = "00000000-0000-0000-0000-000000000001",
      userB = "00000000-0000-0000-0000-000000000002",
      userC = "00000000-0000-0000-0000-000000000003";
    await db.exec(
      `insert into auth.users values('${userA}'),('${userB}'),('${userC}');insert into public.app_users(user_id) values('${userA}'),('${userB}');set role authenticated;`,
    );
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [
      userA,
    ]);
    await db.query("select public.replace_dataset($1::jsonb)", [
      JSON.stringify(demo),
    ]);
    let got = (await db.query("select public.get_workspace() as data")).rows[0]
      .data;
    assert.equal(got.facilities.length, 6);
    assert.equal(got.filings[0].official_name.includes("加算"), true);
    await db.query(
      "insert into public.clients(facility_id,note) values($1,$2)",
      ["DEMO-001", "保持されるメモ"],
    );
    await db.query("select public.replace_dataset($1::jsonb)", [
      JSON.stringify(demo),
    ]);
    assert.equal(
      (await db.query("select public.get_workspace() as data")).rows[0].data
        .clients[0].note,
      "保持されるメモ",
    );
    const bad = structuredClone(demo);
    bad.filings[0].facility_id = "MISSING";
    await assert.rejects(
      db.query("select public.replace_dataset($1::jsonb)", [
        JSON.stringify(bad),
      ]),
    );
    assert.equal(
      (await db.query("select public.get_workspace() as data")).rows[0].data
        .filings.length,
      5,
      "failed write rolls back all data",
    );
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [
      userB,
    ]);
    assert.equal(
      (await db.query("select public.get_workspace() as data")).rows[0].data
        .facilities.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.clients")).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into public.facilities(owner_id,facility_id,name,prefecture,beds,owner_type) values($1,$2,$3,$4,$5,$6)",
        [userA, "BAD", "病院", "東京都", 0, "個人"],
      ),
    );
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [
      userC,
    ]);
    await assert.rejects(db.query("select public.get_workspace()"));
    await db.exec("reset role;set role anon");
    await assert.rejects(db.query("select * from public.clients"));
  } finally {
    await db.close();
  }
});
