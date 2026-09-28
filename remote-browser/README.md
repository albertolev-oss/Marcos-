# Chromium de solo lectura + Agents API (beta)

**Nuevo: SIHOSP/PACS reales después de tu login manual.** Consultá [INSTITUTIONAL.md](INSTITUTIONAL.md) para iniciar los dos escritorios separados y habilitar lectura del texto de la página seleccionada. La sección siguiente describe la demo sintética original.

Prueba sobre Node 22, Express y Playwright del MVP `8e199ef`, integrado en `main` por `73f92e0`. Ejecuta las siete acciones existentes como **function tools de Agents API**. Usa exclusivamente las páginas estáticas SIHOSP/PACS de `tests/fixtures`, con Ana Ejemplo, `DEMO-0001` y estudio `DEMO-EST-0001`. No es una integración clínica validada.

## Ejecutar la demo desde el iPhone o escritorio

En una máquina con Docker Compose v2:

```bash
cd remote-browser
cp .env.example .env
docker compose up --build
```

1. Abrí `http://localhost:8080` en esa máquina. El puerto se publica solo en loopback; para otro dispositivo necesitás tu acceso remoto privado existente.
2. En el escritorio Chromium/noVNC, completá **manualmente** `demo` / `demo` y pulsá Entrar. Es una simulación sin autenticación real: los campos no se transmiten ni se guardan.
3. Activá **modo lectura**. Probá los botones SIHOSP demo, PACS demo, buscar y leer.
4. Para ejecutar el modelo, configurá en el entorno del servidor una `OPENAI_API_KEY` de tu proyecto con acceso a Agents API y `AGENTS_ENABLED=true`; recreá el contenedor con `docker compose up -d --build`. La clave necesita scopes `api.agents.read`, `api.agents.write` y `api.responses.write`. La prueba remota tiene consumo de API.
5. Pulsá **Ejecutar prueba sintética**. La consigna está fijada en código: consultar ambas fixtures y comparar los identificadores ficticios. No acepta un prompt libre ni credenciales.
6. **Detener agente y volver al inicio manual** invalida las lecturas locales y solicita cancelar el turno remoto. Un error o el límite de dos minutos también solicita cancelación; si la red impide confirmarla, revisá la sesión en OpenAI Platform.

El botón del agente permanece deshabilitado sin clave/configuración. El login nunca es una tool. La clave no se entrega a Chromium ni a la PWA. El resultado incluye identificador de sesión/turno, cantidad de tools y `toolErrors`: un turno completado no implica que todas sus tools hayan funcionado.

## Qué se conecta a SIHOSP y PACS

| Destino | Comportamiento de esta rama |
|---|---|
| SIHOSP demo | `http://mock-sihosp:8081/mock-sihosp.html`; siete tools de lectura |
| PACS demo | `http://mock-sihosp:8081/mock-pacs.html`; mismo origen, estudio textual sintético |
| SIHOSP institucional | Acceso manual externo a `https://sihosp.fcm.unc.edu.ar` |
| PACS institucional | Acceso manual externo a `https://pacs.fcm.unc.edu.ar/viewer/index.php` |

En modo demo, estos enlaces abren el navegador del dispositivo y los dominios reales siguen rechazados como `DEMO_ORIGIN` o destinos de navegación. Para lectura del agente tras el login manual, usá los modos institucionales separados de [INSTITUTIONAL.md](INSTITUTIONAL.md). No se descargan estudios ni se usa DICOMweb real. Las ramas PACS existentes y sus PR #8/#12 no se mezclan en esta prueba.

## Pruebas sin clave ni llamadas a OpenAI

```bash
cd remote-browser
npm ci
npm test
npm run check
# Instalar Chromium para los dos tests de integración:
node node_modules/playwright-core/cli.js install --with-deps chromium
npm run test:browser
```

Usá Node 22. Los tests de integración lanzan Chromium headless y servidores locales efímeros; no requieren Docker, credenciales ni un modelo. El login automatizado que aparece en el **harness del test** prepara el estado humano ficticio; no existe en el catálogo de tools.

Los tests cubren:

