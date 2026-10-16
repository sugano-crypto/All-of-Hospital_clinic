import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import fs from "node:fs/promises";
test("filter, formal names, unknown exclusion, CSV/XLSX, clients and validated import", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "架空データでデモを開く" }).click();
  await expect(
    page.getByRole("heading", { name: "医療機関検索" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(6);
  await page.getByLabel("病床数（以上）").fill("100");
  await page.getByLabel("病床数（以下）").fill("300");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByRole("button", { name: "条件をクリア" }).click();
  await page.getByLabel("届出の正式名称を検索").fill("医療DX");
  await page.getByLabel("届出事項", { exact: true }).selectOption("DX");
  await page.getByRole("radio", { name: "届出なし", exact: true }).check();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("サンプルみなと病院");
  const csv = page.waitForEvent("download");
  await page.getByRole("button", { name: "↓ CSV", exact: true }).click();
  const csvBody = await fs.readFile(await (await csv).path(), "utf8");
  expect(csvBody).toContain("サンプルみなと病院");
  expect(csvBody).not.toContain("サンプル青葉病院");
  expect(csvBody).toContain("医療DX推進体制整備加算");
  const xlsx = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excelで出力" }).click();
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(await (await xlsx).path());
  expect(book.worksheets[0].rowCount).toBe(2);
  expect(book.worksheets[0].getCell("B2").value).toBe("サンプルみなと病院");
  await page.getByRole("radio", { name: "未確認", exact: true }).check();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByRole("button", { name: "条件をクリア" }).click();
  await page
    .getByRole("button", { name: "サンプルみなと病院", exact: true })
    .click();
  await page.getByLabel("管理メモ").fill("次回の届出を確認");
  await page.getByRole("button", { name: "顧問先に登録" }).click();
  await page.getByLabel("詳細を閉じる").click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "顧問先" })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page
    .getByRole("button", { name: "サンプルみなと病院", exact: true })
    .click();
  await expect(page.getByLabel("管理メモ")).toHaveValue("次回の届出を確認");
  await page.getByRole("button", { name: "顧問先から解除" }).click();
  await page.getByLabel("詳細を閉じる").click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "データ・更新" })
    .click();
  await page
    .getByLabel("1. 医療機関一覧")
    .setInputFiles({
      name: "facilities.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "facility_id,name,prefecture,postal_code,address,beds,owner_type,departments,coverage_complete,coverage_as_of\nTEST-001,テスト病院,東京都,001-0000,架空住所,12,医療法人,内科,true,2026-10-01",
      ),
    });
  await page
    .getByLabel("2. 届出事項一覧")
    .setInputFiles({
      name: "filings.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "facility_id,code,official_name,accepted_on\nTEST-001,F001,正式名称の加算,2026-10-01",
      ),
    });
  await page.getByRole("button", { name: "データを検証・プレビュー" }).click();
  await expect(page.getByRole("button", { name: "入替を反映" })).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "入替を反映" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "医療機関検索" })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("テスト病院");
  expect(errors).toEqual([]);
});
test("desktop and mobile render without overflow in page container", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "架空データでデモを開く" }).click();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: "/workspace/work/national-medical-facility-search/desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/workspace/work/national-medical-facility-search/mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
