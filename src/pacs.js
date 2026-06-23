import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { validateRuntimeConfig } from "./config.js";
import { logSafe, maskPatient } from "./logger.js";

async function login(page, config) {
  await page.goto(config.pacsBaseUrl, { waitUntil: "domcontentloaded" });
  const user = page.locator(config.selectors.user).first();
  if (await user.count()) {
    await user.fill(config.pacsUser);
    await page.locator(config.selectors.pass).first().fill(config.pacsPass);
    await Promise.all([
      page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined),
      page.locator(config.selectors.loginButton).first().click(),
    ]);
  }
}

async function withPage(config, fn) {
  const missing = validateRuntimeConfig(config);
  if (missing.length) throw new Error(`Faltan variables: ${missing.join(", ")}`);
  let browser;
  try {
    browser = await chromium.launch({ headless: config.headless });
    const context = await browser.newContext({ acceptDownloads: false });
    const page = await context.newPage();
    await login(page, config);
    return await fn(page);
  } finally {
    await browser?.close();
  }
}

async function openStudyInPage(page, config, patientQuery, index) {
  const search = page.locator(config.selectors.search).first();
  await search.waitFor({ timeout: 20000 });
  await search.fill(patientQuery);
  await search.press("Enter");
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);

  const rows = page.locator("table tbody tr, [role='row'], .study, .result, .resultado");
  const count = await rows.count();
  if (count === 0) throw new Error("No se encontraron estudios para la búsqueda indicada");
  const row = rows.nth(index);
  const title = (await row.innerText()).split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 5).join(" | ");

  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined),
    row.dblclick().catch(async () => row.click()),
  ]);

  return {
    patientQuery: maskPatient(patientQuery),
    index,
    title: maskPatient(title || "Estudio PACS"),
    url: page.url(),
    capturedAt: new Date().toISOString(),
  };
}

export async function getLastStudy(config, patientQuery, index = 0) {
  logSafe("Buscando último estudio PACS", { patientQuery, index });
  return withPage(config, (page) => openStudyInPage(page, config, patientQuery, index));
}

export async function captureStudy(config, patientQuery, index = 0) {
  logSafe("Capturando visor PACS", { patientQuery, index });
  return withPage(config, async (page) => {
    const summary = await openStudyInPage(page, config, patientQuery, index);
    await page.locator(config.selectors.viewer).first().waitFor({ timeout: 20000 }).catch(() => undefined);
    await mkdir("artifacts", { recursive: true });
    const fileName = `${Date.now()}-${maskPatient(patientQuery).replace(/[^a-z0-9_-]+/gi, "_")}.png`;
    const screenshotPath = path.join("artifacts", fileName);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    return { ...summary, screenshotPath };
  });
}

export async function discoverInternalEndpoints(config) {
  const missing = validateRuntimeConfig(config);
  if (missing.length) throw new Error(`Faltan variables: ${missing.join(", ")}`);
  const candidates = ["/api", "/api/studies", "/api/patients", "/swagger", "/swagger.json", "/openapi.json", "/dicom-web/studies", "/wado", "/wado-rs", "/qido-rs/studies"];
  const base = config.pacsBaseUrl.replace(/\/$/, "");
  const results = [];
  for (const candidate of candidates) {
    try {
      const response = await fetch(`${base}${candidate}`, { method: "GET", redirect: "manual" });
      if (response.status !== 404) {
        results.push({ path: candidate, status: response.status, contentType: response.headers.get("content-type") ?? undefined });
      }
    } catch {
      // Ignorar endpoints no alcanzables para seguir probando candidatos.
    }
  }
  return { baseUrl: base, checkedAt: new Date().toISOString(), candidates: results, note: "Exploración pasiva; no descarga estudios ni persiste datos clínicos." };
}
