// Mundo Neurodiverso — función "avisar" (Supabase Edge Function).
//
// La llama el programador de Supabase cada 5 minutos (sql/avisos-programar.sql). Revisa la agenda y manda
// avisos a los teléfonos que los activaron (tabla push_subs). Con GET devuelve la llave pública para que la
// app pueda suscribirse. Cada aviso se manda una sola vez (tabla avisos_enviados).
//
// Secrets que necesita (Supabase → Edge Functions → Secrets): VAPID_PUBLIC, VAPID_PRIVATE y VAPID_EMAIL.
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen puestos. La llave privada y la service_role nunca
// salen de Supabase.
//
// El contenido de cada aviso va cifrado (RFC 8291, aes128gcm): solo el teléfono destino lo puede leer.
// En la pantalla bloqueada solo aparecen iniciales del paciente.

const TZ_OFFSET = -6;                       // México, sin horario de verano
const ANTES = 30;                           // minutos antes de la cita para avisar
// Igual que HORARIO en index.html (0 = domingo)
const HORARIO: Record<number, [number, number]> = { 1: [14, 21], 2: [14, 21], 3: [14, 21], 4: [14, 21], 5: [14, 21], 6: [8, 18] };

/* ================= Reglas: qué aviso toca y a quién ================= */

type Psic = { id: string; nombre: string; es_direccion: boolean };
type Cita = { id: string; fecha: string; hora: string; duracion: number; psicologa_id: string; paciente_id: string; estado: string; confirmada_por: string | null };
type Reg = { paciente_id: string; psicologa_id: string; creado_en: string; validado?: boolean };
type Cierre = { id: string; psicologa_id: string; creado_en: string; notas_pendientes: number; cobros_pendientes: number };
export type Datos = { ahora: Date; psicologas: Psic[]; pacientes: { id: string; nombre: string }[]; citas: Cita[];
  notas: Reg[]; pagos: Reg[]; cierres: Cierre[]; enviados: Set<string> };
export type Aviso = { para: string[]; clave: string; title: string; body: string };

const local = (d: Date) => new Date(d.getTime() + TZ_OFFSET * 3600_000);
export const fechaLocal = (d: Date) => local(d).toISOString().slice(0, 10);
const minutos = (h: string) => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };
const hhmm = (m: number) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const iniciales = (n: string) => n.trim().split(/\s+/).slice(0, 2).map(p => p[0].toUpperCase() + ".").join(" ");
const corto = (n: string) => n.replace(/^(Psic\.|Mtra\.|Mtro\.|Dra\.|Dr\.|Lic\.)\s*/i, "").split(/\s+/)[0];
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