- Catálogo exacto de siete tools y validación local de argumentos; bloqueo de `click`, `type`, `submit`, `upload`, `evaluate`, login y parámetros extra en tool/HTTP antes de tocar el navegador.
- `ALLOW_CLINICAL_WRITES=false` obligatorio; origen explícito local y paths estáticos; denegación de destinos institucionales, queries, URLs con credenciales, redirecciones y métodos de red distintos de GET durante la lectura.
- Texto visible sin formularios, inputs, contenido oculto ni frames; fijación de pestaña y cancelación de lecturas si cambia el modo.
- Contrato REST de Agents API, resultado 202 sin cuerpo, repetición de llamadas sin reejecutar navegación, estados de turno, fallos, cancelación, límites y paginación.
- SIHOSP/PACS sintéticos en Chromium real, ciclo del agente con API simulada y UI de login manual/cancelación.

Para desarrollo sin Docker, `npm run mock` sirve las fixtures en `http://127.0.0.1:8081`. Iniciá tu Chromium dedicado con CDP en `127.0.0.1:9222` y la página `/login.html`; luego:

```bash
DEMO_ORIGIN=http://127.0.0.1:8081 ALLOW_CLINICAL_WRITES=false npm start
```

Sin Docker, la UI/API local funciona en `http://127.0.0.1:3000`, pero el escritorio noVNC requiere los servicios de Docker. La demo permite solo los hosts locales `mock-sihosp`, `localhost` o `127.0.0.1`; no apuntes un mock local a datos reales.

## Implementación y contrato verificado

- `src/actions.js`: única ejecución de browser compartida por HTTP y agente. Acciones serializadas, origen revisado antes/después de lecturas, guardas de red y errores saneados.
- `src/agent-tools.js`: `status`, `navigate(value)`, `back`, `forward`, `reload`, `find(value)`, `read`. JSON Schema cerrado y validación independiente del modelo.
- `src/agents-client.js`: `fetch` nativo; host fijo `https://api.openai.com`, cabecera `OpenAI-Beta: agents=v1`. No usa Responses API ni Agents SDK.
- `src/agent-runner.js`: crea `POST /v1/agents/sessions` con `environment: {type: 'none'}`, multiagente desactivado y funciones locales. Consulta `required_actions`, devuelve `agent.session.input.tool_result` con `turn_id`/`call_id` a `/events` y espera el turno raíz `completed`. `idle` no significa éxito. Máximo 32 calls únicas y 120 segundos; historial acotado/paginado. Una llamada repetida usa su resultado guardado y la misma Idempotency-Key. El caché vive solo durante esa ejecución; no se reanuda automáticamente una sesión tras reiniciar el proceso.

No se expone un webhook público, shell, computer-use, MCP genérico, selector ni JavaScript arbitrario. El modelo no accede al CDP ni a cookies. El contenido leído se trata como dato no confiable; la protección efectiva está en el dispatcher y las guardas locales.

Fuentes oficiales consultadas el 28/09/2026, tras comprobar el newsletter del 24/09:

- [Functions](https://developers.openai.com/api/docs/guides/agents-api/tools/functions)
- [Configuring Agents](https://developers.openai.com/api/docs/guides/agents-api/configuration)
- [Quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart)
- [Session events](https://developers.openai.com/api/reference/resources/beta/subresources/agents/subresources/sessions/subresources/events/methods/create)
- [Turns](https://developers.openai.com/api/reference/resources/beta/subresources/agents/subresources/sessions/subresources/turns/methods/list)
- [Items](https://developers.openai.com/api/reference/resources/beta/subresources/agents/subresources/sessions/subresources/items/methods/list)

## Límites operativos

Esta aplicación local comparte una sola sesión y no incorpora autenticación multiusuario. No la publiques directamente en Internet. El escudo de noVNC es una ayuda visual; la barrera de las tools está en el servidor. Mientras está desbloqueado, el escritorio es manual y no se promete distinguir un login de cualquier otra acción humana. Los mocks son estáticos y sin Service Workers; un sitio clínico real requiere controles y validación específicos, porque incluso GET puede modificar datos. El perfil `/data/chromium` conserva el estado del navegador y no se envía al modelo.

Para borrar el perfil sintético al terminar:

```bash
docker compose down -v
```

La validación remota contra OpenAI requiere una clave con acceso a esta beta; las pruebas offline verifican el contrato documentado, no el acceso de una cuenta ni una ejecución real del modelo.
