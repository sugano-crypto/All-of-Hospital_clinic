import Papa from "papaparse";
export const FACILITY_COLUMNS = [
  "facility_id",
  "name",
  "prefecture",
  "postal_code",
  "address",
  "beds",
  "owner_type",
  "departments",
  "coverage_complete",
  "coverage_as_of",
];
export const FILING_COLUMNS = [
  "facility_id",
  "code",
  "official_name",
  "accepted_on",
];
const fail = (message) => {
  throw new Error(message);
};
const dateValid = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
export function parseCsv(text, required) {
  const parsed = Papa.parse(text.replace(/^\uFEFF/, ""), {
    header: true,
    delimiter: ",",
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length)
    fail(`CSV形式を確認してください: ${parsed.errors[0].message}`);
  const missing = required.filter((key) => !parsed.meta.fields?.includes(key));
  if (missing.length) fail(`不足している列: ${missing.join(", ")}`);
  return parsed.data;
}
export function validateDataset(facilities, filings) {
  if (!facilities.length) fail("医療機関が0件です。");
  if (facilities.length > 100000 || filings.length > 1000000)
    fail("取込上限は医療機関10万件、届出100万件です。");
  const ids = new Set(),
    codes = new Map(),
    pairs = new Set();
  const normalized = facilities.map((row, i) => {
    const r = Object.fromEntries(
      FACILITY_COLUMNS.map((k) => [k, String(row[k] ?? "").trim()]),
    );
    if (!r.facility_id || !r.name || !r.prefecture || !r.owner_type)
      fail(`医療機関 ${i + 2}行目: ID・名称・都道府県・開設者区分は必須です。`);
    if (ids.has(r.facility_id))
      fail(`医療機関IDが重複しています: ${r.facility_id}`);
    ids.add(r.facility_id);
    if (!/^\d+$/.test(r.beds) || Number(r.beds) > 100000)
      fail(`医療機関 ${i + 2}行目: 病床数は0以上の整数にしてください。`);
    if (!["true", "false"].includes(r.coverage_complete))
      fail(`医療機関 ${i + 2}行目: coverage_complete は true / false です。`);
    if (
      (r.coverage_complete === "true" && !r.coverage_as_of) ||
      (r.coverage_as_of && !dateValid(r.coverage_as_of))
    )
      fail(
        `医療機関 ${i + 2}行目: 確認基準日を YYYY-MM-DD で指定してください。`,
      );
    return {
      ...r,
      beds: Number(r.beds),
      departments: r.departments
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean),
      coverage_complete: r.coverage_complete === "true",
      coverage_as_of: r.coverage_as_of || null,
    };
  });
  const normalizedFilings = filings.map((row, i) => {
    const r = Object.fromEntries(
      FILING_COLUMNS.map((k) => [k, String(row[k] ?? "").trim()]),
    );
    if (!ids.has(r.facility_id))
      fail(`届出 ${i + 2}行目: 未登録の医療機関ID ${r.facility_id}`);
    if (!r.code || !r.official_name)
      fail(`届出 ${i + 2}行目: コードと正式名称は必須です。`);
    const pair = JSON.stringify([r.facility_id, r.code]);
    if (pairs.has(pair))
      fail(`届出が重複しています: ${r.facility_id} / ${r.code}`);
    pairs.add(pair);
    if (codes.has(r.code) && codes.get(r.code) !== r.official_name)
      fail(`同じ届出コードの名称が一致しません: ${r.code}`);
    codes.set(r.code, r.official_name);
    if (r.accepted_on && !dateValid(r.accepted_on))
      fail(`届出 ${i + 2}行目: 受理日を確認してください。`);
    return { ...r, accepted_on: r.accepted_on || null };
  });
  return { facilities: normalized, filings: normalizedFilings };
}
export function catalog(data) {
  return [
    ...new Map(data.filings.map((f) => [f.code, f.official_name])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], "ja"));
}
export function filingStatus(facility, code, filings) {
  if (
    filings.some(
      (f) => f.facility_id === facility.facility_id && f.code === code,
    )
  )
    return "届出あり";
  return facility.coverage_complete && facility.coverage_as_of
    ? "届出なし"
    : "未確認";
}
export function filterFacilities(data, filters, clients = []) {
  if (filters.filingMode !== "all" && !filters.filingCode) return [];
  const filingIds = new Set(
    data.filings
      .filter((f) => f.code === filters.filingCode)
      .map((f) => f.facility_id),
  );
  const clientIds = new Set(clients.map((c) => c.facility_id));
  const q = (filters.q || "").trim().toLocaleLowerCase();
  return data.facilities.filter((f) => {
    const status = filingIds.has(f.facility_id)
      ? "yes"
      : f.coverage_complete && f.coverage_as_of
        ? "no"
        : "unknown";
    return (
      (!q ||
        [f.name, f.facility_id, f.address].some((s) =>
          s.toLocaleLowerCase().includes(q),
        )) &&
      (!filters.prefecture || f.prefecture === filters.prefecture) &&
      (!filters.owner || f.owner_type === filters.owner) &&
      (!filters.department || f.departments.includes(filters.department)) &&
      (filters.minBeds === "" ||
        filters.minBeds === undefined ||
        f.beds >= Number(filters.minBeds)) &&
      (filters.maxBeds === "" ||
        filters.maxBeds === undefined ||
        f.beds <= Number(filters.maxBeds)) &&
      (!filters.clientsOnly || clientIds.has(f.facility_id)) &&
      (filters.filingMode === "all" || status === filters.filingMode)
    );
  });
}
// Prefix spreadsheet formulas in text fields, including values with leading control characters.
export const safeCell = (v) =>
  typeof v === "string" && /^[\s\u0000-\u001f]*[=+@-]/.test(v) ? `'${v}` : v;
export function exportRows(facilities, data, clients, code) {
  const clientIds = new Set(clients.map((c) => c.facility_id));
  const byId = new Map();
  for (const f of data.filings) {
    if (!byId.has(f.facility_id)) byId.set(f.facility_id, []);
    byId.get(f.facility_id).push(f.official_name);
  }
  return facilities.map((f) =>
    Object.fromEntries(
      Object.entries({
        医療機関ID: f.facility_id,
        医療機関名: f.name,
        都道府県: f.prefecture,
        郵便番号: f.postal_code,
        住所: f.address,
        病床数: f.beds,
        開設者区分: f.owner_type,
        診療科目: f.departments.join(" / "),
        顧問先: clientIds.has(f.facility_id) ? "対象" : "",
        届出確認基準日: f.coverage_as_of || "",
        届出一覧確認: f.coverage_complete ? "確認済み" : "未確認",
        検索届出: code
          ? catalog(data).find((c) => c[0] === code)?.[1] || code
          : "",
        検索届出状況: code ? filingStatus(f, code, data.filings) : "",
        届出事項: (byId.get(f.facility_id) || []).join(" / "),
      }).map(([k, v]) => [k, safeCell(v)]),
    ),
  );
}
export function toCsv(rows) {
  return "\uFEFF" + Papa.unparse(rows, { newline: "\r\n" });
}
