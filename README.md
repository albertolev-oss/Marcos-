# Rodilla 3D Marcos

Visor 3D educativo de rodilla/protesis para traumatología.

## Uso

Abrir `index.html` desde GitHub Pages.

## GitHub Pages

Activar en:

`Settings → Pages → Deploy from branch → main → /root → Save`

URL esperada:

`https://albertolev-oss.github.io/Marcos-/`

## Nota médica

Modelo educativo aproximado. No sirve para planificación quirúrgica real ni navegación intraoperatoria.

## PACS VisualMedica connector (Railway / ChatGPT)

Este repositorio incluye un conector Node/Express para construir enlaces de búsqueda hacia el PACS FCM UNC (`pacs.fcm.unc.edu.ar`) y exponer un contrato OpenAPI para ChatGPT Actions o despliegues en Railway.

### Uso local

```bash
npm install
cp .env.example .env
npm run check
npm start
```

Endpoints principales:

- `GET /health`: estado del conector y configuración activa.
- `GET /config`: configuración PACS actual (puede protegerse con `CONNECTOR_API_KEY`).
- `POST /study-link`: construye enlaces web y QIDO-RS sin tocar el PACS.
- `POST /search`: construye enlaces y, si `PACS_PROXY_BASE_URL` existe, consulta un proxy institucional autorizado.
- `GET /openapi.yaml`: esquema para ChatGPT/Railway.
- `GET /chatgpt`: instrucciones e URL exacta para instalar la acción en un GPT.

### Agregarlo en ChatGPT

1. Desplegar este repositorio en Railway y generar un dominio HTTPS público.
2. En Railway, configurar `PUBLIC_BASE_URL` con ese dominio y `CONNECTOR_API_KEY` con una clave secreta larga.
3. Abrir `https://TU-DOMINIO.up.railway.app/chatgpt`.
4. En ChatGPT, crear o editar un GPT y entrar en **Configurar → Acciones → Crear nueva acción**.
5. Importar `https://TU-DOMINIO.up.railway.app/openapi.yaml`.
6. Configurar autenticación **API Key**, tipo **Custom**, encabezado `x-api-key`, usando el mismo secreto de Railway.
7. Probar la acción `buildStudyLink` y guardar el GPT.

ChatGPT no puede alcanzar `localhost` ni una página alojada sólo en GitHub Pages: el backend debe estar publicado en una URL HTTPS, por ejemplo Railway.

### Variables Railway

Configurar secretos sólo como variables de entorno, nunca en HTML ni commits:

- `PORT` lo define Railway automáticamente.
- `PUBLIC_BASE_URL=https://TU-DOMINIO.up.railway.app`
- `PACS_BASE_URL=https://pacs.fcm.unc.edu.ar`
- `PACS_WEB_PATH=/`
- `PACS_DICOMWEB_PATH=/dicom-web`
- `CONNECTOR_API_KEY` opcional para proteger endpoints.
- `PACS_PROXY_BASE_URL` y `PACS_PROXY_TOKEN` opcionales si existe un proxy read-only institucional.
