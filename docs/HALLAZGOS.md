# Hallazgos de calidad y seguridad — Cuidarte+

Los hallazgos se detectaron con las pipelines automatizadas (ver `docs/PIPELINE.md`) y con
revisión manual del código. **Ninguno fue corregido**: se documentan junto con la evidencia y una
propuesta de mitigación. Severidad estimada según CVSS v3.1 cualitativo.

## Resumen de resultados de las pruebas automatizadas (ejecución local, 23-11-2026)

| Suite | Total | Aprobadas | Fallidas | Interpretación |
|---|---|---|---|---|
| Funcionales | 24 | 24 | 0 | Los flujos principales operan según los requerimientos |
| Seguridad (OWASP) | 15 | 1 | **14** | 14 vulnerabilidades confirmadas en ejecución |
| Rendimiento (p95 < 2 s) | 6 | 4 | **2** | `GET /pacientes` y `GET /examenes` tardan aproximadamente 5 s |
| ESLint frontend | — | — | **13 errores, 3 advertencias** | Variables sin uso, dependencias de hooks |
| npm audit backend | — | — | **7** (1 crítica, 4 altas, 2 moderadas) | Dependencias desactualizadas |
| npm audit frontend | — | — | **24** (17 altas, 6 moderadas, 1 baja) | Dependencias desactualizadas |
| Gitleaks | — | — | **3** secretos | `.env`, `BACKEND/.env`, `README.md` |

## Detalle de hallazgos