export function avisosPendientes(d: Datos): Aviso[] {
  const hoy = fechaLocal(d.ahora), l = local(d.ahora), ahora = l.getUTCHours() * 60 + l.getUTCMinutes();
  const h = HORARIO[l.getUTCDay()];
  // Solo desde el primer aviso antes de abrir hasta una hora después de cerrar
  if (!h || ahora < h[0] * 60 - ANTES || ahora > h[1] * 60 + 60) return [];
  const pac = (id: string) => iniciales((d.pacientes.find(p => p.id === id) || { nombre: "?" }).nombre);
  const psic = (id: string) => d.psicologas.find(p => p.id === id);
  const direccion = d.psicologas.filter(p => p.es_direccion).map(p => p.id);
  const deHoy = (r: Reg) => fechaLocal(new Date(r.creado_en)) === hoy;
  const tiene = (lista: Reg[], c: Cita) => lista.some(r => r.paciente_id === c.paciente_id && r.psicologa_id === c.psicologa_id && deHoy(r));
  const avisos: Aviso[] = [];
  const citasHoy = d.citas.filter(c => c.fecha === hoy && c.estado === "programada").sort((a, b) => a.hora.localeCompare(b.hora));

  for (const c of citasHoy) {
    const ini = minutos(c.hora), fin = ini + (c.duracion || 60), falta = ini - ahora;
    // Dirección recibe también los avisos de las demás, con el nombre de quien atiende (para saber quién ocupa los consultorios)
    const p = psic(c.psicologa_id), quien = p ? corto(p.nombre) + " · " : "", otros = direccion.filter(id => id !== c.psicologa_id);
    // A quien atiende (y a Dirección): media hora antes de la cita
    if (falta > 0 && falta <= ANTES) {
      avisos.push({ para: [c.psicologa_id], clave: "antes:" + c.id, title: `Cita a las ${hhmm(ini)}`, body: `${pac(c.paciente_id)} · en ${falta} min` });
      avisos.push({ para: otros, clave: "antes-dir:" + c.id, title: `Cita a las ${hhmm(ini)}`, body: `${quien}${pac(c.paciente_id)} · en ${falta} min` });
    }
    // 10 minutos después de terminar, si falta la nota o el cobro (hasta 3 h después)
    if (ahora >= fin + 10 && ahora <= fin + 180) {
      const n = !tiene(d.notas, c), g = !tiene(d.pagos, c), que = [n ? "nota" : "", g ? "cobro" : ""].filter(Boolean).join(" y ");
      if (n || g) {
        avisos.push({ para: [c.psicologa_id], clave: "falta:" + c.id, title: "Falta registrar", body: `${hhmm(ini)} ${pac(c.paciente_id)}: ${que}` });
        avisos.push({ para: otros, clave: "falta-dir:" + c.id, title: "Falta registrar", body: `${quien}${hhmm(ini)} ${pac(c.paciente_id)}: ${que}` });
      }
    }
  }
  // A Dirección: inasistencias marcadas que esperan confirmación (de la última semana)
  const semana = fechaLocal(new Date(d.ahora.getTime() - 7 * 86400_000));
  for (const c of d.citas.filter(c => c.estado === "no_asistio" && !c.confirmada_por && c.fecha >= semana)) {
    const p = psic(c.psicologa_id);
    avisos.push({ para: direccion, clave: "noasis:" + c.id, title: "No asistió · por confirmar",
      body: `${p ? corto(p.nombre) : "—"}: ${c.fecha === hoy ? "" : c.fecha.slice(8) + "/" + c.fecha.slice(5, 7) + " "}${c.hora.slice(0, 5)} ${pac(c.paciente_id)}` });
  }
  // A Dirección: alguien salió con pendientes (de los últimos 2 días)
  for (const x of d.cierres.filter(x => d.ahora.getTime() - new Date(x.creado_en).getTime() < 2 * 86400_000)) {
    const p = psic(x.psicologa_id);
    avisos.push({ para: direccion, clave: "cierre:" + x.id, title: "Salió con pendientes",
      body: `${p ? corto(p.nombre) : "—"}: ${plural(x.notas_pendientes, "nota", "notas")} y ${plural(x.cobros_pendientes, "cobro", "cobros")} sin registrar` });
  }
  // A Dirección: resumen 15 minutos después de cerrar
  if (ahora >= h[1] * 60 + 15) {
    const dadas = citasHoy.filter(c => minutos(c.hora) + (c.duracion || 60) <= ahora);
    const sinNota = dadas.filter(c => !tiene(d.notas, c)).length, sinCobro = dadas.filter(c => !tiene(d.pagos, c)).length;
    const porConf = d.citas.filter(c => c.estado === "no_asistio" && !c.confirmada_por).length + d.pagos.filter(g => g.validado === false).length;
    const partes = [sinNota ? plural(sinNota, "sin nota", "sin nota") : "", sinCobro ? plural(sinCobro, "sin cobro", "sin cobro") : "",
      porConf ? plural(porConf, "por validar", "por validar") : ""].filter(Boolean);
    avisos.push({ para: direccion, clave: "resumen:" + hoy, title: `Hoy: ${plural(dadas.length, "sesión", "sesiones")}`,
      body: partes.length ? partes.join(" · ") : "Todo registrado ✓" });
  }
  return avisos.filter(a => a.para.length && !d.enviados.has(a.clave));
}

/* ================= Web Push: firma VAPID y cifrado aes128gcm ================= */

const enc = (s: string) => new TextEncoder().encode(s);
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uDec = (s: string) => { const r = s.replace(/-/g, "+").replace(/_/g, "/"); const bin = atob(r + "=".repeat((4 - r.length % 4) % 4));
  return Uint8Array.from(bin, ch => ch.charCodeAt(0)); };
const unir = (...a: Uint8Array[]) => { const r = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { r.set(x, i); i += x.length; } return r; };

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, largo: number) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, largo * 8));
}

// RFC 8291: cifra el aviso para un teléfono con su llave (p256dh) y su secreto (auth)
export async function cifrar(texto: string, p256dh: string, auth: string, prueba?: { sal: Uint8Array; llaves: CryptoKeyPair }) {
  const tel = b64uDec(p256dh), secreto = b64uDec(auth);
  const yo = prueba ? prueba.llaves : await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const yoPub = new Uint8Array(await crypto.subtle.exportKey("raw", yo.publicKey));
  const telKey = await crypto.subtle.importKey("raw", tel, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const compartido = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: telKey }, yo.privateKey, 256));
  const ikm = await hkdf(secreto, compartido, unir(enc("WebPush: info\0"), tel, yoPub), 32);
  const sal = prueba ? prueba.sal : crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, enc("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sal, ikm, enc("Content-Encoding: nonce\0"), 12);
  const llave = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, llave, unir(enc(texto), new Uint8Array([2]))));
  return unir(sal, new Uint8Array([0, 0, 16, 0]), new Uint8Array([yoPub.length]), yoPub, cifrado);
}

