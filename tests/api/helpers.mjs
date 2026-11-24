// Utilidades compartidas por las suites de pruebas automatizadas.
// Las pruebas se ejecutan como "caja negra" contra la API levantada con
// docker compose: NO modifican ni importan el código de la aplicación.
import crypto from "node:crypto";

export const API_URL = process.env.API_URL || "http://localhost:4444";

// Credenciales de prueba sembradas por BACKEND/sql/dump-cuidarteplus.sql
export const SEED = {
  admin: { nombre_usuario: "admin", password: "admin" },
  medico: { nombre_usuario: "medico", password: "medico" },
  paciente: { nombre_usuario: "paciente", password: "paciente" },
};

export async function request(method, path, { token, body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const started = performance.now();
  const res = await fetch(`${API_URL}${path}`, init);
  const elapsedMs = performance.now() - started;
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, headers: res.headers, data, text, elapsedMs };
}

const tokenCache = new Map();
export async function login(role) {
  if (tokenCache.has(role)) return tokenCache.get(role);
  const res = await request("POST", "/autenticacion/login", { body: SEED[role] });
  if (res.status !== 200 || !res.data.token) {
    throw new Error(`No se pudo iniciar sesión como ${role}: ${res.status} ${res.text}`);
  }
  tokenCache.set(role, res.data.token);
  return res.data.token;
}

// Firma un JWT HS256 sin dependencias externas (para probar secretos expuestos).
export function signJwt(payload, secret) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ iat: Math.floor(Date.now() / 1000), ...payload });
  const sig = crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

export function uniqueSuffix() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export async function waitForApi(timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API_URL}/`);
      if (res.ok) return;
    } catch {
      /* la API aún no responde */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`La API no respondió en ${API_URL} dentro de ${timeoutMs} ms`);
}
