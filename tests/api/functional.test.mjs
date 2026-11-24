// Suite de PRUEBAS FUNCIONALES (caja negra) - API Cuidarte+
// Verifican los requerimientos funcionales básicos. Se espera que pasen;
// si alguna falla, el pipeline la reporta como defecto funcional.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { request, login, waitForApi, uniqueSuffix } from "./helpers.mjs";

before(async () => {
  await waitForApi();
});

describe("CP-F01 Disponibilidad del servicio", () => {
  test("GET / responde estado ok", async () => {
    const res = await request("GET", "/");
    assert.equal(res.status, 200);
    assert.equal(res.data.status, "ok");
  });

  test("La especificación OpenAPI está publicada", async () => {
    const res = await request("GET", "/openapi.json");
    assert.equal(res.status, 200);
    assert.ok(res.data.openapi || res.data.swagger, "debe ser un documento OpenAPI");
  });
});

describe("CP-F02 Autenticación", () => {
  for (const role of ["admin", "medico", "paciente"]) {
    test(`Login exitoso del usuario semilla '${role}' entrega un JWT`, async () => {
      const token = await login(role);
      assert.match(token, /^[\w-]+\.[\w-]+\.[\w-]+$/);
    });
  }

  test("Login con contraseña incorrecta responde 401", async () => {
    const res = await request("POST", "/autenticacion/login", {
      body: { nombre_usuario: "admin", password: "incorrecta" },
    });
    assert.equal(res.status, 401);
  });

  test("Login con usuario inexistente responde 401", async () => {
    const res = await request("POST", "/autenticacion/login", {
      body: { nombre_usuario: `noexiste_${uniqueSuffix()}`, password: "x" },
    });
    assert.equal(res.status, 401);
  });

  test("Login sin datos obligatorios responde 400 (validación)", async () => {
    const res = await request("POST", "/autenticacion/login", { body: {} });
    assert.equal(res.status, 400);
    assert.ok(Array.isArray(res.data.detalles));
  });
});

describe("CP-F03 Registro de pacientes (autoregistro)", () => {
  test("Registro válido crea el usuario (201)", async () => {
    const s = uniqueSuffix();
    const res = await request("POST", "/autenticacion/registro", {
      body: { nombre_usuario: `qa_${s}`, password: "Clave123!", correo: `qa_${s}@test.cl` },
    });
    assert.equal(res.status, 201);
    assert.equal(res.data.usuario.nombre_usuario, `qa_${s}`);
  });

  test("Registro con correo inválido responde 400", async () => {
    const res = await request("POST", "/autenticacion/registro", {
      body: { nombre_usuario: `qa_${uniqueSuffix()}`, password: "Clave123!", correo: "no-es-correo" },
    });
    assert.equal(res.status, 400);
  });

  test("Registro con contraseña corta responde 400", async () => {
    const s = uniqueSuffix();
    const res = await request("POST", "/autenticacion/registro", {
      body: { nombre_usuario: `qa_${s}`, password: "123", correo: `qa_${s}@test.cl` },
    });
    assert.equal(res.status, 400);
  });

  test("Registro con usuario duplicado responde 400", async () => {
    const res = await request("POST", "/autenticacion/registro", {
      body: { nombre_usuario: "admin", password: "Clave123!", correo: `dup_${uniqueSuffix()}@test.cl` },
    });
    assert.equal(res.status, 400);
  });
});

describe("CP-F04 Gestión de pacientes y control de acceso por rol", () => {
  test("Médico puede listar pacientes", async () => {
    const res = await request("GET", "/pacientes", { token: await login("medico") });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data) && res.data.length > 0);
  });

  test("Paciente NO puede listar todos los pacientes (403)", async () => {
    const res = await request("GET", "/pacientes", { token: await login("paciente") });
    assert.equal(res.status, 403);
  });

  test("Listar pacientes sin token responde 401", async () => {
    const res = await request("GET", "/pacientes");
    assert.equal(res.status, 401);
  });

  test("Paciente puede ver su propia ficha (id 1)", async () => {
    const res = await request("GET", "/pacientes/1", { token: await login("paciente") });
    assert.equal(res.status, 200);
    // La API serializa BIGINT como string ("1"), por eso se normaliza.
    assert.equal(Number(res.data.id), 1);
  });

  test("Paciente NO puede ver la ficha de otro paciente (id 2)", async () => {
    const res = await request("GET", "/pacientes/2", { token: await login("paciente") });
    assert.equal(res.status, 403);
  });

  test("Médico crea un paciente con datos válidos (201)", async () => {
    const n = Math.floor(10000000 + Math.random() * 8999999);
    const res = await request("POST", "/pacientes", {
      token: await login("medico"),
      body: {
        rut: `${n}-${Math.floor(Math.random() * 10)}`,
        primer_nombre: "Prueba",
        apellido_paterno: "Automatizada",
        fecha_nacimiento: "1990-01-01",
        sexo: "F",
        email: `pac_${uniqueSuffix()}@test.cl`,
      },
    });
    assert.equal(res.status, 201, res.text);
  });

  test("Crear paciente con RUT inválido responde 400", async () => {
    const res = await request("POST", "/pacientes", {
      token: await login("medico"),
      body: {
        rut: "ABC",
        primer_nombre: "Prueba",
        apellido_paterno: "Invalida",
        fecha_nacimiento: "1990-01-01",
        sexo: "F",
        email: `pac_${uniqueSuffix()}@test.cl`,
      },
    });
    assert.equal(res.status, 400);
  });
});

describe("CP-F05 Exámenes y auditoría", () => {
  test("Médico lista tipos de examen", async () => {
    const res = await request("GET", "/tipo-examen", { token: await login("medico") });
    assert.equal(res.status, 200);
    assert.ok(res.data.length > 0);
  });

  test("Paciente consulta sus propios exámenes", async () => {
    const res = await request("GET", "/examenes/paciente/1", { token: await login("paciente") });
    assert.equal(res.status, 200);
  });

  test("Paciente NO consulta exámenes de otro paciente (403)", async () => {
    const res = await request("GET", "/examenes/paciente/2", { token: await login("paciente") });
    assert.equal(res.status, 403);
  });

  test("Administrador consulta el registro de auditoría", async () => {
    const res = await request("GET", "/auditoria", { token: await login("admin") });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data));
  });

  test("Paciente NO consulta el registro de auditoría (403)", async () => {
    const res = await request("GET", "/auditoria", { token: await login("paciente") });
    assert.equal(res.status, 403);
  });
});
