# Navegador Chromium remoto — MVP de demostración

MVP instalable como PWA para controlar Chromium desde iPhone mediante noVNC. Playwright ofrece únicamente navegación, búsqueda y lectura. **No está autorizado para uso clínico real.** Todo ejemplo y prueba usa datos ficticios.

## Invariantes de seguridad

- `ALLOW_CLINICAL_WRITES` debe ser exactamente `false`; cualquier otro valor impide arrancar.
- Credenciales, contraseña, OTP y CAPTCHA se ingresan manualmente dentro del escritorio noVNC. No deben enviarse a la API ni a un modelo.
- La API usa una lista positiva: estado, navegación, atrás, adelante, recarga, búsqueda y lectura. No ofrece click, escritura, carga de archivos ni submit.
- Después del login, **Activar modo lectura** coloca un escudo sobre noVNC. Para volver a controlar manualmente el escritorio hay que desbloquearlo de forma visible.
- El puerto VNC escucha solo en localhost y se publica mediante WebSocket detrás del proxy web.
- El perfil en `/data/chromium` conserva cookies de sesión y es sensible. Proteja y elimine el volumen al terminar.
- La PWA no cachea `/api/` ni `/novnc/`.

> Límite conocido: mientras el escritorio está desbloqueado para el login manual, el usuario humano controla Chromium. El sistema no puede distinguir un login de una modificación. Use el desbloqueo solo para autenticarse y active inmediatamente el modo lectura.

## Uso local

```bash
cp .env.example .env
docker compose up --build
```

Abra `http://localhost:8080`, inicie sesión **manualmente** en el sitio ficticio y active modo lectura. No escriba secretos en la barra URL ni en los controles de la PWA.

## Pruebas

```bash
npm install
npm test
npm run check
docker compose config
docker compose build
```

## Railway (solo preparación, no despliegue)

La configuración se incluye únicamente para una demostración con datos sintéticos. Defina `ALLOW_CLINICAL_WRITES=false`, monte un volumen en `/data/chromium` y use un `DEMO_ORIGIN` ficticio. Railway recibe `PORT` dinámicamente. No conecte esta demo a SIHOSP real ni cargue información de pacientes.

Antes de cualquier despliegue se requiere una aprobación separada, revisión de autenticación perimetral/TLS y análisis institucional de privacidad. Esta versión no incorpora autenticación multiusuario y, por tanto, **no debe exponerse públicamente**.

## Borrado de sesión

Detenga los contenedores y elimine el volumen cuando ya no se necesite:

```bash
docker compose down -v
```
