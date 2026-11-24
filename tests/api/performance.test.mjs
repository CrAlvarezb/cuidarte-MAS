// Suite de PRUEBAS NO FUNCIONALES (rendimiento / tiempo de respuesta).
// Umbral de aceptación: p95 de respuesta < 2000 ms por endpoint
// (criterio de calidad ISO/IEC 25010 - Eficiencia de desempeño).
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { request, login, waitForApi } from "./helpers.mjs";

const UMBRAL_MS = Number(process.env.PERF_THRESHOLD_MS || 2000);
const MUESTRAS = Number(process.env.PERF_SAMPLES || 3);

before(async () => {
  await waitForApi();
});

async function medir(method, path, role) {
  const token = role ? await login(role) : undefined;
  const tiempos = [];
  for (let i = 0; i < MUESTRAS; i++) {
    const res = await request(method, path, { token });
    assert.ok(res.status < 500, `${path} respondió ${res.status}`);
    tiempos.push(res.elapsedMs);
  }
  tiempos.sort((a, b) => a - b);
  return tiempos[Math.ceil(0.95 * tiempos.length) - 1];
}

const casos = [
  ["GET", "/", null],
  ["GET", "/tipo-examen", "medico"],
  ["GET", "/pacientes", "medico"],
  ["GET", "/pacientes/1", "medico"],
  ["GET", "/examenes", "medico"],
  ["GET", "/auditoria", "admin"],
];

describe("NF-01 Tiempo de respuesta de la API", () => {
  for (const [method, path, role] of casos) {
    test(`${method} ${path} p95 < ${UMBRAL_MS} ms`, { timeout: 120000 }, async () => {
      const p95 = await medir(method, path, role);
      assert.ok(p95 < UMBRAL_MS, `p95 = ${Math.round(p95)} ms (umbral ${UMBRAL_MS} ms)`);
    });
  }
});
