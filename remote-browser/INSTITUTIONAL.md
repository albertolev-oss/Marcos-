# SIHOSP/PACS: lectura del agente después del login manual

Esta modalidad agrega acceso al **texto visible de la página que vos selecciones** en SIHOSP o PACS. Las herramientas no realizan búsquedas de pacientes, navegación, clicks, escritura, envío de formularios ni cargas. La demo sintética conserva su configuración y sus siete acciones.

## Arranque en Windows

Con el repositorio en la rama `codex/agents-api-readonly-demo` y Docker Desktop iniciado, abrí PowerShell en `remote-browser`:

```powershell
.\scripts\start-institutional.ps1
```

El script inicia dos escritorios y abre sus paneles. No cambia la política de ejecución de PowerShell; también podés ejecutar directamente:

```powershell
docker compose -f docker-compose.institutional.yml up --build -d
```

En macOS/Linux usá el mismo comando de Docker.

| Panel local | Portal del Chromium remoto | Sesión |
|---|---|---|
| http://localhost:8082 | https://sihosp.fcm.unc.edu.ar | SIHOSP, perfil propio |
| http://localhost:8083 | https://pacs.fcm.unc.edu.ar/viewer/index.php | PACS, perfil propio |

Las sesiones, cookies, capturas y procesos están separados. Los puertos se publican solo en loopback. Desde el iPhone podés usar el acceso remoto privado a esa PC; esta configuración no publica el escritorio en Internet.

## Login y lectura

1. En el escritorio de cada panel iniciá sesión **manualmente**. Usuario, clave, OTP y CAPTCHA se ingresan dentro del portal. La API y las tools no aceptan esas credenciales.
2. Seleccioná manualmente el paciente o estudio y abrí la página concreta que querés leer. Dejá una única pestaña del portal correspondiente. No inicies una operación de guardado o envío al capturar.
3. Pulsá **Capturar página para lectura**. La aplicación restringe las solicitudes del contexto, lo pone offline y pausa scripts. Extrae una única copia de texto visible y la mantiene en memoria local durante un máximo de cinco minutos. La extracción se limita a 20.000 caracteres y marca `truncated` si se recorta.
4. **Leer página** permite revisar localmente qué texto quedó disponible. Los formularios pueden envolver texto clínico en sistemas antiguos: se conserva el texto visible ordinario, pero se excluyen controles, campos de entrada, contenido oculto e iframes. La presencia de controles visibles de contraseña/OTP/CAPTCHA impide capturar.
5. **Leer página con el agente** envía ese texto a OpenAI a través de Agents API y obtiene un resumen de lectura. Requiere `AGENTS_ENABLED=true` y una `OPENAI_API_KEY` configurada únicamente en el entorno del servidor. La captura local por sí sola no inicia ninguna sesión de OpenAI.
6. **Volver al inicio manual** cancela el trabajo pendiente, borra la captura local y restaura el escritorio. Después podés seleccionar otra página y capturar de nuevo. La aplicación también retira el texto visible del panel al vencer la captura. Esto no borra los datos que una ejecución anterior ya hubiera enviado a OpenAI.

El resumen es texto no validado y puede omitir o interpretar mal contenido. La fuente es una captura, no una consulta en vivo. Si hay varias personas visibles, el agente debe señalarlo y evitar combinar registros. No se infiere que una página esté autenticada solo por su dominio: el login y la selección son tuyos.

## PACS: alcance concreto

Se leen metadatos y texto que ya estén visibles en el documento principal. **No se leen los píxeles de las radiografías, canvas, PDF embebidos ni frames; no se descarga DICOM ni se implementa DICOMweb.** Si el visor contiene únicamente una imagen o carga todo en un iframe, puede no haber texto útil: la aplicación no inventa una lectura ni amplía permisos automáticamente.

## Controles aplicados

- `BROWSER_MODE=sihosp` o `pacs` elige un destino HTTPS fijo. No se amplía `DEMO_ORIGIN` a un sitio real.
- Un proceso y un volumen distinto por portal. La selección de pestaña exige una única coincidencia exacta de origen; rechaza credenciales embebidas, otros dominios y sesiones ambiguas.
- Las tools institucionales son únicamente `status`, `find` y `read`. `find` busca dentro de la captura, no en la base hospitalaria.
- `navigate`, `back`, `forward`, `reload`, `click`, `type`, `submit`, `upload` y JavaScript arbitrario están bloqueados. La captura se genera desde un control manual local, nunca desde una tool del modelo.
- Durante la lectura, las tools solo consumen memoria: no tocan la página ni invocan endpoints clínicos. Las rutas se bloquean antes de capturar, se detiene la carga y se pausan scripts. Se rechazan contextos con workers activos que no pueden aislarse adecuadamente.
- Si el aislamiento o la extracción falla, no se publica una captura. Puede hacer falta **Volver al inicio manual** para restaurar el escritorio antes de reintentar.
- No se devuelven URLs completas con queries/tokens, títulos de ventana, cookies ni estado de almacenamiento. La captura contiene sistema, origen, hora e identificador local aleatorio.
- No se guardan capturas o respuestas en archivos, logs o cachés de la aplicación. El perfil de Chromium conserva su sesión y contenido según el comportamiento normal del navegador. El texto enviado al proveedor queda sujeto a la configuración de datos de tu proyecto de OpenAI.

El bloqueo no puede deshacer solicitudes ya enviadas durante el manejo manual. Tampoco convierte el escritorio humano en un sistema de solo lectura permanente. La garantía de esta modalidad es que el agente solo recibe la captura y no opera sobre el portal. No hay permisos de escritura clínica habilitados.

## Pruebas y estado

```bash
npm ci
npm test
node node_modules/playwright-core/cli.js install --with-deps chromium
npm run test:browser
npm run check
```

Las pruebas usan exclusivamente HTML y respuestas sintéticas, incluso al simular los orígenes institucionales. Verifican selección de pestaña, pausa/reanudación, exclusión de secretos, vencimiento, cancelación y rechazo de escrituras. No requieren credenciales institucionales ni envían datos de pacientes a OpenAI.

Esta rama prepara el acceso real, pero una sesión real solo queda conectada después de iniciar los contenedores y completar el login manual. La validación automatizada no comprueba la estructura autenticada actual de SIHOSP/PACS ni su conectividad desde tu PC. Docker/noVNC y una sesión real de Agents API aún requieren validación en el equipo de ejecución.

## Detener sin borrar sesiones

```bash
docker compose -f docker-compose.institutional.yml down
```

Para eliminar intencionalmente ambos perfiles al finalizar, añadí `-v`. No lo uses si querés conservar la sesión manual.
