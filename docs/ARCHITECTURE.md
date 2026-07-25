# Arquitectura y límites de seguridad

El iPhone abre la PWA HTTPS. La PWA incrusta noVNC, que muestra el escritorio Xvfb donde Playwright mantiene un Chromium con perfil persistente. El servidor conserva estado efímero, aplica autenticación, CSRF, límites de tasa y ofrece órdenes cancelables.

## Modelo de confianza

El contenido web es **datos no confiables**. `agent-core` sólo planifica desde la instrucción autenticada del usuario; nunca interpreta texto del DOM como órdenes. `browser-core` expone únicamente `navigate`, `click`, `type`, `select`, `scroll`, `read`, `wait` y `screenshot`. No existe `eval` ni ejecución de JavaScript producido por un modelo. El DOM se limita a 200 controles, sin valores y con texto truncado.

Password, OTP, passkey, CAPTCHA y 2FA requieren control manual. Las capturas no se persisten por defecto. La auditoría registra metadatos redactados, no contenido clínico completo. En el MVP toda modificación clínica está bloqueada; incluso con `ALLOW_CLINICAL_WRITES=true`, una acción sensible debe pasar por una confirmación que muestre dominio, entidad, acción y datos antes de ejecutarse. La interfaz final de esa confirmación queda fuera del MVP y, por lo tanto, habilitar la bandera no vuelve ejecutables las escrituras.

## Fases

1. MVP de lectura, autenticación manual y allowlist.
2. Integración validada con selectores de cada SIHOSP en un entorno ficticio.
3. Confirmaciones sensibles y auditoría cifrada revisadas por seguridad/compliance.
4. Piloto privado sin datos reales y validación en iPhone.
5. Producción sólo tras evaluación legal, privacidad, backups y respuesta a incidentes.
