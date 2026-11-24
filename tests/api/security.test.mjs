// Suite de PRUEBAS DE SEGURIDAD (caja negra) - API Cuidarte+
// Cada prueba afirma el comportamiento SEGURO esperado según OWASP Top 10 (2021)
// y OWASP ASVS. Una prueba que FALLA = vulnerabilidad confirmada en la app.
// El código fuente de la aplicación NO se modifica: el objetivo es detectar.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { request, login, signJwt, waitForApi, uniqueSuffix } from "./helpers.mjs";

// Secreto JWT publicado en .env y README.md del repositorio.
const LEAKED_JWT_SECRET = "0d1d8132f0fde5beabb417b434ff10f1cae8635a461686b0f46ac9c2bbfbd0e8";

before(async () => {
  await waitForApi();
});

async function crearUsuarioDesechable() {
  const s = uniqueSuffix();
  const res = await request("POST", "/autenticacion/registro", {
    body: { nombre_usuario: `tmp_${s}`, password: "Clave123!", correo: `tmp_${s}@test.cl` },
  });
  assert.equal(res.status, 201, `precondición: no se pudo crear usuario (${res.text})`);
  return res.data.usuario;
}

describe("A01 Broken Access Control", () => {
  test("SEC-01 DELETE /usuarios/:id sin token debe responder 401", async () => {
    const victima = await crearUsuarioDesechable();
    const res = await request("DELETE", `/usuarios/${victima.id}`);
    assert.equal(res.status, 401, `Se eliminó el usuario ${victima.id} sin autenticación (HTTP ${res.status})`);
  });

  test("SEC-02 GET /pacientes/buscar/rut/:rut sin token no debe exponer datos clínicos", async () => {
    const res = await request("GET", "/pacientes/buscar/rut/11111111-1");
    assert.equal(res.status, 401, `Ficha clínica expuesta sin autenticación: ${JSON.stringify(res.data).slice(0, 120)}...`);
  });

  test("SEC-03 POST /roles sin token debe responder 401", async () => {
    const res = await request("POST", "/roles", { body: { nombre: `rol_${uniqueSuffix()}` } });
    assert.ok([401, 403].includes(res.status), `Se aceptó creación de rol sin autenticación (HTTP ${res.status})`);
  });

  test("SEC-04 PUT /roles/:id sin token debe responder 401", async () => {
    // Se reescribe el rol existente 3 con su mismo nombre (no destructivo).
    const res = await request("PUT", "/roles/3", { body: { nombre: "paciente" } });
    assert.ok([401, 403].includes(res.status), `Endpoint de modificación de roles sin control de acceso (HTTP ${res.status})`);
  });

  test("SEC-05 GET /tipo-examen sin token debe responder 401", async () => {
    const res = await request("GET", "/tipo-examen");
    assert.equal(res.status, 401, `Catálogo accesible sin autenticación (HTTP ${res.status})`);
  });

  test("SEC-06 Un paciente no puede crear usuarios administradores (escalamiento de privilegios)", async () => {
    const s = uniqueSuffix();
    const res = await request("POST", "/usuarios", {
      token: await login("paciente"),
      body: { nombre_usuario: `evil_${s}`, contrasena_hash: "Clave123!", correo: `evil_${s}@test.cl`, rol_id: 1 },
    });
    assert.equal(res.status, 403, `Paciente creó un usuario con rol admin (HTTP ${res.status})`);
  });

  test("SEC-07 Un paciente no puede consultar el detalle de otros usuarios", async () => {
    const res = await request("GET", "/usuarios/1", { token: await login("paciente") });
    assert.equal(res.status, 403, `Paciente accedió a datos del usuario 1 (HTTP ${res.status})`);
  });
});

describe("A02 Cryptographic Failures / A07 Identification and Authentication Failures", () => {
  test("SEC-08 Un JWT firmado con el secreto publicado en el repositorio no debe ser aceptado", async () => {
    const forjado = signJwt({ usuarioId: 1, nombreUsuario: "admin", rolNombre: "admin" }, LEAKED_JWT_SECRET);
    const res = await request("GET", "/usuarios", { token: forjado });
    assert.notEqual(res.status, 200, "Token forjado con secreto expuesto permitió listar todos los usuarios como admin");
  });

  test("SEC-09 El login debe limitar intentos fallidos (anti fuerza bruta)", async () => {
    let bloqueado = false;
    for (let i = 0; i < 15; i++) {
      const res = await request("POST", "/autenticacion/login", {
        body: { nombre_usuario: "admin", password: `incorrecta${i}` },
      });
      if (res.status === 429 || res.status === 423) {
        bloqueado = true;
        break;
      }
    }
    assert.ok(bloqueado, "15 intentos fallidos consecutivos sin bloqueo ni rate limiting (HTTP 429)");
  });

  test("SEC-10 La política de contraseñas debe rechazar claves débiles (ASVS 2.1)", async () => {
    const s = uniqueSuffix();
    const res = await request("POST", "/autenticacion/registro", {
      body: { nombre_usuario: `weak_${s}`, password: "123456", correo: `weak_${s}@test.cl` },
    });
    assert.equal(res.status, 400, "Se aceptó la contraseña '123456'");
  });
});

describe("A05 Security Misconfiguration", () => {
  test("SEC-11 Las respuestas deben incluir cabeceras de seguridad HTTP", async () => {
    const res = await request("GET", "/");
    const faltantes = ["x-content-type-options", "x-frame-options", "strict-transport-security", "content-security-policy"]
      .filter((h) => !res.headers.get(h));
    assert.deepEqual(faltantes, [], `Faltan cabeceras: ${faltantes.join(", ")}`);
  });

  test("SEC-12 No debe revelarse la tecnología del servidor (X-Powered-By)", async () => {
    const res = await request("GET", "/");
    assert.equal(res.headers.get("x-powered-by"), null, `Cabecera expuesta: X-Powered-By: ${res.headers.get("x-powered-by")}`);
  });

  test("SEC-13 CORS no debe permitir cualquier origen", async () => {
    const res = await request("GET", "/", { headers: { Origin: "https://sitio-malicioso.example" } });
    assert.notEqual(res.headers.get("access-control-allow-origin"), "*", "CORS permite cualquier origen (*)");
  });

  test("SEC-14 Los errores no deben exponer detalles internos de la base de datos", async () => {
    const res = await request("GET", "/pacientes/abc", { token: await login("medico") });
    assert.doesNotMatch(res.text, /invalid input syntax|bigint|syntax error|pg_|stack/i, `Mensaje interno expuesto: ${res.text}`);
  });
});

describe("A09 Security Logging and Monitoring Failures", () => {
  test("SEC-15 Operaciones administrativas deben quedar auditadas sin error (POST /roles con admin)", async () => {
    const res = await request("POST", "/roles", {
      token: await login("admin"),
      body: { nombre: `rol_${uniqueSuffix()}` },
    });
    assert.equal(res.status, 201, `La operación falló al registrar auditoría (HTTP ${res.status}): ${res.text}`);
  });
});