// Firma VAPID (JWT ES256) para el servicio de avisos del teléfono
export async function firmaVapid(destino: string, publica: string, privada: string, correo: string) {
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const msg = b64u(enc(JSON.stringify({ typ: "JWT", alg: "ES256" }))) + "." + b64u(enc(JSON.stringify({ aud: destino, exp, sub: "mailto:" + correo })));
  const pub = b64uDec(publica);
  const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), d: privada, ext: true },
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const firma = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc(msg)));
  return `vapid t=${msg}.${b64u(firma)}, k=${publica}`;
}

export async function enviarPush(s: { endpoint: string; p256dh: string; auth: string }, texto: string, v: { publica: string; privada: string; correo: string }) {
  const url = new URL(s.endpoint);
  const cuerpo = await cifrar(texto, s.p256dh, s.auth);
  const r = await fetch(s.endpoint, { method: "POST", body: cuerpo, headers: {
    "Authorization": await firmaVapid(`${url.protocol}//${url.host}`, v.publica, v.privada, v.correo),
    "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", "TTL": "3600", "Urgency": "high" } });
  return r.status;
}

/* ================= Servidor ================= */

declare const Deno: any;
if (typeof Deno !== "undefined") Deno.serve(async (req: Request) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };
  const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { ...cors, "Content-Type": "application/json" } });
  const v = { publica: Deno.env.get("VAPID_PUBLIC"), privada: Deno.env.get("VAPID_PRIVATE"), correo: Deno.env.get("VAPID_EMAIL") };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method === "GET") return json({ publica: v.publica || null });     // la app la usa para suscribirse
  if (!v.publica || !v.privada || !v.correo) return json({ error: "Faltan los Secrets VAPID_PUBLIC, VAPID_PRIVATE o VAPID_EMAIL" });

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.117.3");
  const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const ahora = new Date(), hoy = fechaLocal(ahora);
  const hace = (dias: number) => new Date(ahora.getTime() - dias * 86400_000).toISOString();
  const semana = fechaLocal(new Date(ahora.getTime() - 8 * 86400_000));
  const [ps, pa, ci, no, pg, cr, en, su] = await Promise.all([
    sb.from("psicologas").select("id,nombre,es_direccion"),
    sb.from("pacientes").select("id,nombre"),
    sb.from("citas").select("id,fecha,hora,duracion,psicologa_id,paciente_id,estado,confirmada_por").gte("fecha", semana).lte("fecha", hoy),
    sb.from("notas").select("paciente_id,psicologa_id,creado_en").gte("creado_en", hace(1)),
    sb.from("pagos").select("paciente_id,psicologa_id,creado_en,validado").gte("creado_en", hace(1)),
    sb.from("cierres").select("id,psicologa_id,creado_en,notas_pendientes,cobros_pendientes").is("revisado_por", null).gte("creado_en", hace(2)),
    sb.from("avisos_enviados").select("clave").gte("enviado_en", hace(10)),
    sb.from("push_subs").select("endpoint,psicologa_id,p256dh,auth"),
  ]);
  const avisos = avisosPendientes({ ahora, psicologas: ps.data || [], pacientes: pa.data || [], citas: ci.data || [],
    notas: no.data || [], pagos: pg.data || [], cierres: cr.data || [], enviados: new Set((en.data || []).map((x: any) => x.clave)) });

  let enviados = 0; const muertas: string[] = [];
  for (const a of avisos) {
    // Se anota primero: si dos corridas se cruzan, solo una manda el aviso
    const { error } = await sb.from("avisos_enviados").insert({ clave: a.clave });
    if (error) continue;
    const texto = JSON.stringify({ title: a.title, body: a.body, tag: a.clave });
    for (const s of (su.data || []).filter((s: any) => a.para.includes(s.psicologa_id))) {
      try {
        const st = await enviarPush(s, texto, v);
        if (st >= 200 && st < 300) enviados++;
        else if (st === 404 || st === 410) muertas.push(s.endpoint);
        else console.error("aviso no aceptado:", st, a.clave);
      } catch (e) { console.error("error al avisar:", String(e)); }
    }
  }
  if (muertas.length) await sb.from("push_subs").delete().in("endpoint", muertas);
  await sb.from("avisos_enviados").delete().lt("enviado_en", hace(30));
  // Para revisar desde net._http_response: cuántos renglones leyó y qué consulta falló (sin datos de pacientes)
  const tablas: Record<string, any> = { psicologas: ps, pacientes: pa, citas: ci, notas: no, pagos: pg, cierres: cr, enviados: en, telefonos: su };
  const leidos: Record<string, number> = {}, errores: string[] = [];
  for (const [k, r] of Object.entries(tablas)) { leidos[k] = (r.data || []).length; if (r.error) errores.push(k + ": " + r.error.message); }
  const l = new Date(ahora.getTime() + TZ_OFFSET * 3600_000);
  return json({ avisos: avisos.length, enviados, hora: l.toISOString().slice(0, 16).replace("T", " "), citasHoy: (ci.data || []).filter((c: any) => c.fecha === hoy).length,
    leidos, ...(errores.length ? { errores } : {}) });
});
