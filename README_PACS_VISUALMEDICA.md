# PACS VisualMedica ChatGPT Pro v3

Conector local/servidor para abrir VisualMedica PACS desde Playwright, exponer herramientas MCP y publicar una API REST consumible por ChatGPT Actions.

## Instalación en Mac

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

Editá `.env` y completá:

```env
PACS_BASE_URL=https://tu-pacs
PACS_USER=TU_USUARIO
PACS_PASS=TU_CONTRASEÑA
HEADLESS=false
HTTP_API_TOKEN=un_token_largo_y_secreto_de_32_caracteres
```

## Comandos

```bash
npm run healthcheck
npm run last -- "APELLIDO NOMBRE"
npm run capture -- "APELLIDO NOMBRE" --index 1
npm run discover
npm run mcp
npm run api
```

## Herramientas MCP

- `ultimo_estudio_pacs`: busca paciente, abre un estudio y devuelve resumen.
- `capturar_visor_pacs`: además guarda una captura en `artifacts/`.
- `discover_visualmedica`: detecta endpoints internos candidatos para una versión futura sin clicks.

## ChatGPT desde celular

Leé `docs/CHATGPT_ACTIONS.md` y cargá `openapi/openapi.yaml` como Action de un GPT personalizado.

## Seguridad

No entré a ningún PACS real ni guardé credenciales. Usá `.env` local/servidor y rotá cualquier clave real que se haya compartido fuera del entorno seguro.