| ID | Hallazgo | Ubicación | OWASP | Severidad | Detectado por | Mitigación propuesta |
|---|---|---|---|---|---|---|
| H-01 | `DELETE /usuarios/:id` elimina usuarios **sin autenticación** | `BACKEND/src/routes/users.js:571` | A01 | Crítica | SEC-01, revisión | Middleware de autenticación global y verificación de rol admin antes de eliminar |
| H-02 | Ficha clínica completa expuesta sin token vía `GET /pacientes/buscar/rut/:rut` | `BACKEND/src/routes/pacientes.js:249` | A01 | Crítica | SEC-02, ZAP | Exigir JWT y rol médico/admin; minimizar los campos devueltos (Ley 20.584) |
| H-03 | Escalamiento de privilegios: cualquier usuario autenticado (incluido un paciente) crea usuarios con `rol_id = 1` (admin) | `BACKEND/src/routes/users.js:23` | A01 | Crítica | SEC-06 | Validar que el solicitante sea admin; lista blanca de roles asignables |
| H-04 | CRUD de `/roles` sin autenticación ni autorización | `BACKEND/src/routes/roles.js` | A01 | Alta | SEC-03, SEC-04 | Proteger con autenticación + rol admin |
| H-05 | Secreto JWT publicado en el repositorio (`.env`, `BACKEND/.env`, `README.md`): permite **falsificar tokens de administrador** | `.env:1`, `README.md:30` | A02/A07 | Crítica | Gitleaks, SEC-08 | Rotar el secreto, guardarlo en un gestor de secretos o en GitHub Secrets, y sacar `.env` del repositorio |
| H-06 | Secreto JWT por defecto `"inseguro"` si no existe la variable de entorno | todas las rutas (`const JWT_SECRET = ... \|\| "inseguro"`) | A02 | Alta | Semgrep, revisión | Que la app no arranque si `JWT_SECRET` no está definido |
| H-07 | Contraseñas almacenadas y comparadas **en texto plano** | `BACKEND/src/routes/auth.js:21,110`, `users.js:36` | A02 | Crítica | Revisión, Semgrep | Usar bcrypt/argon2 con sal y migrar las contraseñas existentes |
| H-08 | Credenciales de base de datos hardcodeadas (`alone15`, `postgres/postgres`) | `BACKEND/src/db.js:6`, `docker-compose.yml` | A07 | Alta | Semgrep, Trivy | Inyectar las credenciales por variables o secretos; usuario de BD con mínimo privilegio |
| H-09 | Sin límite de intentos de login (fuerza bruta) | `BACKEND/src/routes/auth.js:10` | A07 | Alta | SEC-09 | `express-rate-limit` + bloqueo temporal de la cuenta |
| H-10 | Política de contraseñas débil (mínimo 6 caracteres, acepta `123456`) | `BACKEND/src/validations/auth.js` | A07 | Media | SEC-10 | Mínimo 12 caracteres y lista de contraseñas comprometidas (ASVS 2.1) |
| H-11 | Los errores exponen detalles internos de PostgreSQL (`glosa: err.message`) | todas las rutas | A05 | Media | SEC-14, ZAP | Mensajes genéricos al cliente y detalle solo en logs del servidor |
| H-12 | Sin cabeceras de seguridad, `X-Powered-By: Express`, CORS `*` | `BACKEND/src/app.js:21`, `FRONTEND/nginx.conf` | A05 | Media | SEC-11/12/13, ZAP | `helmet`, CORS restringido a `FRONTEND_URL`, cabeceras CSP/HSTS en nginx |
| H-13 | La auditoría falla: se inserta el nombre de usuario en la columna `usuario_id` (BIGINT), lo que provoca HTTP 500 y deja operaciones **sin registro** | `BACKEND/src/routes/roles.js:25,65,83`, `users.js:584` | A09 | Alta | SEC-15 | Usar `authUser.usuarioId`; prueba de regresión SEC-15 |
| H-14 | `POST /auditoria` permite a cualquier usuario escribir registros arbitrarios (falsificación de logs) | `BACKEND/src/routes/audit.js:19` | A09 | Media | Revisión | Registro de auditoría solo desde el servidor (append-only) |
| H-15 | Archivos subidos: se confía en el MIME del cliente y el nombre original va sin sanitizar en `Content-Disposition` (inyección de cabeceras) | `BACKEND/src/routes/documentos.js:15,237,249` | A03/A04 | Media | Semgrep, revisión | Validar la firma real del archivo (magic bytes) y sanitizar o codificar el nombre (RFC 6266) |
| H-16 | Directorio `/files/documentos` servido estáticamente **sin autenticación** | `BACKEND/src/app.js:43` | A01 | Alta | Revisión | Servir los archivos solo mediante un endpoint autenticado |
| H-17 | Retardo artificial de 5 s (`delayMiddleware`) en endpoints de pacientes, exámenes y documentos | `BACKEND/src/middleware/delay.js`, `pacientes.js:145`, `examenes.js:46,99,330` | — (ISO 25010 desempeño) | Media | NF-01 | Eliminar el middleware en producción y activarlo solo con un flag de pruebas |
| H-18 | Dependencias vulnerables y obsoletas (`multer` 1.x, `proxy-addr`, `qs`, `jws`, `path-to-regexp`...) | `package-lock.json` | A06 | Alta | npm audit, Trivy | `npm audit fix`, actualizar a `multer` 2.x, mantener Dependabot |
| H-19 | Token JWT guardado en `localStorage` (robable mediante XSS) | `FRONTEND/src/context/AuthContext.jsx:41` | A07 | Media | Semgrep, revisión | Cookie `HttpOnly; Secure; SameSite=Strict` |
| H-20 | 13 errores de ESLint (código muerto, hooks con dependencias faltantes) y bundle de 1,4 MB | `FRONTEND/src/...` | — (mantenibilidad) | Baja | ESLint, build | Corregir lint y aplicar code-splitting con `import()` dinámico |
| H-21 | Contenedores: backend con `node:18` (fuera de soporte), ejecutado como root, `EXPOSE 3000` inconsistente con `PORT=4000`; el Dockerfile del frontend borra el `package-lock.json` (build no reproducible) | `BACKEND/Dockerfile`, `FRONTEND/Dockerfile` | A05 | Media | Trivy config/image | `node:22-alpine`, `USER node`, `npm ci` con lockfile, `HEALTHCHECK` |
| H-22 | El build del backend dependía de carpetas vacías (`uploads/`) que git no versiona, así que la imagen **no se podía construir desde el repositorio** | `BACKEND/Dockerfile:15` | — (reproducibilidad) | Media | Pipeline CI (primer run fallido) | Crear el directorio con `RUN mkdir -p` en lugar de `COPY` (se agregó `.gitkeep` para conservar la estructura original) |

## Propuestas para preservar la calidad y el cumplimiento

1. **Gates obligatorios en `main`**: activar *branch protection* exigiendo que CI y Security pasen antes de hacer merge.
2. **Regresión continua**: cada mitigación debe dejar en verde su prueba SEC-xx; no se permite un retroceso.
3. **Secretos fuera del código**: GitHub Secrets o Vault, rotación periódica y Gitleaks como *pre-commit hook*.
4. **Privacidad desde el diseño** (Ley 21.719): minimización de datos en las respuestas de la API, cifrado en reposo de datos clínicos, registro de accesos a la ficha (Ley 20.584).
5. **Revisión semanal** de reportes SCA/DAST y SLA de corrección: crítica 7 días, alta 30 días, media 90 días.
