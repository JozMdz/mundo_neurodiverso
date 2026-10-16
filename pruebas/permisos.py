"""Prueba los permisos de la base: lo que una psicóloga NO debe poder hacer y lo que todas SÍ deben poder.

Carga en un Postgres local de prueba: pruebas/base/supabase-minimo.sql, sql/esquema.sql y pruebas/base/datos.sql
(datos inventados). Después vuelve a correr sql/seguridad.sql y sql/ajustes.sql para comprobar que se pueden
repetir sin romper nada. Nunca toca Supabase.

Necesita un Postgres vacío y desechable. En el contenedor de Claude Code:
  install -d -o postgres -g postgres -m 700 /tmp/pg-consultorio
  su postgres -s /bin/sh -c "/usr/lib/postgresql/16/bin/initdb -D /tmp/pg-consultorio/data -A trust -U postgres >/dev/null &&
    /usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pg-consultorio/data -o '-p 55432 -k /tmp/pg-consultorio -c listen_addresses=' -l /tmp/pg-consultorio/log -w start"
  python3 pruebas/permisos.py
Para apagarlo: su postgres -s /bin/sh -c "/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pg-consultorio/data stop" y borra /tmp/pg-consultorio.
"""
import os, subprocess, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H, P, BD = os.environ.get("PGHOST", "/tmp/pg-consultorio"), os.environ.get("PGPORT", "55432"), "permisos_prueba"
ID = lambda x: "00000000-0000-0000-0000-0000000000" + x
D, J, F, A = ID("d1"), ID("d2"), ID("a1"), ID("a2")              # Dirección, soporte, Fernanda, Andrea
P1, N1, N2, N3, N4 = ID("b1"), ID("e1"), ID("e2"), ID("e3"), ID("e4")
G1, G2, F1, F2 = ID("f1"), ID("f2"), ID("c1"), ID("c2")
# Citas: 71 programada, 72 no asistió por confirmar, 73 confirmada, 74 de Andrea, 75 de Fernanda en dos días
C71, C72, C73, C74, C75 = (ID(x) for x in ("71", "72", "73", "74", "75"))

