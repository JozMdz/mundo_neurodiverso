-- Datos inventados para las pruebas de permisos (pruebas/permisos.py).
-- d1: Dirección que atiende · d2: Dirección de soporte (no atiende) · a1, a2: psicólogas
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000d2'),
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2');
insert into psicologas (id, nombre, es_direccion, atiende) values
  ('00000000-0000-0000-0000-0000000000d1', 'Mtra. Directora', true, true),
  ('00000000-0000-0000-0000-0000000000d2', 'Soporte', true, false),
  ('00000000-0000-0000-0000-0000000000a1', 'Psic. Fernanda', false, true),
  ('00000000-0000-0000-0000-0000000000a2', 'Psic. Andrea', false, true);
insert into pacientes (id, nombre, asignada_a) values
  ('00000000-0000-0000-0000-0000000000b1', 'Paciente de Fernanda', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b2', 'Paciente de Andrea', '00000000-0000-0000-0000-0000000000a2');
insert into notas (id, paciente_id, psicologa_id, texto, revisada) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'Nota sin revisar', false),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'Nota revisada con comentario', true),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', 'Nota de Dirección para Fernanda', true),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a2', 'Nota de Andrea', false);
insert into comentarios (nota_id, autor_id, texto) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d1', 'Comentario de Dirección');
insert into pagos (id, paciente_id, psicologa_id, monto, metodo, validado) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 600, 'efectivo', false),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 600, 'efectivo', true);
insert into facturas (id, paciente_id, monto, estado, solicitada_por, fecha_emitida) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 600, 'solicitada', '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', 600, 'emitida', '00000000-0000-0000-0000-0000000000a1', current_date);
-- Citas de ayer y antier: 71 programada · 72 no asistió por confirmar · 73 no asistió confirmada · 74 de Andrea
-- 75: de Fernanda en dos días (todavía no llega)
insert into citas (id, fecha, hora, psicologa_id, paciente_id, estado, confirmada_por) values
  ('00000000-0000-0000-0000-000000000071', current_date - 1, '15:00', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'programada', null),
  ('00000000-0000-0000-0000-000000000072', current_date - 1, '16:00', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'no_asistio', null),
  ('00000000-0000-0000-0000-000000000073', current_date - 2, '15:00', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'no_asistio', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-000000000074', current_date - 1, '15:00', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b2', 'programada', null),
  ('00000000-0000-0000-0000-000000000075', current_date + 2, '15:00', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'programada', null);
-- Un cierre de Fernanda con pendientes
insert into cierres (psicologa_id, notas_pendientes, cobros_pendientes, detalle) values
  ('00000000-0000-0000-0000-0000000000a1', 1, 1, '[{"nota": true, "cobro": true}]');
-- Lo que le toca a cada psicóloga por sesión: Fernanda $150 fijos, Andrea 50 %
insert into reparto_psicologas (psicologa_id, tipo, valor) values
  ('00000000-0000-0000-0000-0000000000a1', 'fijo', 150),
  ('00000000-0000-0000-0000-0000000000a2', 'porcentaje', 50);
-- Paciente de la directora (b3) y coberturas de Andrea: 76 cubre a b1 (de Fernanda), 77 cubre a b3 con acceso al historial
insert into pacientes (id, nombre, asignada_a) values
  ('00000000-0000-0000-0000-0000000000b3', 'Paciente de la directora', '00000000-0000-0000-0000-0000000000d1');
insert into notas (id, paciente_id, psicologa_id, texto, revisada) values
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000d1', 'Nota de la directora', true);
insert into citas (id, fecha, hora, psicologa_id, paciente_id, estado, confirmada_por) values
  ('00000000-0000-0000-0000-000000000076', current_date - 1, '17:00', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1', 'programada', null),
  ('00000000-0000-0000-0000-000000000077', current_date - 1, '18:00', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b3', 'programada', null);
insert into accesos_expediente (paciente_id, psicologa_id, otorgado_por) values
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000d1');
