import React, { useState, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { demo } from "./demo.js";
import {
  FACILITY_COLUMNS,
  FILING_COLUMNS,
  parseCsv,
  validateDataset,
  catalog,
  filterFacilities,
  filingStatus,
  exportRows,
  toCsv,
} from "./domain.js";
import {
  supabase,
  configError,
  loadData,
  replaceData,
  saveClient,
  removeClient,
} from "./api.js";
import "./style.css";
const initialFilters = {
  q: "",
  prefecture: "",
  owner: "",
  department: "",
  minBeds: "",
  maxBeds: "",
  filingCode: "",
  filingMode: "all",
  clientsOnly: false,
};
const empty = { facilities: [], filings: [] };
const download = (name, body, type) => {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const errorText = (e) =>
  e?.message || "処理に失敗しました。接続と設定を確認してください。";
function App() {
  const [logo, setLogo] = useState("/company-logo.png"),
    [logoLoaded, setLogoLoaded] = useState(false),
    [session, setSession] = useState(null),
    [mode, setMode] = useState("login"),
    [tab, setTab] = useState("search"),
    [data, setData] = useState(empty),
    [clients, setClients] = useState([]),
    [filters, setFilters] = useState(initialFilters),
    [selected, setSelected] = useState(null),
    [note, setNote] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [importFiles, setImportFiles] = useState({}),
    [staged, setStaged] = useState(null),
    [importConfirm, setImportConfirm] = useState(false),
    [filingQuery, setFilingQuery] = useState(""),
    [page, setPage] = useState(1),
    [meta, setMeta] = useState(null);
  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (!s && event === "SIGNED_OUT") {
        setData(empty);
        setClients([]);
        setMode("login");
        setSelected(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) return;
    setBusy(true);
    loadData()
      .then((d) => {
        setData({ facilities: d.facilities || [], filings: d.filings || [] });
        setClients(d.clients || []);
        setMeta(d.meta);
        setMode("live");
      })
      .catch((e) => {
        setError(errorText(e));
        supabase.auth.signOut();
      })
      .finally(() => setBusy(false));
  }, [session?.user.id]);
  useEffect(() => {
    setPage(1);
  }, [filters, tab, data]);
  const results = useMemo(
    () =>
      filterFacilities(
        data,
        { ...filters, clientsOnly: tab === "clients" || filters.clientsOnly },
        clients,
      ),
    [data, filters, clients, tab],
  );
  const codes = useMemo(() => catalog(data), [data]);
  const options = (field) =>
    [...new Set(data.facilities.flatMap((f) => f[field]))].sort((a, b) =>
      a.localeCompare(b, "ja"),
    );
  const update = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  async function perform(fn) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function startDemo() {
    setMode("demo");
    setData(structuredClone(demo));
    setClients([{ facility_id: "DEMO-001", note: "架空の顧問先・検証用" }]);
    setMeta(null);
    setError("");
  }
  async function login(e) {
    e.preventDefault();
    await perform(async () => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      setPassword("");
      if (error)
        throw new Error(
          "ログインできませんでした。メールアドレスとパスワードを確認してください。",
        );
    });
  }
  async function exportData(kind) {
    await perform(async () => {
      const rows = exportRows(results, data, clients, filters.filingCode);
      const stamp = new Date().toISOString().slice(0, 10);
      if (kind === "csv")
        download(
          `医療機関_${stamp}.csv`,
          toCsv(rows),
          "text/csv;charset=utf-8",
        );
      else {
        const ExcelJS = (await import("exceljs")).default;
        const book = new ExcelJS.Workbook();
        const sheet = book.addWorksheet("医療機関");
        const keys = Object.keys(rows[0]);
        sheet.columns = keys.map((k) => ({
          header: k,
          key: k,
          width: k === "住所" || k === "届出事項" ? 45 : 24,
        }));
        sheet.addRows(rows);
        sheet.views = [{ state: "frozen", ySplit: 1 }];
        sheet.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: rows.length + 1, column: keys.length },
        };
        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getRow(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF163D39" },
        };
        download(
          `医療機関_${stamp}.xlsx`,
          await book.xlsx.writeBuffer(),
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
      }
      setMessage(
        `${results.length}件を${kind === "csv" ? "CSV" : "Excel"}で出力しました。`,
      );
    });
  }
  async function previewImport() {
    await perform(async () => {
      if (!importFiles.facilities || !importFiles.filings)
        throw new Error("2種類のCSVを選択してください。");
      if (
        importFiles.facilities.size + importFiles.filings.size >
        50 * 1024 * 1024
      )
        throw new Error("CSV合計50MB以内で指定してください。");
      const [a, b] = await Promise.all([
        importFiles.facilities.text(),
        importFiles.filings.text(),
      ]);
      setStaged(
        validateDataset(
          parseCsv(a, FACILITY_COLUMNS),
          parseCsv(b, FILING_COLUMNS),
        ),
      );
      setImportConfirm(false);
      setMessage(
        "形式とIDの整合性を確認しました。件数を確認して反映してください。",
      );
    });
  }
  async function applyImport() {
    await perform(async () => {
      if (!staged || !importConfirm)
        throw new Error("入替確認を選択してください。");
      if (mode === "live") {
        await replaceData(staged);
        const d = await loadData();
        setData({ facilities: d.facilities, filings: d.filings });
        setClients(d.clients || []);
        setMeta(d.meta);
      } else {
        setData(staged);
        setClients((cs) =>
          cs.filter((c) =>
            staged.facilities.some((f) => f.facility_id === c.facility_id),
          ),
        );
      }
      setStaged(null);
      setImportConfirm(false);
      setMessage("データを入れ替えました。");
    });
  }
  const isClient = (id) => clients.some((c) => c.facility_id === id);
  async function persistClient(remove = false) {
    await perform(async () => {
      if (mode === "live") {
        if (remove) await removeClient(selected.facility_id);
        else await saveClient(selected.facility_id, note);
      }
      setClients((cs) =>
        remove
          ? cs.filter((c) => c.facility_id !== selected.facility_id)
          : [
              ...cs.filter((c) => c.facility_id !== selected.facility_id),
              { facility_id: selected.facility_id, note },
            ],
      );
      setMessage(
        remove ? "顧問先から解除しました。" : "顧問先情報を保存しました。",
      );
    });
  }
  const select = (f) => {
    setSelected(f);
    setNote(clients.find((c) => c.facility_id === f.facility_id)?.note || "");
  };
  const selectField = (label, key, values) => (
    <label>
      {label}
      <select
        value={filters[key]}
        onChange={(e) => update(key, e.target.value)}
      >
        <option value="">すべて</option>
        {values.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
  if (mode === "login")
    return (
      <div className="login">
        <div className="login-brand">
          <img
            className={logoLoaded ? "company-logo" : "company-logo pending"}
            src={logo}
            alt="SUGA Consulting & Partners"
            onLoad={() => setLogoLoaded(true)}
            onError={() => setLogoLoaded(false)}
          />
          <h1>全国医療機関情報検索サイト</h1>
          <p>
            医療機関の情報を、
            <br />
            次のアクションへ。
          </p>
          <small>SUGA CONSULTING & PARTNERS</small>
        </div>
        <main className="login-card">
          <span className="eyebrow">WORKSPACE</span>
          <h2>専用ワークスペース</h2>
          <p className="muted">医療機関の条件抽出・届出確認・顧問先管理</p>
          {configError && (
            <p role="alert" className="error">
              {configError}
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {supabase ? (
            <form onSubmit={login}>
              <label>
                メールアドレス
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                パスワード
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button className="primary" disabled={busy}>
                ログイン
              </button>
            </form>
          ) : (
            <div className="notice">
              本番の接続設定は未完了です。動作確認用のデモをご利用いただけます。
            </div>
          )}
          <button
            className="secondary wide"
            onClick={startDemo}
            disabled={busy}
          >
            架空データでデモを開く →
          </button>
          <small className="muted">
            デモの変更は、この画面を閉じると消えます。
          </small>
        </main>
      </div>
    );
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <img
            className={logoLoaded ? "company-logo" : "company-logo pending"}
            src={logo}
            alt="SUGA Consulting & Partners"
            onLoad={() => setLogoLoaded(true)}
            onError={() => setLogoLoaded(false)}
          />
          <div className="brand-title">
            全国医療機関
            <br />
            情報検索サイト<small>医療機関データワークスペース</small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {[
            ["search", "医療機関検索", "⌕"],
            ["clients", "顧問先", "◇"],
            ["import", "データ・更新", "↻"],
          ].map(([id, label, icon]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setFilters(initialFilters);
                setError("");
                setMessage("");
              }}
            >
              <span>{icon}</span>
              {label}
              {id === "clients" && <b>{clients.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="status-dot" />{" "}
          {mode === "demo" ? "架空データで動作中" : "専用Supabaseに接続"}
          <p>
            SUGA CONSULTING
            <br />& PARTNERS
          </p>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="topbar-company">
            すがコンサルティング＆パートナーズ
          </span>
          <div>
            <span className="pill">{mode === "demo" ? "DEMO" : "PRIVATE"}</span>
            <button
              onClick={() =>
                mode === "live"
                  ? supabase.auth.signOut()
                  : (setMode("login"),
                    setData(empty),
                    setClients([]),
                    setFilters(initialFilters),
                    setSelected(null))
              }
            >
              退出
            </button>
          </div>
        </header>
        <main className="content">
          <div className="heading">
            <div>
              <div className="eyebrow">
                {tab === "search"
                  ? "FACILITY EXPLORER"
                  : tab === "clients"
                    ? "CLIENT MANAGEMENT"
                    : "DATA MANAGEMENT"}
              </div>
              <h1>
                {tab === "search"
                  ? "医療機関検索"
                  : tab === "clients"
                    ? "顧問先医療機関"
                    : "データ・更新"}
              </h1>
              <p className="muted">
                {tab === "import"
                  ? "公表データの取得状況と、検証済みデータの入替を管理します。"
                  : "条件を組み合わせて、必要な医療機関を見つけます。"}
              </p>
            </div>
            {tab !== "import" && (
              <div className="export-buttons">
                <button
                  disabled={busy || !results.length}
                  onClick={() => exportData("csv")}
                >
                  ↓ CSV
                </button>
                <button
                  className="primary"
                  disabled={busy || !results.length}
                  onClick={() => exportData("xlsx")}
                >
                  ↓ Excelで出力
                </button>
              </div>
            )}
          </div>
          {mode === "demo" && (
            <div className="demo-banner">
              架空データで動作確認中 ·
              実在の医療機関・届出情報ではありません。変更は保存されません。
            </div>
          )}
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          {message && (
            <div role="status" className="success">
              {message}
            </div>
          )}
          {busy && <p role="status">処理中…</p>}
          {tab === "import" ? (
            <>
              <section className="panel">
                <h2>会社ロゴ</h2>
                <p className="muted">
                  会社ロゴの原本を選ぶと、画面上で配置を確認できます。本番には同じ画像を
                  company-logo.png として設置します。
                </p>
                <label>
                  ロゴ画像（PNG・JPEG・WebP）
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        if (file.size > 5 * 1024 * 1024) {
                          setError("ロゴは5MB以内にしてください。");
                          return;
                        }
                        setLogo(URL.createObjectURL(file));
                      }
                    }}
                  />
                </label>
              </section>
              <div className="stats">
                <article>
                  <span>医療機関</span>
                  <strong>
                    {data.facilities.length.toLocaleString()}
                    <small>件</small>
                  </strong>
                </article>
                <article>
                  <span>届出情報</span>
                  <strong>
                    {data.filings.length.toLocaleString()}
                    <small>件</small>
                  </strong>
                </article>
                <article>
                  <span>月次更新</span>
                  <strong className="schedule">
                    毎月20日<small>失敗局は25日再取得</small>
                  </strong>
                </article>
              </div>
              <section className="panel">
                <h2>公表データの自動取得</h2>
                <p>
                  対象：北海道・東北・関東信越・東海北陸・近畿・中国四国・四国厚生支局・九州
                </p>
                <div className="notice">
                  自動取得は設定・検証中です。8局すべての取得と整合性の確認が完了するまで、本番データを切り替えません。
                </div>
                <p className="muted">
                  最終反映：
                  {meta?.updated_at
                    ? new Date(meta.updated_at).toLocaleString("ja-JP", {
                        timeZone: "Asia/Tokyo",
                      })
                    : "未反映"}
                  　／　出典・取得状況は実装資料の SOURCES.md
                  を参照してください。
                </p>
              </section>
              <section className="panel">
                <h2>検証済みCSVを取り込む</h2>
                <p className="muted">
                  UTF-8の医療機関CSVと届出CSVを一緒に取り込みます。現在の医療機関・届出情報を全件入れ替えます。残る医療機関の顧問先情報は維持されます。
                </p>
                <div className="import-grid">
                  {[
                    ["facilities", "1. 医療機関一覧", FACILITY_COLUMNS],
                    ["filings", "2. 届出事項一覧", FILING_COLUMNS],
                  ].map(([key, label, columns]) => (
                    <div key={key}>
                      <label>
                        {label}
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          onChange={(e) => {
                            setImportFiles((f) => ({
                              ...f,
                              [key]: e.target.files[0],
                            }));
                            setStaged(null);
                            setImportConfirm(false);
                          }}
                        />
                      </label>
                      <button
                        onClick={() =>
                          download(
                            `${key}_template.csv`,
                            toCsv([
                              Object.fromEntries(columns.map((k) => [k, ""])),
                            ]),
                            "text/csv;charset=utf-8",
                          )
                        }
                      >
                        CSVテンプレート ↓
                      </button>
                      <small className="muted">{columns.join(", ")}</small>
                    </div>
                  ))}
                </div>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={previewImport}
                >
                  データを検証・プレビュー
                </button>
                {staged && (
                  <div className="preview">
                    <h3>
                      医療機関 {staged.facilities.length.toLocaleString()}件 ／
                      届出 {staged.filings.length.toLocaleString()}件
                    </h3>
                    <p>
                      {staged.facilities
                        .slice(0, 3)
                        .map((f) => f.name)
                        .join("、")}
                    </p>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={importConfirm}
                        onChange={(e) => setImportConfirm(e.target.checked)}
                      />
                      現在のデータをこの内容に入れ替えることを確認しました
                    </label>
                    <button
                      className="primary"
                      disabled={busy || !importConfirm}
                      onClick={applyImport}
                    >
                      入替を反映
                    </button>
                  </div>
                )}
              </section>
            </>
          ) : (
            <>
              <div className="stats">
                <article>
                  <span>登録医療機関</span>
                  <strong>
                    {data.facilities.length.toLocaleString()}
                    <small>件</small>
                  </strong>
                </article>
                <article>
                  <span>検索結果</span>
                  <strong>
                    {results.length.toLocaleString()}
                    <small>件</small>
                  </strong>
                </article>
                <article>
                  <span>顧問先</span>
                  <strong>
                    {clients.length.toLocaleString()}
                    <small>件</small>
                  </strong>
                </article>
              </div>
              <section className="panel filters">
                <div className="section-title">
                  <h2>抽出条件</h2>
                  <button
                    className="text-button"
                    onClick={() => setFilters(initialFilters)}
                  >
                    条件をクリア
                  </button>
                </div>
                <div className="filter-grid">
                  <label className="search-input">
                    キーワード
                    <input
                      placeholder="医療機関名・ID・住所で検索"
                      value={filters.q}
                      onChange={(e) => update("q", e.target.value)}
                    />
                  </label>
                  {selectField("都道府県", "prefecture", options("prefecture"))}
                  {selectField("開設者区分", "owner", options("owner_type"))}
                  {selectField(
                    "診療科目",
                    "department",
                    options("departments"),
                  )}
                  <label>
                    病床数（以上）
                    <input
                      type="number"
                      min="0"
                      value={filters.minBeds}
                      placeholder="0"
                      onChange={(e) => update("minBeds", e.target.value)}
                    />
                  </label>
                  <label>
                    病床数（以下）
                    <input
                      type="number"
                      min="0"
                      value={filters.maxBeds}
                      placeholder="上限なし"
                      onChange={(e) => update("maxBeds", e.target.value)}
                    />
                  </label>
                </div>
                <div className="filing-filter">
                  <div>
                    <label>
                      届出の正式名称を検索
                      <input
                        placeholder="例：感染対策向上加算"
                        value={filingQuery}
                        onChange={(e) => setFilingQuery(e.target.value)}
                      />
                    </label>
                    <label style={{ marginTop: 10 }}>
                      届出事項
                      <select
                        aria-label="届出事項"
                        value={filters.filingCode}
                        onChange={(e) =>
                          setFilters((f) => ({
                            ...f,
                            filingCode: e.target.value,
                            filingMode: e.target.value ? f.filingMode : "all",
                          }))
                        }
                      >
                        <option value="">届出事項を選択</option>
                        {codes
                          .filter(
                            ([code, name]) =>
                              code === filters.filingCode ||
                              name.includes(filingQuery.trim()),
                          )
                          .map(([code, name]) => (
                            <option key={code} value={code}>
                              {name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                  <fieldset>
                    <legend>届出状況</legend>
                    {[
                      ["all", "すべて"],
                      ["yes", "届出あり"],
                      ["no", "届出なし"],
                      ["unknown", "未確認"],
                    ].map(([v, label]) => (
                      <label
                        key={v}
                        className={
                          filters.filingMode === v ? "radio active" : "radio"
                        }
                      >
                        <input
                          type="radio"
                          name="filing-mode"
                          value={v}
                          checked={filters.filingMode === v}
                          disabled={v !== "all" && !filters.filingCode}
                          onChange={() => update("filingMode", v)}
                        />
                        {label}
                      </label>
                    ))}
                  </fieldset>
                </div>
                <small className="muted">
                  「届出なし」は届出一覧の確認基準日が登録された施設のみ対象です。資料上の記載状況を示します。
                </small>
              </section>
              <section className="panel results">
                <div className="section-title">
                  <h2>
                    {tab === "clients" ? "顧問先一覧" : "検索結果"}{" "}
                    <span className="count">
                      {results.length.toLocaleString()}件
                    </span>
                  </h2>
                  <span className="muted">
                    医療機関名をクリックして詳細を確認
                  </span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>医療機関名 / ID</th>
                        <th>所在地</th>
                        <th>病床数</th>
                        <th>開設者区分</th>
                        <th>診療科目</th>
                        <th>
                          {filters.filingCode ? "検索届出状況" : "届出確認"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.slice((page - 1) * 25, page * 25).map((f) => (
                        <tr key={f.facility_id}>
                          <td>
                            <button
                              className="facility-link"
                              onClick={() => select(f)}
                            >
                              {f.name}
                            </button>
                            {isClient(f.facility_id) && (
                              <span className="client-badge">顧問先</span>
                            )}
                            <small>{f.facility_id}</small>
                          </td>
                          <td>
                            {f.prefecture}
                            <small>{f.address}</small>
                          </td>
                          <td className="number">
                            {f.beds.toLocaleString()}
                            <small>床</small>
                          </td>
                          <td>{f.owner_type}</td>
                          <td className="departments">
                            {f.departments.map((d) => (
                              <span key={d}>{d}</span>
                            ))}
                          </td>
                          <td>
                            <span className="badge">
                              {filters.filingCode
                                ? filingStatus(
                                    f,
                                    filters.filingCode,
                                    data.filings,
                                  )
                                : f.coverage_complete
                                  ? "確認済み"
                                  : "未確認"}
                            </span>
                            <small>{f.coverage_as_of || "基準日未登録"}</small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!results.length && (
                    <div className="empty">
                      <h3>該当する医療機関がありません</h3>
                      <p>抽出条件を変更するか、データを取り込んでください。</p>
                    </div>
                  )}
                </div>
                <footer className="pagination">
                  <span>
                    {results.length
                      ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, results.length)} / ${results.length}件`
                      : "0件"}
                  </span>
                  <div>
                    <button
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      前へ
                    </button>
                    <button
                      disabled={page * 25 >= results.length}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      次へ
                    </button>
                  </div>
                </footer>
              </section>
            </>
          )}
          <footer className="page-footer">
            全国医療機関情報検索サイト{" "}
            <span>公表資料の基準日時点の情報を扱います。</span>
          </footer>
        </main>
      </div>
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="詳細を閉じる"
              onClick={() => setSelected(null)}
            >
              ×
            </button>
            <span className="eyebrow">FACILITY DETAIL</span>
            <h2 id="detail-title">{selected.name}</h2>
            <p className="muted">
              {selected.facility_id} · {selected.prefecture} · {selected.beds}床
            </p>
            <p>
              〒{selected.postal_code} {selected.address}
            </p>
            <h3>届出事項</h3>
            <p className="muted">
              一覧確認：{selected.coverage_complete ? "確認済み" : "未確認"} ／
              基準日：{selected.coverage_as_of || "未登録"}
            </p>
            <ul className="filing-list">
              {data.filings
                .filter((f) => f.facility_id === selected.facility_id)
                .map((f) => (
                  <li key={f.code}>
                    <strong>{f.official_name}</strong>
                    <small>
                      {f.code} ／ 受理日：{f.accepted_on || "未登録"}
                    </small>
                  </li>
                ))}
            </ul>
            {!data.filings.some(
              (f) => f.facility_id === selected.facility_id,
            ) && <p>届出の記載データはありません。</p>}
            <hr />
            <h3>顧問先の管理</h3>
            <label>
              管理メモ
              <textarea
                maxLength={4000}
                rows="3"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="確認事項などを入力"
              />
            </label>
            <div className="actions">
              <button
                className="primary"
                disabled={busy}
                onClick={() => persistClient()}
              >
                {isClient(selected.facility_id) ? "メモを保存" : "顧問先に登録"}
              </button>
              {isClient(selected.facility_id) && (
                <button disabled={busy} onClick={() => persistClient(true)}>
                  顧問先から解除
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
