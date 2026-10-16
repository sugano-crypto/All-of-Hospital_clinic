import { test } from "node:test";
import assert from "node:assert/strict";
import { demo } from "../src/demo.js";
import {
  filterFacilities,
  filingStatus,
  validateDataset,
  FACILITY_COLUMNS,
  FILING_COLUMNS,
  parseCsv,
  toCsv,
  exportRows,
} from "../src/domain.js";
const base = {
  q: "",
  prefecture: "",
  owner: "",
  department: "",
  minBeds: "",
  maxBeds: "",
  filingMode: "all",
  filingCode: "",
};
const csvFacilities = () =>
  demo.facilities.map((f) => ({
    ...f,
    departments: f.departments.join("|"),
    coverage_complete: String(f.coverage_complete),
  }));
test("combined beds / owner / department filter", () => {
  assert.deepEqual(
    filterFacilities(demo, {
      ...base,
      minBeds: "100",
      maxBeds: "300",
      owner: "医療法人",
      department: "内科",
    }).map((f) => f.facility_id),
    ["DEMO-001", "DEMO-002"],
  );
});
test("negative filing excludes unknown coverage and includes only checked absent", () => {
  assert.deepEqual(
    filterFacilities(demo, { ...base, filingCode: "DX", filingMode: "no" }).map(
      (f) => f.facility_id,
    ),
    ["DEMO-002"],
  );
  assert.equal(filingStatus(demo.facilities[3], "DX", demo.filings), "未確認");
  assert.equal(
    filterFacilities(demo, { ...base, filingCode: "DX", filingMode: "yes" })
      .length,
    3,
  );
});
test("unknown status and missing code are explicit", () => {
  assert.equal(
    filterFacilities(demo, { ...base, filingCode: "DX", filingMode: "unknown" })
      .length,
    2,
  );
  assert.equal(filterFacilities(demo, { ...base, filingMode: "no" }).length, 0);
});
test("client-only filters use stable IDs", () => {
  assert.deepEqual(
    filterFacilities(demo, { ...base, clientsOnly: true }, [
      { facility_id: "DEMO-001" },
    ]).map((f) => f.facility_id),
    ["DEMO-001"],
  );
});
test("CSV quoted commas and multiline round-trip, BOM and postal zeros", () => {
  const rows = [{ name: 'a,"b"\nc', postal: "001-0000" }];
  assert.deepEqual(parseCsv(toCsv(rows), ["name", "postal"]), rows);
});
test("CSV headers and rows rejected instead of silent data loss", () => {
  assert.throws(() => parseCsv("name\na", FACILITY_COLUMNS), /不足/);
  assert.throws(
    () =>
      parseCsv(
        "facility_id,code,official_name,accepted_on\na,b,c,d,e",
        FILING_COLUMNS,
      ),
    /CSV形式/,
  );
});
test("dataset validates dates, IDs, code names and duplicate pairs", () => {
  const f = csvFacilities();
  assert.equal(validateDataset(f, demo.filings).facilities.length, 6);
  assert.throws(() => validateDataset([...f, f[0]], demo.filings), /重複/);
  assert.throws(
    () => validateDataset(f, [{ ...demo.filings[0], facility_id: "missing" }]),
    /未登録/,
  );
  assert.throws(
    () => validateDataset(f, [demo.filings[0], demo.filings[0]]),
    /重複/,
  );
  assert.throws(
    () =>
      validateDataset(f, [
        demo.filings[0],
        { ...demo.filings[3], official_name: "conflict" },
      ]),
    /一致/,
  );
  assert.throws(
    () => validateDataset([{ ...f[0], coverage_as_of: "2026-02-30" }], []),
    /基準日/,
  );
  assert.throws(() => validateDataset([{ ...f[0], beds: "-1" }], []), /病床/);
});
test("export preserves result scope and neutralizes spreadsheet formulas", () => {
  const d = structuredClone(demo);
  d.facilities[0].name = '  =HYPERLINK("bad")';
  const rows = exportRows([d.facilities[0]], d, [], "DX");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].医療機関名[0], "'");
  assert.equal(rows[0].検索届出状況, "届出あり");
  assert.equal(rows[0].医療機関ID, "DEMO-001");
});