def psql(sql=None, archivo=None, bd=BD):
    cmd = ["psql", "-h", H, "-p", P, "-U", "postgres", "-d", bd, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"]
    cmd += ["-f", archivo] if archivo else ["-c", sql]
    r = subprocess.run(cmd, capture_output=True, text=True)
    salida = (r.stdout + r.stderr).strip()
    return ("ERROR: " + salida) if r.returncode else salida

def como(uid, sql):
    pre = f"set local request.jwt.claim.sub = '{uid}'; set local role authenticated;" if uid else ""
    r = psql(f"begin; {pre} {sql}; rollback;")
    return "rechazado" if r.startswith("ERROR") or r == "" else r

# (qué, quién, sql, resultado esperado); "rechazado" = error o sin filas
ATAQUES = [
    ("Psicóloga se vuelve Dirección", F, f"update psicologas set es_direccion=true where id='{F}' returning es_direccion", "rechazado"),
    ("Psicóloga marca su nota como revisada", F, f"update notas set revisada=true where id='{N1}' returning revisada", "rechazado"),
    ("Psicóloga cambia la autora de su nota", F, f"update notas set psicologa_id='{A}' where id='{N1}' returning psicologa_id", "rechazado"),
    ("Psicóloga cambia la fecha de su nota", F, f"update notas set fecha='2020-01-01' where id='{N1}' returning fecha", "rechazado"),
    ("Psicóloga edita la nota que escribió Dirección", F, f"update notas set texto='cambiada' where id='{N3}' returning texto", "rechazado"),
    ("Psicóloga borra su nota con comentario de Dirección", F, f"delete from notas where id='{N2}' returning 'borrada'", "rechazado"),
    ("Psicóloga registra un cobro ya validado", F, f"insert into pagos(paciente_id,psicologa_id,monto,metodo,validado) values('{P1}','{F}',600,'efectivo',true) returning validado", "f"),
    ("Psicóloga valida su propio cobro", F, f"update pagos set validado=true where id='{G1}' returning validado", "rechazado"),
    ("Psicóloga cambia el monto de un cobro validado", F, f"update pagos set monto=100 where id='{G2}' returning monto", "rechazado"),
    ("Psicóloga borra un cobro validado", F, f"delete from pagos where id='{G2}' returning 'borrado'", "rechazado"),
    ("Psicóloga cambia la fecha de un cobro", F, f"update pagos set fecha='2020-01-01' where id='{G1}' returning fecha", "rechazado"),
    ("Psicóloga marca su factura como entregada", F, f"update facturas set estado='entregada' where id='{F1}' returning estado", "rechazado"),
    ("Psicóloga registra una factura ya entregada", F, f"insert into facturas(paciente_id,monto,estado,solicitada_por) values('{P1}',600,'entregada','{F}') returning estado", "solicitada"),
    ("Psicóloga cambia el monto de una factura emitida", F, f"update facturas set monto=1 where id='{F2}' returning monto", "rechazado"),
    ("Psicóloga borra una factura emitida", F, f"delete from facturas where id='{F2}' returning 'borrada'", "rechazado"),
    ("Psicóloga agenda una cita", F, f"insert into citas(fecha,hora,psicologa_id,paciente_id) values(current_date,'15:00','{F}','{P1}') returning 'agendada'", "rechazado"),
    ("Psicóloga ve notas de otra psicóloga", F, f"select count(*) from notas where id='{N4}'", "0"),
    ("Psicóloga ve cobros de otra psicóloga", A, "select count(*) from pagos", "0"),
    ("Sin sesión no se ve nada", None, "set local role anon; select count(*) from pacientes", "rechazado"),
    ("Psicóloga marca 'no asistió' en la cita de otra", F, f"update citas set estado='no_asistio' where id='{C74}' returning estado", "rechazado"),
    ("Psicóloga cancela su cita", F, f"update citas set estado='cancelada' where id='{C71}' returning estado", "rechazado"),
    ("Psicóloga cambia de día su cita", F, f"update citas set fecha=current_date+1 where id='{C71}' returning fecha", "rechazado"),
    ("Psicóloga se pasa la cita a otra psicóloga", F, f"update citas set psicologa_id='{A}' where id='{C71}' returning 1", "rechazado"),
    ("Psicóloga confirma su propia inasistencia", F, f"update citas set confirmada_por='{F}' where id='{C72}' returning confirmada_por", "rechazado"),
    ("Psicóloga marca y se confirma sola (queda por confirmar)", F, f"update citas set estado='no_asistio', confirmada_por='{F}' where id='{C71}' returning coalesce(confirmada_por::text,'por confirmar')", "por confirmar"),
    ("Psicóloga cambia una inasistencia ya confirmada", F, f"update citas set estado='programada' where id='{C73}' returning estado", "rechazado"),
    ("Psicóloga marca revisado su propio cierre", F, f"insert into cierres(psicologa_id,revisado_por) values('{F}','{F}'); reset role; select count(*)::text from cierres where revisado_por is not null", "0"),
    ("Psicóloga borra el detalle de un cierre", F, f"update cierres set detalle='[]' returning 1", "rechazado"),
    ("Dirección cambia lo que dejó pendiente la psicóloga", D, f"update cierres set notas_pendientes=0 returning 1", "rechazado"),
    ("Psicóloga marca 'no asistió' en una cita que aún no llega", F, f"update citas set estado='no_asistio' where id='{C75}' returning estado", "rechazado"),
    ("Psicóloga liga un cobro a la cita de otra", F, f"insert into pagos(paciente_id,psicologa_id,monto,metodo,cita_id) values('{P1}','{F}',600,'efectivo','{C74}'); select 'registrado'", "rechazado"),
    ("Psicóloga registra dos cobros para la misma cita", F, f"insert into pagos(paciente_id,psicologa_id,monto,metodo,cita_id) values('{P1}','{F}',600,'efectivo','{C71}'),('{P1}','{F}',600,'efectivo','{C71}'); select 'registrado'", "rechazado"),
    ("Psicóloga cambia a qué cita va su cobro", F, f"update pagos set cita_id='{C71}' where id='{G1}' returning 1", "rechazado"),
    ("Psicóloga ve los teléfonos registrados", F, "select count(*) from push_subs", "rechazado"),
    ("Psicóloga ve qué avisos se mandaron", F, "select count(*) from avisos_enviados", "rechazado"),
    ("Psicóloga registra un servicio de avisos desconocido", F, "select guardar_suscripcion('https://ejemplo.com/x','k','a'); select 'registrado'", "rechazado"),
    ("Sin sesión registra un teléfono", None, "set local role anon; select guardar_suscripcion('https://fcm.googleapis.com/fcm/send/anon','k','a'); select 'registrado'", "rechazado"),
    ("Psicóloga quita el teléfono de otra", F, f"reset role; insert into push_subs values('https://fcm.googleapis.com/fcm/send/andrea','{A}','k','a'); set local role authenticated; select borrar_suscripcion('https://fcm.googleapis.com/fcm/send/andrea'); reset role; select count(*)::text from push_subs where endpoint='https://fcm.googleapis.com/fcm/send/andrea'", "1"),
]
NORMAL = [
    ("Psicóloga activa avisos en su teléfono", F, f"select guardar_suscripcion('https://fcm.googleapis.com/fcm/send/fer','k','a'); reset role; select (psicologa_id='{F}')::text from push_subs where endpoint='https://fcm.googleapis.com/fcm/send/fer'", "true"),
    ("El teléfono pasa a la cuenta que entra", F, f"reset role; insert into push_subs values('https://fcm.googleapis.com/fcm/send/cel','{A}','k','a'); set local role authenticated; select guardar_suscripcion('https://fcm.googleapis.com/fcm/send/cel','k2','a2'); reset role; select (psicologa_id='{F}' and p256dh='k2')::text from push_subs where endpoint='https://fcm.googleapis.com/fcm/send/cel'", "true"),
    ("Psicóloga quita su teléfono al salir", F, f"reset role; insert into push_subs values('https://fcm.googleapis.com/fcm/send/mio','{F}','k','a'); set local role authenticated; select borrar_suscripcion('https://fcm.googleapis.com/fcm/send/mio'); reset role; select count(*)::text from push_subs where endpoint='https://fcm.googleapis.com/fcm/send/mio'", "0"),
    ("Psicóloga escribe una nota", F, f"insert into notas(paciente_id,psicologa_id,texto,revisada) values('{P1}','{F}','nueva',false) returning revisada", "f"),
    ("Psicóloga edita su nota", F, f"update notas set texto='corregida' where id='{N1}' returning texto", "corregida"),
    ("Si edita una nota revisada, vuelve a 'por revisar'", F, f"update notas set texto='corregida' where id='{N2}' returning revisada", "f"),
    ("Psicóloga marca leído el mensaje de Dirección", F, f"update notas set vista_psic=true where id='{N3}' returning vista_psic", "t"),
    ("Psicóloga borra su nota sin comentarios ajenos", F, f"delete from notas where id='{N1}' returning 'borrada'", "borrada"),
    ("Psicóloga comenta su nota revisada (vuelve a por revisar)", F, f"insert into comentarios(nota_id,autor_id,texto) values('{N2}','{F}','duda'); select revisada from notas where id='{N2}'", "f"),
    ("Dirección comenta (la psicóloga ve mensaje nuevo)", D, f"insert into comentarios(nota_id,autor_id,texto) values('{N1}','{D}','ok'); select vista_psic from notas where id='{N1}'", "f"),
    ("Dirección escribe una nota (mensaje nuevo para la psicóloga)", D, f"insert into notas(paciente_id,psicologa_id,texto) values('{P1}','{D}','indicaciones') returning vista_psic", "f"),
    ("Psicóloga registra un cobro", F, f"insert into pagos(paciente_id,psicologa_id,monto,metodo,validado) values('{P1}','{F}',600,'efectivo',false) returning validado", "f"),
    ("Psicóloga corrige un cobro sin validar", F, f"update pagos set monto=650, metodo='transferencia', psicologa_id='{F}' where id='{G1}' returning monto", "650"),
    ("Psicóloga borra un cobro sin validar", F, f"delete from pagos where id='{G1}' returning 'borrado'", "borrado"),
    ("Psicóloga pide una factura", F, f"insert into facturas(paciente_id,monto,estado,solicitada_por) values('{P1}',600,'solicitada','{F}') returning estado", "solicitada"),
    ("Psicóloga corrige su factura solicitada", F, f"update facturas set monto=700, paciente_id='{P1}' where id='{F1}' returning monto", "700"),
    ("Psicóloga borra su factura solicitada", F, f"delete from facturas where id='{F1}' returning 'borrada'", "borrada"),
    ("Dirección marca revisado un cierre", D, f"update cierres set revisado_por='{D}' where psicologa_id='{F}' returning (revisado_por='{D}' and revisado_en is not null)::text", "true"),
    ("Psicóloga registra su cierre", F, f"insert into cierres(psicologa_id,notas_pendientes,cobros_pendientes) values('{F}',1,0); select 'registrado'", "registrado"),
    ("Dirección agenda una cita", D, f"insert into citas(fecha,hora,psicologa_id,paciente_id) values(current_date,'15:00','{F}','{P1}') returning 'agendada'", "agendada"),
    ("Dirección valida un cobro", D, f"update pagos set validado=true where id='{G1}' returning validado", "t"),
    ("Soporte (Dirección que no atiende) valida un cobro", J, f"update pagos set validado=true where id='{G1}' returning validado", "t"),
    ("Dirección corrige un cobro validado", D, f"update pagos set monto=500 where id='{G2}' returning monto", "500"),
    ("Dirección emite una factura", D, f"update facturas set estado='emitida', fecha_emitida=current_date where id='{F1}' returning estado", "emitida"),
    ("Dirección marca una nota como revisada", D, f"update notas set revisada=true where id='{N1}' returning revisada", "t"),
    ("Dirección cambia si alguien atiende", D, f"update psicologas set atiende=false where id='{A}' returning atiende", "f"),
    ("SQL Editor de Supabase corrige un cobro validado", "", f"update pagos set monto=1 where id='{G2}' returning monto", "1"),
    ("Psicóloga marca 'no asistió' (queda por confirmar)", F, f"update citas set estado='no_asistio' where id='{C71}' returning coalesce(confirmada_por::text,'por confirmar') || ' ' || (marcada_por='{F}')::text", "por confirmar true"),
    ("Psicóloga corrige: sí asistió", F, f"update citas set estado='programada' where id='{C72}' returning estado", "programada"),
    ("Dirección confirma la inasistencia", D, f"update citas set confirmada_por='{D}' where id='{C72}' returning (confirmada_por='{D}')::text", "true"),
    ("Soporte confirma la inasistencia", J, f"update citas set confirmada_por='{J}' where id='{C72}' returning (confirmada_por='{J}')::text", "true"),
    ("Dirección marca 'no asistió' (también queda por confirmar)", D, f"update citas set estado='no_asistio' where id='{C74}' returning coalesce(confirmada_por::text,'por confirmar')", "por confirmar"),
    ("Psicóloga registra el cobro de su cita (queda por validar)", F, f"insert into pagos(paciente_id,psicologa_id,monto,metodo,validado,cita_id) values('{P1}','{F}',600,'efectivo',true,'{C71}') returning validado::text", "false"),
    ("Dirección registra el cobro de su sesión por validar", D, f"insert into pagos(paciente_id,psicologa_id,monto,metodo,validado,cita_id) values('{P1}','{D}',600,'transferencia',false,'{C71}') returning validado::text", "false"),
    ("Dirección cancela una cita", D, f"update citas set estado='cancelada' where id='{C71}' returning estado", "cancelada"),
    ("Dirección cambia de día una cita", D, f"update citas set fecha=current_date+3 where id='{C71}' returning (fecha=current_date+3)::text", "true"),
    ("Dirección regresa una inasistencia confirmada", D, f"update citas set estado='programada' where id='{C73}' returning coalesce(confirmada_por::text,'sin confirmar')", "sin confirmar"),
]

def correr(titulo):
    print("\n" + titulo)
    fallas = 0
    for grupo, casos in (("  Lo que una psicóloga NO debe poder", ATAQUES), ("  Lo que debe seguir funcionando", NORMAL)):
        print(grupo)
        for nombre, quien, sql, esperado in casos:
            r = psql(f"begin; {sql}; rollback;") if quien is None else como(quien, sql)
            if quien is None: r = "rechazado" if r.startswith("ERROR") else r
            ok = r == esperado
            fallas += not ok
            print(f"    {'✓' if ok else '✗'} {nombre}" + ("" if ok else f"  (dio: {r[:90]})"))
    return fallas

psql(f"drop database if exists {BD}", bd="postgres")
r = psql(f"create database {BD}", bd="postgres")
if r.startswith("ERROR"): sys.exit("No hay Postgres de prueba. Mira las instrucciones al inicio de este archivo.\n" + r)
for archivo in ("pruebas/base/supabase-minimo.sql", "sql/esquema.sql", "pruebas/base/datos.sql"):
    r = psql(archivo=os.path.join(RAIZ, archivo))
    if r.startswith("ERROR"): sys.exit(f"{archivo} no cargó:\n{r}")
fallas = correr("Con sql/esquema.sql")
for archivo in ("sql/seguridad.sql", "sql/ajustes.sql", "sql/citas-estado.sql", "sql/pago-psicologa.sql", "sql/cierres-detalle.sql", "sql/avisos.sql", "sql/cobro-cita.sql"):
    r = psql(archivo=os.path.join(RAIZ, archivo))
    if r.startswith("ERROR"): print(f"\n✗ {archivo} no se puede volver a correr:\n{r}"); fallas += 1
fallas += correr("Después de volver a correr los archivos de sql/")
psql(f"drop database if exists {BD}", bd="postgres")
print(f"\n{fallas} FALLAS" if fallas else "\nTodo bien")
sys.exit(1 if fallas else 0)
