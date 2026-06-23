const bool = (value, fallback) => {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "si", "sí"].includes(String(value).toLowerCase());
};

export function readConfig(env = process.env) {
  return {
    pacsBaseUrl: env.PACS_BASE_URL ?? "",
    pacsUser: env.PACS_USER ?? "",
    pacsPass: env.PACS_PASS ?? "",
    headless: bool(env.HEADLESS, true),
    httpApiToken: env.HTTP_API_TOKEN ?? "",
    selectors: {
      user: env.PACS_USER_SELECTOR ?? 'input[name="username"], input[type="text"]',
      pass: env.PACS_PASS_SELECTOR ?? 'input[name="password"], input[type="password"]',
      loginButton: env.PACS_LOGIN_BUTTON_SELECTOR ?? 'button[type="submit"], input[type="submit"]',
      search: env.PACS_SEARCH_SELECTOR ?? 'input[type="search"], input[name="search"], input[placeholder*="Buscar"], input[placeholder*="Paciente"]',
      viewer: env.PACS_VIEWER_SELECTOR ?? "body",
    },
  };
}

export function validateRuntimeConfig(config, requireHttpToken = false) {
  const missing = [];
  if (!config.pacsBaseUrl) missing.push("PACS_BASE_URL");
  if (!config.pacsUser) missing.push("PACS_USER");
  if (!config.pacsPass) missing.push("PACS_PASS");
  if (requireHttpToken && config.httpApiToken.length < 32) missing.push("HTTP_API_TOKEN (mínimo 32 caracteres)");
  return missing;
}
