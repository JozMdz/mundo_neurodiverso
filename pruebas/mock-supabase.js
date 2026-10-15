/* Supabase falso, solo en memoria, para ver la app con datos inventados.
   Nunca toca la base real. Se inyecta en lugar del script del CDN. */
(function(){
  const hoy = new Date(); const iso = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  const dia = n => { const d=new Date(); d.setDate(d.getDate()+n); return iso(d); };
  const ts = (n,h) => { const d=new Date(); d.setDate(d.getDate()+n); const [a,b]=h.split(":"); d.setHours(+a,+b,0,0); return d.toISOString(); };
  const P = [
    {id:"d1", nombre:"Mtra. Laura Gómez", color:"#8B3D9E", es_direccion:true,  atiende:true,  telefono:"833-111-0000", cedula:"1111"},
    {id:"s1", nombre:"Psic. Fernanda Ruiz", color:"#1BADE0", es_direccion:false, atiende:true, telefono:"833-222-0000", cedula:"2222"},
    {id:"s2", nombre:"Psic. Andrea Torres", color:"#6DB33F", es_direccion:false, atiende:true, telefono:"833-333-0000", cedula:"3333"},
    {id:"s3", nombre:"Psic. Sofía Medina", color:"#F07E1E", es_direccion:false, atiende:true, telefono:"833-444-0000", cedula:"4444"},
    {id:"d2", nombre:"Soporte Técnico", color:"#33303B", es_direccion:true, atiende:false, telefono:"833-555-0000", cedula:null},
  ];
  const nombres = [
    ["Mateo Hernández Ríos",7,"mamá: Carolina Ríos","Dificultades de atención en el aula","s1"],
    ["Valentina Cruz Ortega",9,"papá: Jorge Cruz","Ansiedad ante separación","s1"],
    ["Santiago López Peña",5,"mamá: Diana Peña","Evaluación TEA, lenguaje","s2"],
    ["Regina Martínez Soto",11,"mamá: Paola Soto","Regulación emocional","s2"],
    ["Emiliano García Vela",8,"abuela: Rosa Vela","TDAH, organización de tareas","s3"],
    ["Ximena Ramírez Luna",6,"mamá: Andrea Luna","Habilidades sociales","s1"],
    ["Leonardo Flores Díaz",10,"papá: Hugo Flores","Dislexia, apoyo lectoescritura","s3"],
    ["Camila Torres Méndez",4,"mamá: Laura Méndez","Retraso del lenguaje","s2"],
    ["Diego Sánchez Mora",12,"mamá: Elena Mora","Baja tolerancia a la frustración","s1"],
    ["Renata Jiménez Gil",7,"papá: Iván Jiménez","Integración sensorial","s3"],
    ["Sebastián Castillo Paz",9,"mamá: Mónica Paz","Ansiedad escolar","s2"],
    ["Natalia Vargas Rey",8,"mamá: Sandra Rey","Seguimiento TEA","s1", false],
  ];
  const pacientes = nombres.map((x,i)=>({id:"p"+(i+1), nombre:x[0], edad:x[1], tutor:x[2], telefono:"833-5"+String(10+i)+"-"+String(1000+i*37), motivo:x[3], tarifa:[600,650,700][i%3], pago_psicologa:i%4===3? null : [300,350,280][i%3], asignada_a:x[4], activo:x[5]!==false}));
  const citas=[]; let k=1;
  // Horario del consultorio: lunes a viernes de 2 a 9 pm, sábado de 8 am a 6 pm, domingo cerrado
  const horasLV=["14:00","15:00","16:00","17:00","18:00","19:00","20:00"], horasSab=["08:00","09:00","10:00","11:00","12:00","15:00","16:00"];
  for(let d=-3; d<=4; d++){ const dow=new Date(dia(d)+"T12:00:00").getDay(); if(dow===0) continue; const horas=dow===6? horasSab : horasLV;
    pacientes.filter(p=>p.activo).forEach((p,i)=>{ if((i+d+20)%3===0) citas.push({id:"c"+(k++), fecha:dia(d), hora:horas[(i+d+21)%horas.length]+":00", duracion:60, psicologa_id:p.asignada_a, paciente_id:p.id,
      estado:"programada", marcada_por:null, marcada_en:null, confirmada_por:null}); }); }
  // Como en sql/citas-estado.sql: una inasistencia que Fernanda marcó y falta confirmar, una ya confirmada y una cancelada
  const pasadas=id=>citas.filter(c=>c.fecha<dia(0) && c.psicologa_id===id);
  const marcar=(c,est,por,conf)=>{ if(c) Object.assign(c,{estado:est, marcada_por:por, marcada_en:ts(0,"09:00"), confirmada_por:conf}); };
  marcar(pasadas("s1").at(-1),"no_asistio","s1",null);
  marcar(pasadas("s2").at(-1),"no_asistio","s2","d1");
  marcar(pasadas("s3").at(-1),"cancelada","d1","d1");
  const textos=[
    "Trabajamos la rutina visual de la mañana. Logró seguir 4 de 5 pasos sin apoyo. Se acordó con mamá reforzar en casa con el tablero de pictogramas.",
    "Sesión centrada en reconocimiento de emociones con tarjetas. Identificó enojo y tristeza; le costó diferenciar miedo de sorpresa. Tarea: diario de emociones con caritas.",
    "Juego simbólico con la casita. Mayor contacto visual que la semana pasada. Toleró el cambio de actividad con anticipación verbal y temporizador.",
    "Lectura de sílabas trabadas (pl, bl, tr). 70% de aciertos. Se frustró al final; usamos respiración de globo y retomó.",
    "Entrevista con tutora para revisar avances del mes. Reporta menos berrinches en la escuela. Acordamos seguir con economía de fichas.",
  ];
  const notas=[]; const comentarios=[]; let nk=1, ck=1;
  pacientes.forEach((p,i)=>{ const n=(i%4)+1; for(let j=0;j<n;j++){ const id="n"+(nk++); const dd=-(j*7+(i%3));
    notas.push({id, paciente_id:p.id, psicologa_id:p.asignada_a, texto:textos[(i+j)%textos.length], revisada:(j>0||i%3!==0), vista_psic:!(j===0&&i%5===1), fecha:dia(dd), hora:"10:30", creado_en:ts(dd,"10:30")});
    if(j===0 && i%2===0){ comentarios.push({id:"k"+(ck++), nota_id:id, autor_id:"d1", texto:"Muy bien. ¿Podemos revisar el tablero la próxima supervisión? 👍", editado:false, creado_en:ts(dd,"13:10")}); }
    if(j===0 && i%4===0){ comentarios.push({id:"k"+(ck++), nota_id:id, autor_id:p.asignada_a, texto:"Claro, lo llevo el jueves.", editado:false, creado_en:ts(dd,"15:02")}); }
  }});
  const pagos=[]; let gk=1;
  citas.filter(c=>c.fecha<=dia(0) && c.estado==="programada").forEach((c,i)=>{ if(i%4!==3) pagos.push({id:"g"+(gk++), paciente_id:c.paciente_id, psicologa_id:c.psicologa_id, monto:600, metodo:["efectivo","transferencia","tarjeta"][i%3], validado:i%2===0, fecha:c.fecha, hora:c.hora.slice(0,5), creado_en:new Date(c.fecha+"T"+c.hora).toISOString()}); });
  const facturas=[{id:"f1", paciente_id:"p2", monto:1200, estado:"solicitada", solicitada_por:"s1", fecha_solicitada:dia(-2)}, {id:"f2", paciente_id:"p4", monto:600, estado:"emitida", solicitada_por:"s2", fecha_solicitada:dia(-6), fecha_emitida:dia(-1)}];
  const DB={psicologas:P, pacientes, citas, notas, comentarios, pagos, facturas, cierres:[]};
  window.__DB=DB;
  let uid = (new URLSearchParams(location.search)).get("como") || window.__COMO || "d1";
  let nid=1000;
  function q(tabla){
    const st={op:"select", filtros:[], cols:"*", single:false, datos:null, patch:null, wantSelect:false};
    const b={
      select(c){ if(st.op==="select") st.cols=c||"*"; else st.wantSelect=true; return b; },
      order(){ return b; }, single(){ st.single=true; return b; },
      eq(c,v){ st.filtros.push([c,v]); return b; },
      update(p){ st.op="update"; st.patch=p; return b; },
      insert(d){ st.op="insert"; st.datos=d; return b; },
      delete(){ st.op="delete"; return b; },
      then(ok,ko){ return Promise.resolve(run()).then(ok,ko); },
    };
    function match(r){ return st.filtros.every(([c,v])=>r[c]===v); }
    function run(){
      const t=DB[tabla]||(DB[tabla]=[]);
      if(st.op==="select"){ let rows=t.filter(match).map(r=>({...r}));
        if(tabla==="notas" && /comentarios/.test(st.cols)) rows.forEach(r=>r.comentarios=DB.comentarios.filter(c=>c.nota_id===r.id).map(c=>({...c})));
        return {data:rows, error:null}; }
      if(st.op==="update"){ t.filter(match).forEach(r=>{ const p={...st.patch};
          if(tabla==="citas"){   // como el trigger proteger_citas: anota quién marcó; lo de Dirección queda confirmado
            const dir=DB.psicologas.some(x=>x.id===uid && x.es_direccion);
            if(p.estado!==undefined && p.estado!==r.estado){ p.marcada_por=uid; p.marcada_en=new Date().toISOString(); p.confirmada_por=(dir && p.estado!=="programada")? uid : null; }
            else if(p.confirmada_por!==undefined) p.confirmada_por=(dir && p.confirmada_por)? uid : r.confirmada_por;
          }
          if(tabla==="cierres" && p.revisado_por) p.revisado_por=uid;   // como proteger_cierres
          Object.assign(r,p); }); return {data:null, error:null}; }
      if(st.op==="delete"){ for(let i=t.length-1;i>=0;i--) if(match(t[i])) t.splice(i,1); if(tabla==="notas") for(let i=DB.comentarios.length-1;i>=0;i--) if(!DB.notas.some(n=>n.id===DB.comentarios[i].nota_id)) DB.comentarios.splice(i,1); return {data:null, error:null}; }
      if(st.op==="insert"){ const arr=(Array.isArray(st.datos)?st.datos:[st.datos]).map(d=>({id:"m"+(nid++), creado_en:new Date().toISOString(), ...(tabla==="citas"? {estado:"programada", marcada_por:null, marcada_en:null, confirmada_por:null} : {}), ...d})); t.push(...arr); return {data: st.single? arr[0] : arr, error:null}; }
    }
    return b;
  }
  const cliente={
    from:q,
    auth:{ getUser: async()=>({data:{user: uid? {id:uid} : null}}),
           signInWithPassword: async()=>({error:null}), signOut: async()=>{ uid=null; return {error:null}; } },
    channel(){ const c={ on(){ return c; }, subscribe(){ return c; } }; return c; },
  };
  window.supabase={ createClient: ()=>cliente };
})();
