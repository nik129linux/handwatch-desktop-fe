/* i18n.js — EN/ES switch, vanilla, IIFE exposing window.I18n.
 * Spanish is the product default: a fresh profile opens in Spanish whatever
 * the OS or navigator language is. English stays the source language in the
 * markup, so switching never reloads and never loses state. */
var I18n = (function () {
  'use strict';
  var KEY = 'retoma.lang';
  var lang = 'es';
  var listeners = [];
  /* Read the stored choice as soon as the module loads: later modules mount
   * before I18n.mount and must paint the right language on their first pass. */
  try {
    var storedLang = window.localStorage.getItem(KEY);
    if (storedLang === 'es' || storedLang === 'en') lang = storedLang;
  } catch (e) { /* fresh profile keeps Spanish */ }
  var translating = false;
  var origText = new WeakMap();
  var origAttr = new WeakMap();
  var origElem = new WeakMap();

  var DICT = {
    'Skip to Retoma': 'Saltar a Retoma',
    'Paused: not watching': 'En pausa: sin seguimiento',
    'Paused: I am not watching anything': 'En pausa: no estoy observando nada',
    'Demo or Live mode': 'Modo Demo o Live',
    'Switch theme': 'Cambiar tema',
    'Pause Retoma': 'Pausar Retoma',
    'Resume Retoma': 'Reanudar Retoma',
    'Pause 30 min': 'Pausar 30 min',
    'Resume 30 min': 'Reanudar 30 min',
    'Quality report': 'Informe de calidad',
    'Quality report (paragraph 3)': 'Informe de calidad (párrafo 3)',
    'Quality report, paragraph 3': 'Informe de calidad, párrafo 3',
    'Quality report \u2014 paragraph 3': 'Informe de calidad, párrafo 3',
    'Quarterly report draft. You were writing here before the interruption.': 'Borrador del informe trimestral. Estabas escribiendo aquí antes de la interrupción.',
    'Edited 2 min ago \u00b7 Only the title is visible to Retoma': 'Editado hace 2 min \u00b7 Solo el título es visible para Retoma',
    'Brightspace \u00b7 Course 4B': 'Brightspace \u00b7 Curso 4B',
    'Course material and assignments. Window open in the background.': 'Material del curso y tareas. Ventana abierta en segundo plano.',
    'Hi, do you have a moment?': 'Hola, \u00bftienes un momento?',
    'Only the window title, never the content': 'Solo el título de la ventana, nunca el contenido',
    'Report data table. Open next to the document.': 'Tabla de datos del informe. Abierta junto al documento.',
    'Only the title, not the cells': 'Solo el título, no las celdas',
    'Waiting for helper': 'Esperando el ayudante',
    'Tracking this PC': 'Siguiendo este equipo',
    'Paused': 'En pausa',
    'Now: waiting for activity': 'Ahora: esperando actividad',
    'Nothing tracked yet': 'Nada registrado todavía',
    'Track this PC': 'Seguir este equipo',
    'Install the focus helper': 'Instalar el ayudante de enfoque',
    'Install helper': 'Instalar ayudante',
    'Log out and back in': 'Cerrar sesión y volver a entrar',
    'Enable and check': 'Activar y comprobar',
    'Check again': 'Comprobar de nuevo',
    'Copy': 'Copiar',
    'A simulated desktop for the demo. Click a window to focus it.': 'Un escritorio simulado para la demo. Haz clic en una ventana para enfocarla.',
    'Live: tracking this PC': 'Live: siguiendo este equipo',
    'Demo controls': 'Controles de demo',
    'Guided tour, 7 steps': 'Tour guiado, 7 pasos',
    'Guided tour': 'Tour guiado',
    'Messages · Ana': 'Mensajes · Ana',
    'fix the citation in paragraph 3': 'corregir la cita del párrafo 3',
    'Data · Tracker': 'Datos · Tracker',
    'Running': 'En curso',
    'Pause': 'Pausar',
    'Resume': 'Retomar',
    'Got it': 'Entendido',
    'Continue': 'Continuar',
    'Skip to end': 'Saltar al final',
    'Restart': 'Reiniciar',
    'Status:': 'Estado:',
    'ready': 'listo',
    'done': 'terminado',
    'Free mode': 'Modo libre',
    'Switch app': 'Cambiar de app',
    'A WhatsApp arrives': 'Llega un WhatsApp',
    'Step away 25 min': 'Alejarme 25 min',
    'Come back': 'Volver',
    'End the day': 'Terminar el día',
    'Delete everything': 'Borrar todo',
    'Delete everything?': '\u00bfBorrar todo?',
    'Everything stays on this device. Pause anytime.': 'Todo queda en este dispositivo. Pausa cuando quieras.',
    'Everything stays on this device.': 'Todo queda en este dispositivo.',
    'Everything stays on this device, except what you send to the AI with your permission.': 'Todo queda en este dispositivo, salvo lo que envías a la IA con tu permiso.',
    'Everything stays on this device, except what you send to the AI with your permission. Pause anytime.': 'Todo queda en este dispositivo, salvo lo que envías a la IA con tu permiso. Pausa cuando quieras.',
    'It keeps app names, window titles only if you ask for them, and minutes. Everything stays on this device, except what you send to the AI with your permission, and is deleted after 7 days.': 'Guarda nombres de apps, títulos de ventana solo si los pides, y minutos. Todo queda en este dispositivo, salvo lo que envías a la IA con tu permiso, y se borra a los 7 días.',
    '7 days, then it is deleted.': '7 días, luego se borra.',
    'Now': 'Ahora',
    'Today': 'Hoy',
    'Privacy': 'Privacidad',
    'Time in this task': 'Tiempo en esta tarea',
    'Not tracking right now': 'Sin seguimiento ahora mismo',
    'Only the app name and the title. Never what you type.': 'Solo el nombre de la app y el título. Nunca lo que escribes.',
    'Only the app name. Never what you type.': 'Solo el nombre de la app. Nunca lo que escribes.',
    'App name and title. Never what you type.': 'Nombre de la app y título. Nunca lo que escribes.',
    'Only app names. Never what you type.': 'Solo nombres de apps. Nunca lo que escribes.',
    'Next step': 'Siguiente paso',
    'Saved': 'Guardado',
    "Saved, you'll see it when you come back": 'Guardado, lo verás al volver',
    "What's next when you return?": '\u00bfQué sigue cuando vuelvas?',
    'Today, the report won the morning': 'Hoy, el informe ganó la mañana',
    'Planned: 2 h on the report \u00b7 Actual: 1 h 20 min': 'Planeado: 2 h del informe \u00b7 Real: 1 h 20 min',
    'Suggestion \u00b7': 'Sugerencia \u00b7',
    'On-device rules': 'Reglas en el dispositivo',
    'Accept': 'Aceptar',
    'No, thanks': 'No, gracias',
    'No history. Everything was deleted.': 'Sin historial. Todo fue borrado.',
    'Habit coach \u00b7': 'Coach de hábitos \u00b7',
    'Try it': 'Probarlo',
    'New note': 'Nueva nota',
    'Ask your day': 'Pregunta a tu día',
    'Ask about your day': 'Pregunta sobre tu día',
    'Ask': 'Preguntar',
    'What I see': 'Qué veo',
    'What I never see': 'Qué nunca veo',
    'App name and window title': 'Nombre de la app y título de la ventana',
    'How much time': 'Cuánto tiempo',
    'What you type': 'Lo que escribes',
    'Screen content': 'Contenido de la pantalla',
    'Your camera': 'Tu cámara',
    'Your microphone': 'Tu micrófono',
    'Window titles (off)': 'Títulos de ventana (desactivados)',
    'Window title (60 chars)': 'Título de ventana (60 caracteres)',
    'Include window titles': 'Incluir títulos de ventana',
    'App name only': 'Solo el nombre de la app',
    'App name': 'Nombre de la app',
    'Mode': 'Modo',
    'Demo mode: tracks the windows inside this demo': 'Modo Demo: sigue las ventanas dentro de esta demo',
    'Live mode: tracks apps on this PC, titles on.': 'Modo Live: sigue las apps de este equipo, con títulos.',
    'Live mode: tracks apps on this PC. App names only.': 'Modo Live: sigue las apps de este equipo. Solo nombres.',
    'Smart suggestions': 'Sugerencias inteligentes',
    'Smart suggestions mode': 'Modo de sugerencias inteligentes',
    'Off': 'Apagado',
    'Local model': 'Modelo local',
    'Retoma server': 'Servidor Retoma',
    'Retoma server: offline, using on-device rules': 'Servidor Retoma: sin conexión, usando reglas en el dispositivo',
    'Retoma server needs the desktop app': 'El servidor Retoma necesita la app de escritorio',
    "Your note, the app name and the window title go to Retoma's server, which asks gemma on Ollama cloud. Nothing is stored there.": 'Tu nota, el nombre de la app y el título de la ventana van al servidor de Retoma, que consulta a gemma en la nube de Ollama. Nada se guarda allí.',
    'Cloud model': 'Modelo en la nube',
    'This exact payload is sent. Nothing else leaves this device.': 'Este es el contenido exacto que se envía. Nada más sale de este dispositivo.',
    'Allow': 'Permitir',
    'Not now': 'Ahora no',
    'Local model: off': 'Modelo local: apagado',
    'Local model: needs the desktop app': 'El modelo local necesita la app de escritorio',
    'Local model needs the desktop app': 'El modelo local necesita la app de escritorio',
    'Cloud model needs the desktop app': 'El modelo en la nube necesita la app de escritorio',
    'Local model: reachable, no model installed': 'Modelo local: accesible, sin modelo instalado',
    'Local model: unreachable': 'Modelo local: inalcanzable',
    'Off records app names only. Tab titles can reveal bank pages or private docs.': 'Apagado registra solo nombres de apps. Las pestañas pueden revelar páginas de banco o documentos privados.',
    'Blocked apps': 'Apps bloqueadas',
    'Add': 'Agregar',
    'Remove': 'Quitar',
    'Pause tracking': 'Pausar seguimiento',
    'Resume tracking': 'Reanudar seguimiento',
    'Export my data': 'Exportar mis datos',
    "Today's history and cards will be deleted. This cannot be undone.": 'El historial y las tarjetas de hoy se borrarán. Esto no se puede deshacer.',
    'Only the Live history on this PC will be deleted. Demo history is kept. This cannot be undone.': 'Solo se borrará el historial Live de este equipo. La demo se conserva. Esto no se puede deshacer.',
    'Cancel': 'Cancelar',
    'Delete': 'Borrar',
    'Retoma is paused. Resume whenever you like.': 'Retoma está en pausa. Continúa cuando quieras.',
    'Waiting for activity': 'Esperando actividad',
    'Start any app to begin tracking.': 'Abre cualquier app para empezar el seguimiento.',
    'Coming back shows where you left off.': 'Al volver verás dónde quedaste.',
    'Away': 'Ausente',
    'Retoma could not read the active window. Try restarting the app.': 'Retoma no pudo leer la ventana activa. Prueba reiniciar la app.',
    'Helper installed. Log out and back in, then press Check again.': 'Ayudante instalado. Cierra sesión y vuelve a entrar, luego presiona Comprobar de nuevo.',
    'Install cancelled. Nothing was copied.': 'Instalación cancelada. No se copió nada.',
    'Helper is on. Tracking this PC.': 'El ayudante está activo. Siguiendo este equipo.',
    'Helper files are here but off. Run the command, then press Check again.': 'Los archivos del ayudante están aquí pero apagados. Ejecuta el comando y presiona Comprobar de nuevo.',
    'Helper not found yet. Press Install helper first.': 'Ayudante no encontrado todavía. Presiona Instalar ayudante primero.',
    'Command copied. Paste it in a terminal.': 'Comando copiado. Pégalo en una terminal.',
    'Disabled in Live mode': 'Desactivado en modo Live',
    'Your history is yours. Deleted in one gesture.': 'Tu historial es tuyo. Se borra con un gesto.',
    'One tap and you are back to work.': 'Con un toque vuelves al trabajo.',
    'One simple suggestion. You decide.': 'Una sugerencia simple. Tú decides.',
    'When you return, it shows where you left off.': 'Cuando vuelves, te muestra dónde quedaste.',
    'You stepped away for a while.': 'Te alejaste un rato.',
    'You were interrupted. It notes it, never judges.': 'Te interrumpieron. Lo anota, sin juzgar.',
    'Retoma sees the app in use. Only the name, never what you type.': 'Retoma ve la app en uso. Solo el nombre, nunca lo que escribes.',
    'Saved. Tomorrow this card measures it.': 'Guardado. Mañana esta tarjeta lo mide.',
    'Retoma can\'t reopen windows here; it reminds you where you were.': 'Retoma no puede reabrir ventanas aquí; te recuerda dónde estabas.',
    "Retoma can't reopen windows here; it reminds you where you were.": 'Retoma no puede reabrir ventanas aquí; te recuerda dónde estabas.',
    'Minutes before Away': 'Minutos antes de Ausente',
    'Language': 'Idioma',
    'Confirm deletion': 'Confirmar borrado',
    'Retoma sections': 'Secciones de Retoma',
    'Your desktop': 'Tu escritorio',
    'Demo or Live mode': 'Modo Demo o Live',
    'Timeline legend': 'Leyenda de la línea de tiempo',
    'Habit coach': 'Coach de hábitos',
    'Live tracking on this PC': 'Seguimiento en vivo en este equipo',
    'Helper setup': 'Configuración del ayudante',
    'Dock': 'Dock',
    'Live tracking': 'Seguimiento en vivo',
    'Start fresh': 'Empezar de cero',
    'How I decided: longest block Document 40 min \u00b7 first interruption WhatsApp 9:52 \u00b7 window 9:00\u20139:40': 'Cómo decidí: bloque más largo Document 40 min \u00b7 primera interrupción WhatsApp 9:52 \u00b7 ventana 9:00\u20139:40',
    'It reads the app and the window title, so it knows you were in the report without reading the report.': 'Lee la app y el título de la ventana: sabe que estabas en el informe sin leer el informe.',
    'A message pulled you into WhatsApp. Retoma only remembers what you were doing before it.': 'Un mensaje te llevó a WhatsApp. Retoma solo recuerda lo que hacías antes.',
    'The clock jumps 25 minutes. Long enough to lose the thread.': 'El reloj salta 25 minutos. Suficiente para perder el hilo.',
    'One card with the task, the paragraph and the note you left yourself.': 'Una tarjeta con la tarea, el párrafo y la nota que te dejaste.',
    'Resume brings back the three work windows you had open.': 'Retomar trae de vuelta las tres ventanas de trabajo que tenías abiertas.',
    'At the end of the day it proposes one block for tomorrow and shows how it decided.': 'Al final del día propone un bloque para mañana y muestra cómo lo decidió.',
    'Everything stays on this device and is deleted after 7 days, or right now with one button.': 'Todo queda en este dispositivo y se borra a los 7 días, o ahora mismo con un botón.',
    'Everything stays on this device, except what you send to the AI with your permission, and is deleted after 7 days, or right now with one button.': 'Todo queda en este dispositivo, salvo lo que envías a la IA con tu permiso, y se borra a los 7 días, o ahora mismo con un botón.',
    'Retoma sees app names and window titles, never what you type, never your screen. Everything stays on this device, except what you send to the AI with your permission, and is deleted after 7 days. AI is off until you allow it.': 'Retoma ve nombres de apps y títulos de ventana, nunca lo que escribes ni tu pantalla. Todo queda en este dispositivo, salvo lo que envías a la IA con tu permiso, y se borra a los 7 días. La IA está apagada hasta que la permitas.',
    'Next': 'Siguiente',
    'Back': 'Atrás',
    'Finish': 'Terminar',
    'Skip': 'Saltar',
    'Earlier': 'Antes',
    'Later': 'Después',
    'Guide': 'Guía',
    'Settings': 'Configuración',
    'Theme': 'Tema',
    'Light': 'Claro',
    'Dark': 'Oscuro',
    'System': 'Sistema',
    'Theme mode': 'Modo de tema',
    'Artificial intelligence': 'Inteligencia artificial',
    'Help': 'Ayuda',
    'See the guide again': 'Ver la guía otra vez',
    'Step 1 of 3': 'Paso 1 de 3',
    'Skip the guide': 'Saltar la guía',
    'Welcome to Retoma': 'Te damos la bienvenida a Retoma',
    'Changes the whole app at once, without reloading or losing what you were doing.': 'Cambia toda la app de una vez, sin recargar ni perder lo que estabas haciendo.',
    'System follows this computer. Light is the default.': 'Sistema sigue este equipo. Claro es el predeterminado.',
    'When it is on, only app names and minutes go to the server. Never titles, never notes.': 'Cuando está activada, solo van al servidor nombres de apps y minutos. Nunca títulos, nunca notas.',
    'Revoke permission': 'Revocar permiso',
    'Grant permission': 'Dar permiso',
    'See what is sent': 'Ver qué se envía',
    'It keeps app names, window titles only if you ask for them, and minutes. Everything stays on this device and is deleted after 7 days.': 'Guarda nombres de apps, títulos de ventana solo si los pides, y minutos. Todo queda en este dispositivo y se borra a los 7 días.',
    'Artificial intelligence is off.': 'La inteligencia artificial está apagada.',
    'Enabled': 'Activada',
    'Disabled': 'Apagada',
    'AI limit reached. Connect Ollama to keep going.': 'Se alcanzó el límite de IA. Conecta Ollama para seguir.',
    'Artificial intelligence is off. It needs the desktop app to turn on.': 'La inteligencia artificial está apagada. Necesita la app de escritorio para activarse.',
    'Artificial intelligence is on. Only app names and minutes are sent.': 'La inteligencia artificial está activada. Solo se envían nombres de apps y minutos.',
    'Start': 'Inicio',
    'Start time': 'Hora de inicio',
    'Use a time like 9:30 and 15–180 min': 'Usa una hora como 9:30 y 15–180 min',
    'Test': 'Probar',
    'Testing…': 'Probando…',
    'Connected': 'Conectado',
    'Not reachable': 'Sin conexión',
    'Thinking…': 'Pensando…',
    'The server did not answer, so on-device rules made this one.': 'El servidor no respondió, así que esta la hicieron las reglas en el dispositivo.',
    'Needs the desktop app': 'Necesita la app de escritorio',
    'AI requests left': 'Solicitudes de IA disponibles',
    'See exactly what is sent': 'Ver exactamente qué se envía',
    'What the model saw': 'Qué vio el modelo',
    'Send': 'Enviar',
    'Adjust': 'Ajustar',
    'Ollama URL': 'URL de Ollama',
    'Next step note': 'Nota del siguiente paso',
    'App name to block': 'Nombre de la app a bloquear',
    'Tracking this PC': 'Siguiendo este equipo',
    'Document': 'Documento',
    'Browser': 'Navegador',
    'Spreadsheet': 'Hoja de cálculo',
    'Minutes': 'Minutos',
    'Step': 'Paso',
    'of': 'de',
    'Block': 'Bloque',
    'blocks': 'bloques',
    'block': 'bloque',
  };

  var PATTERNS = [
    [/^Connected \u00b7 (.+)$/, 'Conectado \u00b7 $1'],
    [/^Local model/, 'Modelo local'],
    [/^Cloud model/, 'Modelo en la nube'],
    [/Retoma server/, 'Servidor Retoma'],
    [/^(\d+) requests left$/, '$1 solicitudes disponibles'],
    [/^1 request left$/, '1 solicitud disponible'],
    [/ 1 request left$/, ' 1 solicitud disponible'],
    [/ (\d+) requests left$/, ' $1 solicitudes disponibles'],
    [/^AI requests: 1 left$/, 'Solicitudes de IA: 1 disponible'],
    [/^AI requests: (\d+) left$/, 'Solicitudes de IA: $1 disponibles'],
    [/adjusted to/, 'ajustado a'],
    [/^You were in (.+)$/, 'Estabas en $1'],
    [/^(\d+) min here$/, '$1 min aquí'],
    [/^Was here (\d+) min$/, 'Estabas aquí $1 min'],
    [/^Earlier, (\d+) of (\d+)$/, 'Antes, $1 de $2'],
    [/^Next: (.*)$/, 'Siguiente: $1'],
    [/^(.+) interrupted you \u00b7 (\d+) min$/, '$1 te interrumpió \u00b7 $2 min'],
    [/^(.+) interrupted you$/, '$1 te interrumpió'],
    [/Tomorrow:/, 'Mañana:'],
    [/^Planned for tomorrow, (.+)$/, 'Planeado para mañana, $1'],
    [/Planned:/, 'Planeado:'],
    [/Actual:/, 'Real:'],
    [/How I decided:/, 'Cómo decidí:'],
    [/longest block/, 'bloque más largo'],
    [/first interruption/, 'primera interrupción'],
    [/window (\d{1,2}:\d{2})/, 'ventana $1'],
    [/^Now: (.*)$/, 'Ahora: $1'],
    [/^Today: (.*)$/, 'Hoy: $1'],
    [/^Tracked today: (\d+) min on this PC$/, 'Registrado hoy: $1 min en este equipo'],
    [/^Out \u00b7 (\d+) min$/, 'Fuera \u00b7 $1 min'],
    [/^Away (\d+) min \u00b7 back now$/, 'Fuera $1 min \u00b7 de vuelta ahora'],
    [/^(\d+) minutes in this task\. The ring fills at (\d+) minutes\.$/, '$1 minutos en esta tarea. El círculo se completa a los $2 minutos.'],
    [/^Unblock (.+)$/, 'Desbloquear $1'],
    [/^Local model: ready \((.*)\)$/, 'Modelo local: listo ($1)'],
    [/^Retoma server: ready \((.*)\)$/, 'Servidor Retoma: listo ($1)'],
    [/before the messages arrive/, 'antes de que lleguen los mensajes'],
    [/for the report/, 'para el informe'],
    [/ (\d{1,2}:\d{2}) to (\d{1,2}:\d{2})/, ' $1 a $2'],
    [/^After (.+), I will (.+) for (\d+) min\.?$/, 'Cuando $1, voy a $2 durante $3 min.'],
    [/I finish a message check/, 'reviso los mensajes'],
    [/I open my main task/, 'abro mi tarea principal'],
    [/I check messages/, 'reviso los mensajes'],
    [/I start work/, 'empiezo a trabajar'],
    [/keep one window open/, 'mantener una sola ventana abierta'],
    [/stay with it/, 'seguir con ella'],
    [/dinner ends/, 'termina la cena'],
    [/leave work windows closed/, 'dejar cerradas las ventanas de trabajo'],
    [/return to my main task/, 'volver a mi tarea principal'],
    [/do one focused stretch/, 'hacer un tramo enfocado'],
    [/Many quick switches today/, 'Muchos cambios rápidos hoy'],
    [/^1 block\)\. Short single-app stretches can help ideas settle\.$/, '1 bloque). Los tramos cortos en una sola app ayudan a asentar ideas.'],
    [/^(.+) min in (.+) across 1 block\. Small reps keep it going\.$/, '$1 min en $2 en 1 bloque. Los pequeños repasos lo mantienen.'],
    [/^(.+) min in (.+) across (\d+) blocks\. Small reps keep it going\.$/, '$1 min en $2 en $3 bloques. Los pequeños repasos lo mantienen.'],
    [/per hour across/, 'por hora en'],
    [/blocks\)\. Short single-app stretches can help ideas settle\./, 'bloques). Los tramos cortos en una sola app ayudan a asentar ideas.'],
    [/No block reached/, 'Ningún bloque llegó a'],
    [/yet \(longest/, 'todavía (más largo'],
    [/min\)\. One longer stretch can move the main task forward\./, 'min). Un tramo más largo puede avanzar la tarea principal.'],
    [/Last activity ran to/, 'La última actividad terminó a las'],
    [/A clear evening stop can protect tomorrow morning\./, 'Una pausa clara en la noche puede cuidar la mañana.'],
    [/Messages and browsing took/, 'Los mensajes y la navegación tomaron'],
    [/% of tracked time/, '% del tiempo registrado'],
    [/A short boundary can help the main task keep its turn\./, 'Un límite corto puede ayudar a que la tarea principal mantenga su turno.'],
    [/Steady day: longest/, 'Día estable: más largo'],
    [/Small reps keep it going\./, 'Los pequeños repasos lo mantienen.'],
    [/^Your longest block was (.+) (\d+) min \(median (.+) min\)\.?$/, 'Tu bloque más largo fue $1 $2 min (mediana $3 min).'],
    [/^(\d+) blocks, about (.+) switches per hour\.?$/, '$1 bloques, unos $2 cambios por hora.'],
    [/^1 block, about 1 switch per hour\.?$/, '1 bloque, unos 1 cambio por hora.'],
    [/^1 block, about (.+) switch(es)? per hour\.?$/, '1 bloque, unos $1 cambios por hora.'],
    [/^(\d+) blocks?, about (.+) switch(es)? per hour\.?$/, '$1 bloques, unos $2 cambios por hora.'],
    [/^Messages and browsing: (\d+) min \((\d+)% of tracked time\)\.?$/, 'Mensajes y navegación: $1 min ($2% del tiempo registrado).'],
    [/^First activity (.+), last (.+)\.?$/, 'Primera actividad $1, última $2.'],
    [/last ran late/, 'la última terminó tarde'],
    [/^(\d+) breaks of 10\+ min \(longest gap (\d+) min\)\.?$/, '$1 pausas de 10+ min (pausa más larga $2 min).'],
    [/^1 break of 10\+ min \(longest gap (\d+) min\)\.?$/, '1 pausa de 10+ min (pausa más larga $1 min).'],
    [/^Tracked (\d+) min recently vs (\d+) min before \((.+)\)\.?$/, 'Registrado $1 min reciente vs $2 min antes ($3).'],
    [/^Most-used app: (.+) (\d+) min of (\d+) min tracked\.?$/, 'App más usada: $1 $2 min de $3 min registrados.'],
    [/^I cannot tell from the tracked time yet\. Ask about your longest block, most-used app, or switches\.?$/, 'Todavía no puedo saberlo con el tiempo registrado. Pregunta por tu bloque más largo, tu app más usada o los cambios.'],
    [/^Nothing tracked yet - I cannot tell from this week\.?$/, 'Nada registrado todavía - no puedo saberlo esta semana.'],
    [/^No clock times stored yet\.?$/, 'Aún no hay horas guardadas.'],
    [/^Not enough days yet to compare trends\.?$/, 'Aún no hay días suficientes para comparar tendencias.'],
    [/^Last try: /, 'Último intento: '],
    [/vs target /, 'vs objetivo '],
    [/ - followed\./, ' - logrado.'],
    [/ - not yet\./, ' - todavía no.'],
    [/evening stop/, 'pausa nocturna']
  ];

  function translateString(s) {
    var out = Object.prototype.hasOwnProperty.call(DICT, s) ? DICT[s] : s;
    if (out === s) {
      for (var i = 0; i < PATTERNS.length; i++) {
        try { out = out.replace(PATTERNS[i][0], PATTERNS[i][1]); } catch (e) { /* keep */ }
      }
    }
    /* Demo app names are data, but they are read on screen: show them in the
     * active language without ever touching state or storage. */
    out = out
      .replace(/\bSpreadsheet\b/g, 'Hoja de cálculo')
      .replace(/\bDocument\b/g, 'Documento')
      .replace(/\bBrowser\b/g, 'Navegador');
    return out;
  }

  function withSpace(orig, translated) {
    var l = (orig.match(/^\s*/) || [''])[0];
    var r = (orig.match(/\s*$/) || [''])[0];
    return l + translated + r;
  }

  function shouldSkip(el) {
    if (!el) return true;
    if (el.closest) {
      if (el.closest('code,script,style,[data-i18n-skip]')) return true;
    }
    var t = el.tagName ? el.tagName.toLowerCase() : '';
    if (t === 'code' || t === 'script' || t === 'style') return true;
    return false;
  }

  function translateTextNode(n) {
    if (!n || n.nodeType !== 3) return;
    var el = n.parentElement;
    if (!el || shouldSkip(el)) return;
    if (el.classList && el.classList.contains('w')) return;
    var cur = n.nodeValue;
    if (cur == null || !cur.trim()) return;
    if (translating) return;
    var stored = origText.get(n);
    if (lang === 'en') {
      if (stored !== undefined && cur !== stored) {
        translating = true;
        try { n.nodeValue = stored; } catch (e) { /* noop */ }
        translating = false;
      }
      return;
    }
    if (stored !== undefined) {
      var expect = withSpace(stored, translateString(stored.trim()));
      if (cur === expect || cur === stored) {
        if (cur === stored) {
          var t = translateString(stored.trim());
          if (t !== stored.trim()) {
            translating = true;
            try { n.nodeValue = withSpace(stored, t); } catch (e) { /* noop */ }
            translating = false;
          }
        }
        return;
      }
      stored = undefined;
    }
    var orig = cur;
    var t2 = translateString(orig.trim());
    if (t2 !== orig.trim()) {
      origText.set(n, orig);
      translating = true;
      try { n.nodeValue = withSpace(orig, t2); } catch (e) { /* noop */ }
      translating = false;
    }
  }

  function translateAttr(el, attr) {
    if (!el || !el.getAttribute) return;
    if (shouldSkip(el) && attr !== 'placeholder') {
      if (el.hasAttribute && el.hasAttribute('data-i18n-skip')) return;
    }
    if (el.closest && el.closest('[data-i18n-skip]') && el.tagName !== 'INPUT') return;
    var cur;
    try { cur = el.getAttribute(attr); } catch (e) { return; }
    if (cur == null || !cur.trim()) return;
    var key = attr;
    var stored = origAttr.get(el);
    if (lang === 'en') {
      if (stored && stored[key] !== undefined && cur !== stored[key]) {
        translating = true;
        try { el.setAttribute(attr, stored[key]); } catch (e) { /* noop */ }
        translating = false;
      }
      return;
    }
    if (stored && stored[key] !== undefined) {
      var exp = translateString(stored[key].trim());
      if (cur === stored[key] || cur === withSpace(stored[key], exp)) {
        if (cur === stored[key] && exp !== stored[key].trim()) {
          translating = true;
          try { el.setAttribute(attr, withSpace(stored[key], exp)); } catch (e) { /* noop */ }
          translating = false;
        }
        return;
      }
    }
    var t = translateString(cur.trim());
    if (t !== cur.trim()) {
      var m = origAttr.get(el) || {};
      if (m[key] === undefined) m[key] = cur;
      origAttr.set(el, m);
      translating = true;
      try { el.setAttribute(attr, withSpace(cur, t)); } catch (e) { /* noop */ }
      translating = false;
    }
  }

  function translateContainer(el) {
    if (!el) return;
    var cur = el.textContent || '';
    if (!cur.trim()) return;
    if (el.closest && el.closest('[data-i18n-skip]')) return;
    if (lang === 'en') {
      var o = origElem.get(el);
      if (o !== undefined && cur !== o) {
        translating = true;
        try { el.textContent = o; } catch (e) { /* noop */ }
        translating = false;
      }
      return;
    }
    var stored = origElem.get(el);
    if (stored !== undefined) {
      var ex = translateString(stored.trim());
      if (cur === stored || cur === withSpace(stored, ex)) {
        if (cur === stored && ex !== stored.trim()) {
          translating = true;
          try { el.textContent = withSpace(stored, ex); } catch (e) { /* noop */ }
          translating = false;
        }
        return;
      }
    }
    var t = translateString(cur.trim());
    if (t !== cur.trim()) {
      if (origElem.get(el) === undefined) origElem.set(el, cur);
      translating = true;
      try { el.textContent = withSpace(cur, t); } catch (e) { /* noop */ }
      translating = false;
    }
  }

  function translateTree(root) {
    if (lang !== 'es') return;
    var w;
    try { w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); } catch (e) { return; }
    var nodes = [];
    var n;
    while ((n = w.nextNode())) nodes.push(n);
    nodes.forEach(translateTextNode);
    var els = [];
    try { els = root.querySelectorAll ? Array.prototype.slice.call(root.querySelectorAll('[placeholder],[aria-label],[title]')) : []; } catch (e) { els = []; }
    if (root.getAttribute && (root.hasAttribute('placeholder') || root.hasAttribute('aria-label') || root.hasAttribute('title'))) els.push(root);
    els.forEach(function (el) {
      if (el.hasAttribute('placeholder')) translateAttr(el, 'placeholder');
      if (el.hasAttribute('aria-label')) translateAttr(el, 'aria-label');
      if (el.hasAttribute('title')) translateAttr(el, 'title');
    });
    try {
      Array.prototype.forEach.call(document.querySelectorAll('#resumeHero,.sim-title'), translateContainer);
    } catch (e) { /* noop */ }
  }

  function restoreAll() {
    translating = true;
    try {
      var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      var n;
      var ns = [];
      while ((n = w.nextNode())) ns.push(n);
      ns.forEach(function (t) {
        var o = origText.get(t);
        if (o !== undefined && t.nodeValue !== o) { try { t.nodeValue = o; } catch (e) { /* noop */ } }
      });
      var els = document.querySelectorAll('[placeholder],[aria-label],[title]');
      Array.prototype.forEach.call(els, function (el) {
        var m = origAttr.get(el);
        if (!m) return;
        Object.keys(m).forEach(function (k) {
          try { if (el.getAttribute(k) !== m[k]) el.setAttribute(k, m[k]); } catch (e) { /* noop */ }
        });
      });
      Array.prototype.forEach.call(document.querySelectorAll('#resumeHero,.sim-title'), function (el) {
        var o = origElem.get(el);
        if (o !== undefined && el.textContent !== o) { try { el.textContent = o; } catch (e) { /* noop */ } }
      });
    } catch (e) { /* noop */ }
    translating = false;
  }

  var obs = null;
  function observe() {
    if (obs) return;
    try {
      obs = new MutationObserver(function (muts) {
        if (translating || lang !== 'es') return;
        muts.forEach(function (m) {
          if (m.type === 'characterData') translateTextNode(m.target);
          else if (m.type === 'attributes') translateAttr(m.target, m.attributeName);
          else if (m.type === 'childList') {
            Array.prototype.forEach.call(m.addedNodes, function (nd) {
              if (nd.nodeType === 3) translateTextNode(nd);
              else if (nd.nodeType === 1) translateTree(nd);
            });
            try {
              Array.prototype.forEach.call(document.querySelectorAll('#resumeHero,.sim-title'), translateContainer);
            } catch (e) { /* noop */ }
          }
        });
      });
      obs.observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['placeholder', 'aria-label', 'title'] });
    } catch (e) { /* noop */ }
  }

  function paintButtons() {
    try {
      var btns = document.querySelectorAll('.lang-switch__btn');
      Array.prototype.forEach.call(btns, function (b) {
        var on = b.getAttribute('data-lang') === lang;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
    } catch (e) { /* noop */ }
  }

  function applyLang() {
    try { document.documentElement.lang = lang; } catch (e) { /* noop */ }
    paintButtons();
    if (lang === 'es') translateTree(document.body);
    else restoreAll();
  }

  function getLang() { return lang; }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](lang); } catch (e) { /* one listener never blocks the rest */ }
    }
  }

  /* Number/date formatting follows the active locale (es-CO / en-US). */
  function intlLocale() { return lang === 'es' ? 'es-CO' : 'en-US'; }
  function formatNumber(n) {
    try { return new Intl.NumberFormat(intlLocale()).format(Number(n)); } catch (e) { return String(n); }
  }

  function setLang(next) {
    if (next !== 'es' && next !== 'en') return;
    if (next === lang) { applyLang(); emit(); return; }
    lang = next;
    try { window.localStorage.setItem(KEY, lang); } catch (e) { /* noop */ }
    try { if (window.retoma && window.retoma.setLang) window.retoma.setLang(lang); } catch (e) { /* noop */ }
    applyLang();
    emit();
  }

  function mount() {
    try {
      var s = window.localStorage.getItem(KEY);
      if (s === 'es' || s === 'en') lang = s;
    } catch (e) { lang = 'es'; }
    if (lang !== 'es' && lang !== 'en') lang = 'es';
    /* Tell the main process at launch so the tray and native notification
     * follow the language the person reads the app in. */
    try { if (window.retoma && window.retoma.setLang) window.retoma.setLang(lang); } catch (e) { /* noop */ }
    try {
      var btns = document.querySelectorAll('.lang-switch__btn');
      Array.prototype.forEach.call(btns, function (b) {
        b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); });
      });
    } catch (e) { /* noop */ }
    applyLang();
    observe();
    if (lang === 'es') {
      setTimeout(function () { if (lang === 'es') translateTree(document.body); }, 50);
      setTimeout(function () { if (lang === 'es') translateTree(document.body); }, 400);
    }
    emit();
  }

  /* t(): the string in the current language, for values that are not DOM text (an input's value). */
  function t(s) { return lang === 'es' ? translateString(s) : s; }

  return { mount: mount, setLang: setLang, getLang: getLang, t: t, onChange: onChange, formatNumber: formatNumber, locale: intlLocale };
})();
window.I18n = I18n;
