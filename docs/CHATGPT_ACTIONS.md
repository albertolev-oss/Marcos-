# Usar desde ChatGPT Actions

1. Desplegá la API con HTTPS público y un `HTTP_API_TOKEN` largo.
2. En tu GPT personalizado, agregá una Action e importá `openapi/openapi.yaml`.
3. Cambiá el `servers.url` del YAML por tu dominio real.
4. Configurá autenticación **Bearer** y pegá el mismo token que usás en `HTTP_API_TOKEN`.
5. Probá la acción `ultimoEstudioPacs` con un paciente de prueba.

## Seguridad

- No guardes credenciales reales en el repositorio.
- La descarga de estudios está deshabilitada: el navegador se crea con `acceptDownloads: false`.
- Los logs pasan por enmascarado básico de nombre/documento de paciente.
- Pedí un usuario técnico específico para este conector si el PACS lo permite.
