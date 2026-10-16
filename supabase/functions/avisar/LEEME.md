# Avisos al teléfono — cómo instalarlos

Unos 15 minutos, una sola vez. Todo en https://supabase.com, en el proyecto del consultorio.

1. **Tablas.** SQL Editor → New query → pega todo `sql/avisos.sql` → Run. Luego, igual, `sql/avisos-permisos.sql`
   (permiso de la cuenta del servidor para leer la agenda).
2. **Llaves.** Abre https://jozmdz.github.io/mundo_neurodiverso/herramientas/llaves-avisos.html.
   La página genera dos llaves en tu navegador.
3. **Secrets.** Edge Functions → Secrets → agrega tres:
   - `VAPID_PUBLIC`: la pública de la página.
   - `VAPID_PRIVATE`: la privada de la página. Solo va aquí: no la mandes por chat ni la guardes en el repositorio.
   - `VAPID_EMAIL`: un correo de contacto, sin "mailto:".
4. **Función.** Edge Functions → Deploy a new function → Via Editor. Nombre: `avisar`. Borra lo que trae, pega
   todo `supabase/functions/avisar/index.ts` y dale Deploy.
5. **Programarla.** SQL Editor → pega todo `sql/avisos-programar.sql` → Run. Desde ahí corre cada 5 minutos.
6. **Activar en cada teléfono.** Abre la app (en iPhone, instalada desde la pantalla de inicio), entra con tu
   cuenta y toca 🔕 arriba. Acepta el permiso: debe llegar "Avisos activos ✓" y la campana queda 🔔.

## Qué avisa

- **Quien atiende** (psicólogas y la directora): 30 min antes de cada cita suya, y 10 min después de terminar si
  le falta la nota o el cobro.
- **Dirección:** cuando marcan "No asistió", cuando alguien sale con pendientes, y un resumen 15 min después
  de cerrar (21:15 entre semana, 18:15 el sábado).
- Solo de media hora antes de abrir a una hora después de cerrar. Con iniciales del paciente, no el nombre.

## Si algo no llega

- `select created, status_code, content from net._http_response order by created desc limit 5;` muestra cada
  corrida: cuántos avisos tocaban, cuántos se mandaron, cuántas citas de hoy leyó y si alguna consulta falló.
  "permission denied" → corre `sql/avisos-permisos.sql`.

- Edge Functions → avisar → Logs: cada corrida dice cuántos avisos tocaban y cuántos se mandaron.
- Un teléfono es de la última cuenta que entró en él. Al salir de la app, ese teléfono deja de recibir avisos.
- Para apagarlos: `select cron.unschedule('avisar');` en el SQL Editor.
