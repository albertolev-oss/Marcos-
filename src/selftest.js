import assert from "node:assert/strict";
import { maskPatient } from "./logger.js";
import { readConfig, validateRuntimeConfig } from "./config.js";

const masked = maskPatient("PEREZ JUAN 12345678");
assert.equal(masked.includes("PEREZ"), false);
assert.equal(masked.includes("12345678"), false);

const config = readConfig({ PACS_BASE_URL: "https://example.test", PACS_USER: "u", PACS_PASS: "p", HTTP_API_TOKEN: "12345678901234567890123456789012" });
assert.deepEqual(validateRuntimeConfig(config, true), []);

console.log(JSON.stringify({ ok: true, checked: ["maskPatient", "config"] }, null, 2));
