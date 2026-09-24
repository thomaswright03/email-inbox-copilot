import type { Messages } from "./en";

export const es: Messages = {
  "app.name": "Inbox Buddy",
  "app.description": "Resumen diario del correo y tarjetas de spam",

  "prefs.language": "Idioma",
  "prefs.legalEnglishOnly": "Los Términos y la Política de privacidad solo están disponibles en inglés.",
  "prefs.theme": "Tema",
  "prefs.theme.light": "Claro",
  "prefs.theme.dark": "Oscuro",
  "prefs.theme.system": "Sistema",

  "signin.tagline":
    "Conecta Gmail para recibir un resumen diario de tu correo reciente y una pestaña de spam que ayuda a detectar mensajes promocionales que tu carpeta de correo no deseado pudo pasar por alto.",
  "signin.continue": "Continuar con Google",
  "signin.agreePrefix": "Al continuar, aceptas nuestros",
  "signin.and": "y la",
  "legal.terms": "Términos del servicio",
  "legal.privacy": "Política de privacidad",
  "legal.back": "Volver a Inbox Buddy",
  "legal.englishOnly": "Este documento solo está disponible en inglés.",

  "consent.title": "Antes de continuar",
  "consent.ai":
    "Cuando las funciones de IA están activadas, el remitente, el asunto y una vista previa breve de tus correos recientes se envían a la API Gemini de Google (nivel de pago, que Google no usa para mejorar sus productos) para escribir tu resumen y detectar spam. Cuando están desactivadas, no se envía nada a Gemini.",
  "consent.accuracy":
    "Los resúmenes y las marcas de spam pueden estar incompletos o ser incorrectos. Revisa siempre tu bandeja de entrada para todo lo urgente o importante.",
  "consent.actions":
    "Eliminar mueve un mensaje a la papelera. Cancelar suscripción contacta al remitente y archiva el mensaje. Ambas acciones afectan a tu cuenta de Gmail de inmediato.",
  "consent.scope":
    "No conectes un buzón con correspondencia legal confidencial, médica o de cuentas financieras.",
  "consent.checkboxPrefix": "Tengo 18 años o más, y he leído y acepto los",
  "consent.agree": "Aceptar y continuar",
  "consent.continuing": "Continuando…",
  "consent.signOut": "Ahora no, cerrar sesión",
  "consent.saveFailed": "No pudimos guardar tu aceptación. Inténtalo de nuevo en un momento.",
  "consent.notSetUp":
    "Inbox Buddy aún no está completamente configurado, así que no puede registrar tu aceptación. Escribe a {email} y vuelve a intentarlo más tarde.",

  "auth.title.AccessDenied": "Esta cuenta de Google no puede usar Inbox Buddy",
  "auth.body.AccessDenied":
    "Inbox Buddy funciona solo por invitación, y esta cuenta de Google no está en la lista (o su dirección de correo no está verificada con Google). Si te invitamos, inicia sesión con la cuenta de Google que nos diste.",
  "auth.title.Verification": "Ese enlace de inicio de sesión ha caducado",
  "auth.body.Verification": "La solicitud de inicio de sesión ya no es válida. Empieza de nuevo para obtener una nueva.",
  "auth.title.Configuration": "El inicio de sesión no funciona en este momento",
  "auth.body.Configuration":
    "Inbox Buddy no pudo completar el inicio de sesión por un problema nuestro. Inténtalo de nuevo más tarde.",
  "auth.title.default": "No se pudo iniciar sesión",
  "auth.body.default": "Algo salió mal al iniciar sesión con Google. Inténtalo de nuevo.",
  "auth.contact": "¿Preguntas? Escribe a {email}.",
  "auth.tryDifferent": "Probar con otra cuenta de Google",
  "auth.tryAgain": "Intentar de nuevo",

  "header.signOut": "Cerrar sesión",

  "tabs.label": "Vistas de la bandeja",
  "tabs.summary": "Resumen de hoy",
  "tabs.today": "Correo de hoy",
  "tabs.spam": "Tarjetas de spam",
  "tabs.spamCount_one": "{count} correo sospechoso de spam",
  "tabs.spamCount_other": "{count} correos sospechosos de spam",

  "summary.count_one": "{count} mensaje en las últimas 24 horas",
  "summary.count_other": "{count} mensajes en las últimas 24 horas",
  "summary.truncated": "Se muestran los {shown} más recientes de unos {total} mensajes de las últimas 24 horas",
  "summary.updated": "Actualizado a las {time}",
  "summary.refresh": "Actualizar",
  "summary.refreshing": "Actualizando…",
  "summary.empty": "No hay mensajes en las últimas 24 horas.",
  "summary.ai.generated":
    "Resumen generado por IA. Puede omitir o describir mal cosas, así que revisa tu bandeja para todo lo importante.",
  "summary.ai.off":
    "Las funciones de IA están desactivadas, así que el correo de hoy se ordena con reglas sencillas en lugar de resumirse. Revisa tu bandeja para todo lo importante.",
  "summary.ai.unavailable":
    "El resumen con IA no está disponible en este momento, así que esta es una lista sencilla basada en reglas. Revisa tu bandeja para todo lo importante.",
  "summary.ai.budget":
    "La cuota diaria de IA se ha agotado, así que esta es una lista sencilla basada en reglas. Los resúmenes con IA vuelven a las {time}. Revisa tu bandeja para todo lo importante.",
  "summary.group.toCheck": "Mensajes para revisar ({count})",
  "summary.group.bulk": "Probablemente promocionales o masivos ({count})",
  "summary.allMessages": "Todos los mensajes ({count})",
  "summary.openInGmail": "Abrir en Gmail",
  "summary.openInGmailAria": "Abrir «{subject}» en Gmail",

  "spam.ai.generated":
    "Marcados por IA. Son sugerencias y pueden ser incorrectas, así que revisa cada una antes de actuar.",
  "spam.ai.off":
    "Marcados con reglas sencillas (la IA está desactivada). Son sugerencias y pueden ser incorrectas, así que revisa cada una antes de actuar.",
  "spam.ai.unavailable":
    "La detección de spam con IA no está disponible en este momento, así que estos se marcaron con reglas sencillas. Revisa cada uno antes de actuar.",
  "spam.ai.budget":
    "La cuota diaria de IA se ha agotado, así que hasta las {time} el spam se detecta con reglas sencillas. Son sugerencias y pueden ser incorrectas, así que revisa cada una antes de actuar.",
  "spam.unchecked_one": "{count} posible correo de spam más aún no se ha revisado.",
  "spam.unchecked_other": "{count} posibles correos de spam más aún no se han revisado.",
  "spam.uncheckedBudget_one":
    "{count} posible correo de spam más se revisará con IA a las {time}, cuando se renueve la cuota diaria de IA.",
  "spam.uncheckedBudget_other":
    "{count} posibles correos de spam más se revisarán con IA a las {time}, cuando se renueve la cuota diaria de IA.",
  "spam.checkMore": "Revisar ahora",
  "spam.checking": "Revisando…",
  "spam.empty": "No hay spam sospechoso en tu bandeja de las últimas 24 horas.",
  "spam.reason.marketing": "Parece marketing o una promoción",
  "spam.reason.newsletter": "Parece un boletín o un envío masivo",
  "spam.reason.cold_outreach": "Parece un contacto comercial no solicitado",
  "spam.reason.phishing_pattern": "Tiene patrones habituales del phishing",
  "spam.reason.legitimate": "Parece legítimo",
  "spam.delete": "Eliminar",
  "spam.unsubscribe": "Cancelar suscripción",
  "spam.unsubscribeHint": "Pide al remitente que cancele tu suscripción y luego archiva este mensaje",
  "spam.openUnsubscribePage": "Abrir página de baja",
  "spam.openUnsubscribePageHint":
    "Abre la página de baja del propio remitente en una pestaña nueva; puede que tengas que confirmar allí",
  "spam.emailToUnsubscribe": "Enviar correo de baja",
  "spam.emailToUnsubscribeHint": "Abre en Gmail un correo de baja ya rellenado para que lo envíes",
  "spam.finishOnSenderPage":
    "Termina la baja en la página del remitente y luego elimina este mensaje o márcalo como no spam.",
  "spam.finishInGmail":
    "Envía el correo ya rellenado en Gmail para terminar la baja y luego elimina este mensaje o márcalo como no spam.",
  "spam.noUnsubscribe": "Este remitente no ofrece una opción para darse de baja.",
  "spam.notSpam": "No es spam",
  "spam.notSpamHint": "Dejar de marcar este correo. Otros correos de este remitente aún pueden marcarse.",
  "spam.working": "Procesando…",
  "spam.openInGmail": "Abrir en Gmail",

  "confirm.title": "¿Eliminar este correo?",
  "confirm.body":
    "De {name}: «{subject}». Se moverá a la papelera de Gmail. Puedes deshacerlo aquí durante unos segundos y recuperarlo de la papelera de Gmail durante 30 días.",
  "confirm.cancel": "Cancelar",
  "confirm.delete": "Eliminar",

  "toast.deleted": "«{subject}» se movió a la papelera.",
  "toast.unsubscribed": "Se canceló la suscripción a {name} y se archivó el mensaje.",
  "toast.unsubscribedNotArchived":
    "Se canceló la suscripción a {name}, pero no se pudo archivar el mensaje. Sigue en tu bandeja de entrada.",
  "toast.notSpam":
    "«{subject}» se marcó como no spam. Este correo no se volverá a marcar; otros correos del remitente sí pueden marcarse.",
  "toast.undone": "Deshecho.",
  "toast.undoFailed": "No se pudo deshacer. Revisa el mensaje en Gmail.",
  "toast.undo": "Deshacer",
  "toast.dismiss": "Cerrar",

  "errors.summaryLoad": "Inbox Buddy no pudo cargar el correo de hoy. Inténtalo de nuevo en un momento.",
  "errors.spamLoad": "Inbox Buddy no pudo revisar el spam. Inténtalo de nuevo en un momento.",
  "errors.action": "No funcionó. Inténtalo de nuevo en un momento.",
  "errors.network": "No se pudo conectar con Inbox Buddy. Revisa tu conexión e inténtalo de nuevo.",
  "errors.timeout": "Inbox Buddy está tardando demasiado en responder. Revisa tu conexión e inténtalo de nuevo.",
  "errors.slow": "Esto está tardando más de lo habitual…",
  "errors.gmail_reconnect": "Inbox Buddy perdió el acceso a tu Gmail. Vuelve a conectarlo para continuar.",
  "errors.gmail_unavailable": "No se pudo conectar con Gmail en este momento. Inténtalo de nuevo en un momento.",
  "errors.rate_limited": "Lo estás haciendo con demasiada frecuencia. Inténtalo de nuevo en breve.",
  "errors.unauthenticated": "Tu sesión ha terminado. Vuelve a iniciar sesión para continuar.",
  "errors.consent_required": "Primero acepta los Términos y la Política de privacidad.",
  "errors.no_unsubscribe": "Este remitente no admite la baja con un clic.",
  "errors.unsubscribe_unsafe": "El enlace de baja de este remitente no está permitido.",
  "errors.unsubscribe_rejected": "El remitente no aceptó la solicitud de baja. Sigues suscrito.",
  "errors.unsubscribe_failed":
    "No se pudo contactar con el remitente para darte de baja. Sigues suscrito. Inténtalo más tarde.",
  "errors.retry": "Intentar de nuevo",
  "errors.reconnect": "Volver a conectar Gmail",
  "errors.signInAgain": "Volver a iniciar sesión",

  "footer.yourData": "Tus datos",
  "footer.accountId": "Tu número de referencia para solicitudes de datos:",
  "footer.dataIntro": "Escríbenos desde la dirección de esta cuenta para",
  "footer.requestCopy": "pedir una copia",
  "footer.or": "o",
  "footer.requestDeletion": "pedir su eliminación",
  "footer.dataOutro": "; el enlace incluye un código que demuestra que la solicitud es tuya.",

  "notFound.title": "Página no encontrada",
  "notFound.body": "La página que buscas no existe o puede haberse movido.",
  "error.title": "Algo salió mal",
  "error.body": "Ocurrió un error inesperado. Puedes intentarlo de nuevo o volver al panel.",
};
