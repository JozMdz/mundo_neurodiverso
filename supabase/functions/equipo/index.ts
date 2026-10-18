// Función "equipo": cuentas de las psicólogas, que solo Dirección puede manejar desde la app.
// Crear una cuenta, cambiar su correo o su contraseña y darla de baja necesitan la llave de servicio, que vive
// solo aquí (Supabase la pone sola en SUPABASE_SERVICE_ROLE_KEY) y nunca en la app.
// Nombre, teléfono, cédula y color los cambia la app directo en la tabla psicologas (RLS: solo Dirección).
//
// Acciones (POST con la sesión de quien la usa):
//   listar                                   → [{id, correo, baja}] de todo el equipo
//   crear   {nombre, correo, clave, telefono, cedula, color}
//   correo  {id, correo}
//   clave   {id, clave}                      → contraseña temporal; ella la cambia en Mi cuenta
//   baja    {id} / alta {id}                 → bloquea o devuelve el acceso (no borra nada)

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...cors, "Content-Type": "application/json" } });
const correoOk = (c: unknown) => typeof c === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.trim());
const claveOk = (c: unknown) => typeof c === "string" && c.length >= 8;
const texto = (t: unknown, max = 120) => typeof t === "string" && t.trim() ? t.trim().slice(0, max) : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Usa POST" }, 405);

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.117.3");
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // ¿Quién la llama? Solo una cuenta de Dirección activa
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(token);
  if (!u?.user) return json({ error: "Inicia sesión otra vez" }, 401);
  const { data: yo } = await admin.from("psicologas").select("es_direccion, activa").eq("id", u.user.id).maybeSingle();
  if (!yo?.es_direccion || yo.activa === false) return json({ error: "Solo Dirección puede hacer esto" }, 403);

  let b: any = {};
  try { b = await req.json(); } catch (_) { return json({ error: "Datos inválidos" }, 400); }
  const delEquipo = async (id: unknown) => typeof id === "string" &&
    !!(await admin.from("psicologas").select("id").eq("id", id).maybeSingle()).data;

  if (b.accion === "listar") {
    const { data: ps } = await admin.from("psicologas").select("id");
    const ids = new Set((ps || []).map((p: any) => p.id));
    const lista: any[] = [];
    for (let pagina = 1; pagina < 20; pagina++) {
      const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
      if (error) return json({ error: error.message }, 500);
      for (const x of data.users) if (ids.has(x.id))
        lista.push({ id: x.id, correo: x.email, baja: !!x.banned_until && new Date(x.banned_until) > new Date() });
      if (data.users.length < 200) break;
    }
    return json({ lista });
  }

  if (b.accion === "crear") {
    const nombre = texto(b.nombre);
    if (!nombre) return json({ error: "Escribe el nombre" }, 400);
    if (!correoOk(b.correo)) return json({ error: "Escribe un correo válido" }, 400);
    if (!claveOk(b.clave)) return json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);
    const color = typeof b.color === "string" && /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : "#8B3D9E";
    const { data: c, error } = await admin.auth.admin.createUser({ email: b.correo.trim().toLowerCase(), password: b.clave, email_confirm: true });
    if (error) return json({ error: /already|registered|exists/i.test(error.message) ? "Ya hay una cuenta con ese correo" : error.message }, 400);
    const { error: e2 } = await admin.from("psicologas").insert({ id: c.user.id, nombre, color, telefono: texto(b.telefono, 40),
      cedula: texto(b.cedula, 40), es_direccion: false, atiende: true, activa: true });
    if (e2) { await admin.auth.admin.deleteUser(c.user.id); return json({ error: "No se pudo crear el perfil: " + e2.message }, 500); }
    return json({ ok: true, id: c.user.id });
  }

  if (!(await delEquipo(b.id))) return json({ error: "No es una cuenta del equipo" }, 400);

  if (b.accion === "correo") {
    if (!correoOk(b.correo)) return json({ error: "Escribe un correo válido" }, 400);
    const { error } = await admin.auth.admin.updateUserById(b.id, { email: b.correo.trim().toLowerCase(), email_confirm: true });
    if (error) return json({ error: /already|registered|exists/i.test(error.message) ? "Ya hay una cuenta con ese correo" : error.message }, 400);
    return json({ ok: true });
  }
  if (b.accion === "clave") {
    if (!claveOk(b.clave)) return json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);
    const { error } = await admin.auth.admin.updateUserById(b.id, { password: b.clave });
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }
  if (b.accion === "baja" || b.accion === "alta") {
    const baja = b.accion === "baja";
    if (baja && b.id === u.user.id) return json({ error: "No puedes darte de baja a ti misma" }, 400);
    const { error } = await admin.auth.admin.updateUserById(b.id, { ban_duration: baja ? "876000h" : "none" });
    if (error) return json({ error: error.message }, 400);
    await admin.from("psicologas").update({ activa: !baja }).eq("id", b.id);
    if (baja) await admin.from("push_subs").delete().eq("psicologa_id", b.id);   // deja de recibir avisos
    return json({ ok: true });
  }
  return json({ error: "Acción desconocida" }, 400);
});
