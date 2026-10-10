# Notas de la presentacion del patrocinador (audio)

Transcripcion automatica (Whisper) del audio de la presentacion; resumen de lo
que impacta el diseño:

- **"Sistema de inaccion".** No quieren un recomendador mas tipo Netflix/Spotify
  que siempre empuja algo: el catalogo de acciones debe poder decir *no hagas
  nada* o *espera*. → `wait` / `no_action` son resultados de primera clase.
- **Las aperturas dan contexto, pero son ambiguas.** No es lo mismo abrirla
  una vez que cinco; abrirla en los primeros dos minutos puede ser interes o
  solo curiosidad ("hay dos ramas"). → metricas de aperturas y la explicacion
  menciona ambas lecturas; confianza baja (R5).
- **Timing por cliente.** Cada cliente decide segun su contexto (ej. ticket
  historico de 100-150 mil MXN, decide los lunes, "espera 48 horas"). →
  `wait at_date`, fechas pedidas por el cliente, metricas de tiempo.
- **Duda puntual de precio en la primera hora con interes alto** = momento de
  actuar. → `resolve_objection` inmediato.
- **Aprender de los "no".** Si alguien dijo que no quiere seguir, eso debe
  alimentar el sistema. → hoy: `not_interested` → `no_action` + revision
  humana. Siguiente paso: registrar resultados.
- **Metricas entre cada accion**, no solo inicio/cierre del embudo. → panel
  "Metricas entre acciones".
- **Clientes conocidos vs nuevos / perfiles.** Con historial se aprovecha el
  perfil; sin historial se empieza de cero (o con escenarios tipo). →
  extension futura: perfiles de cliente (patron que ya existia en Banorte One
  con `context/profiles/*.json`).
- **Evaluar las recomendaciones** (que funciono, reforzar, no descartar a la
  primera: "no funciono porque decido los lunes"). → extension: bucle de
  retroalimentacion.
- **Canal y escala** (mensaje vs llamada, 200,000 usuarios). → fuera del
  alcance obligatorio; mencionarlo como vision.
- Dudas: juntarlas en equipo y mandarlas por el canal que dieron.
