# Instalación y operación

## Desarrollo

Requisitos: Node 22, Docker y un certificado HTTPS confiable. Ejecutar:

```bash
cp .env.example .env
# Reemplazar secretos y definir exclusivamente dominios autorizados.
npm install
npm test
docker compose up --build
```

Los puertos se publican sólo en loopback. Un proxy HTTPS debe enrutar `/` al puerto 3000 y `/novnc/` al 6080 (incluido WebSocket). No exponga VNC 5900. El endpoint `clear-profile` borra cookies y almacenamiento web; para una destrucción completa del perfil, detenga el contenedor y elimine el volumen `browser-profile`.

## VPS privado (recomendado)

Use Debian/Ubuntu actualizado, firewall sin puertos públicos salvo el proxy y disco cifrado. Con **Tailscale**, publique el proxy únicamente en la IP de la tailnet y use ACL por usuario/dispositivo. Como alternativa, ponga **Cloudflare Access** delante del hostname con MFA; mantenga además la autenticación propia. Configure backups cifrados sólo si existe base legal, rotación de secretos, alertas del health check y `restart: unless-stopped`.

Valide manualmente: instalación desde Safari mediante “Agregar a pantalla de inicio”, rotación/reconexión, inicio de sesión manual, persistencia tras reinicio, detención inmediata y borrado del perfil. El timeout predeterminado es 15 minutos.

## Railway (sólo demostración)

Railway puede no ofrecer el escritorio/volumen/aislamiento adecuados. Úselo únicamente con páginas ficticias, sin datos clínicos ni credenciales reales. Nunca se considera una configuración de producción clínica.

## Incidentes

Detenga el servicio, revoque acceso y secretos, preserve sólo metadatos mínimos, borre el perfil si existe riesgo de sesión robada y notifique según la normativa aplicable. Nunca copie datos clínicos a tickets.
