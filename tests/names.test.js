import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertAllItemsMapped,
  resolveOfficialName,
} from "../scripts/official-names.js";
const mapping = {
  bureau: "sample",
  abbreviation: "略",
  code: "001",
  official_name: "検証用の正式名称",
  valid_from: "2026-06-01",
  valid_to: null,
  source_url: "https://kouseikyoku.mhlw.go.jp/sample/source.pdf",
};
const item = { bureau: "sample", abbreviation: "略", asOf: "2026-10-01" };
test("official names retain source abbreviation only for traceability", () => {
  assert.equal(
    resolveOfficialName(item, [mapping]).official_name,
    "検証用の正式名称",
  );
});
test("unknown, ambiguous, obsolete, or untrusted names block entire update", () => {
  assert.throws(() =>
    assertAllItemsMapped(
      [item, { ...item, abbreviation: "未定義" }],
      [mapping],
    ),
  );
  assert.throws(() => resolveOfficialName(item, [mapping, mapping]));
  assert.throws(() =>
    resolveOfficialName(item, [{ ...mapping, valid_to: "2026-09-01" }]),
  );
  assert.throws(() =>
    resolveOfficialName(item, [
      { ...mapping, source_url: "https://example.com" },
    ]),
  );
});
