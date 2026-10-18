# Función "equipo"

Deja que Dirección agregue psicólogas desde la app (pestaña Equipo), cambie su correo, les ponga una contraseña
temporal y las dé de baja o las reactive. Nombre, teléfono, cédula y color no pasan por aquí: la app los guarda
directo y la base solo se lo permite a Dirección.

Usa la llave de servicio, que Supabase pone sola en la función (`SUPABASE_SERVICE_ROLE_KEY`). No hay que crear
Secrets ni pegar llaves en ningún lado. La función revisa que quien la llama tenga sesión y sea de Dirección.

## Instalar (una vez)

1. Antes, corre `sql/equipo.sql` en Supabase → SQL Editor.
2. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
3. Nombre: `equipo` (exacto).
4. Borra el ejemplo, pega todo `supabase/functions/equipo/index.ts` y toca **Deploy**.
5. Deja activado "Verify JWT" (viene así).

Para probar: en la app, como Dirección, abre Equipo. Junto a cada quien debe salir su correo.

## Qué hace "dar de baja"

Bloquea su entrada (no puede iniciar sesión), la quita de las listas para agendar y le quita los avisos al teléfono.
No borra nada: sus pacientes, notas y cobros se quedan. "Reactivar" le devuelve la entrada.
Antes de darla de baja, reasigna sus pacientes activos (Expediente → Editar).
