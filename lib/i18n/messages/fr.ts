import type { Messages } from "./en";

export const fr: Messages = {
  "app.name": "Inbox Buddy",
  "app.description": "Résumé quotidien de vos e-mails et cartes de spam",

  "prefs.language": "Langue",
  "prefs.legalEnglishOnly": "Les Conditions et la Politique de confidentialité sont disponibles en anglais uniquement.",
  "prefs.theme": "Thème",
  "prefs.theme.light": "Clair",
  "prefs.theme.dark": "Sombre",
  "prefs.theme.system": "Système",

  "signin.tagline":
    "Connectez Gmail pour recevoir chaque jour un résumé de vos e-mails récents, et un onglet spam qui aide à repérer les messages promotionnels que votre dossier de courrier indésirable a pu laisser passer.",
  "signin.continue": "Continuer avec Google",
  "signin.agreePrefix": "En continuant, vous acceptez nos",
  "signin.and": "et notre",
  "legal.terms": "Conditions d'utilisation",
  "legal.privacy": "Politique de confidentialité",
  "legal.back": "Retour à Inbox Buddy",
  "legal.englishOnly": "Ce document est disponible en anglais uniquement.",

  "consent.title": "Avant de continuer",
  "consent.ai":
    "Lorsque les fonctions d'IA sont activées, l'expéditeur, l'objet et un court aperçu de vos e-mails récents sont envoyés à l'API Gemini de Google (offre payante, que Google n'utilise pas pour améliorer ses produits) pour rédiger votre résumé et repérer le spam. Lorsqu'elles sont désactivées, rien n'est envoyé à Gemini.",
  "consent.accuracy":
    "Les résumés et les signalements de spam peuvent être incomplets ou erronés. Vérifiez toujours votre boîte de réception pour tout ce qui est urgent ou important.",
  "consent.actions":
    "Supprimer place un message dans la corbeille. Se désabonner contacte l'expéditeur et archive le message. Ces deux actions s'appliquent immédiatement à votre compte Gmail.",
  "consent.scope":
    "Ne connectez pas une boîte contenant de la correspondance juridique confidentielle, médicale ou liée à des comptes financiers.",
  "consent.checkboxPrefix": "J'ai 18 ans ou plus, et j'ai lu et j'accepte les",
  "consent.agree": "Accepter et continuer",
  "consent.continuing": "Un instant…",
  "consent.signOut": "Pas maintenant, me déconnecter",
  "consent.saveFailed": "Nous n'avons pas pu enregistrer votre accord. Réessayez dans un instant.",
  "consent.notSetUp":
    "Inbox Buddy n'est pas encore entièrement configuré et ne peut donc pas enregistrer votre accord. Contactez {email} et réessayez plus tard.",

  "auth.title.AccessDenied": "Ce compte Google ne peut pas utiliser Inbox Buddy",
  "auth.body.AccessDenied":
    "Inbox Buddy fonctionne uniquement sur invitation, et ce compte Google ne figure pas sur la liste (ou son adresse e-mail n'est pas vérifiée par Google). Si vous avez été invité, connectez-vous avec le compte Google que vous nous avez indiqué.",
  "auth.title.Verification": "Ce lien de connexion a expiré",
  "auth.body.Verification": "La demande de connexion n'est plus valide. Recommencez pour en obtenir une nouvelle.",
  "auth.title.Configuration": "La connexion ne fonctionne pas pour le moment",
  "auth.body.Configuration":
    "Inbox Buddy n'a pas pu terminer la connexion à cause d'un problème de notre côté. Réessayez plus tard.",
  "auth.title.default": "La connexion a échoué",
  "auth.body.default": "Un problème est survenu lors de la connexion avec Google. Veuillez réessayer.",
  "auth.contact": "Des questions ? Contactez {email}.",
  "auth.tryDifferent": "Essayer un autre compte Google",
  "auth.tryAgain": "Réessayer",

  "header.signOut": "Se déconnecter",

  "tabs.label": "Vues de la boîte de réception",
  "tabs.summary": "Résumé du jour",
  "tabs.today": "Courrier du jour",
  "tabs.spam": "Cartes de spam",
  "tabs.spamCount_one": "{count} e-mail suspecté de spam",
  "tabs.spamCount_other": "{count} e-mails suspectés de spam",

  "summary.count_one": "{count} message ces dernières 24 heures",
  "summary.count_other": "{count} messages ces dernières 24 heures",
  "summary.truncated": "Affichage des {shown} plus récents sur environ {total} messages des dernières 24 heures",
  "summary.updated": "Mis à jour à {time}",
  "summary.refresh": "Actualiser",
  "summary.refreshing": "Actualisation…",
  "summary.empty": "Aucun message ces dernières 24 heures.",
  "summary.ai.generated":
    "Résumé généré par IA. Il peut omettre ou déformer des informations : vérifiez votre boîte de réception pour tout ce qui est important.",
  "summary.ai.off":
    "Les fonctions d'IA sont désactivées : le courrier du jour est trié par des règles simples au lieu d'être résumé. Vérifiez votre boîte de réception pour tout ce qui est important.",
  "summary.ai.unavailable":
    "Le résumé par IA n'est pas disponible pour le moment, voici donc une liste simple basée sur des règles. Vérifiez votre boîte de réception pour tout ce qui est important.",
  "summary.ai.budget":
    "Le quota d'IA du jour est épuisé : voici donc une liste simple basée sur des règles. Les résumés par IA reviennent à {time}. Vérifiez votre boîte de réception pour tout ce qui est important.",
  "summary.group.toCheck": "Messages à vérifier ({count})",
  "summary.group.bulk": "Probablement promotionnels ou envois groupés ({count})",
  "summary.allMessages": "Tous les messages ({count})",
  "summary.openInGmail": "Ouvrir dans Gmail",
  "summary.openInGmailAria": "Ouvrir « {subject} » dans Gmail",

  "spam.ai.generated":
    "Signalés par IA. Ce sont des suggestions qui peuvent être erronées : vérifiez chacune avant d'agir.",
  "spam.ai.off":
    "Signalés par des règles simples (l'IA est désactivée). Ce sont des suggestions qui peuvent être erronées : vérifiez chacune avant d'agir.",
  "spam.ai.unavailable":
    "La détection du spam par IA n'est pas disponible pour le moment : ces messages ont été signalés par des règles simples. Vérifiez chacun avant d'agir.",
  "spam.ai.budget":
    "Le quota d'IA du jour est épuisé : jusqu'à {time}, le spam est détecté par des règles simples. Ce sont des suggestions qui peuvent être erronées : vérifiez chacune avant d'agir.",
  "spam.unchecked_one": "{count} autre e-mail suspect n'a pas encore été vérifié.",
  "spam.unchecked_other": "{count} autres e-mails suspects n'ont pas encore été vérifiés.",
  "spam.uncheckedBudget_one":
    "{count} autre e-mail suspect sera vérifié par l'IA à {time}, quand le quota d'IA du jour sera renouvelé.",
  "spam.uncheckedBudget_other":
    "{count} autres e-mails suspects seront vérifiés par l'IA à {time}, quand le quota d'IA du jour sera renouvelé.",
  "spam.checkMore": "Vérifier maintenant",
  "spam.checking": "Vérification…",
  "spam.empty": "Aucun spam suspecté dans votre boîte de réception ces dernières 24 heures.",
  "spam.reason.marketing": "Ressemble à du marketing ou à une promotion",
  "spam.reason.newsletter": "Ressemble à une newsletter ou à un envoi groupé",
  "spam.reason.cold_outreach": "Ressemble à une prospection non sollicitée",
  "spam.reason.phishing_pattern": "Présente des signes courants d'hameçonnage",
  "spam.reason.legitimate": "Semble légitime",
  "spam.delete": "Supprimer",
  "spam.unsubscribe": "Se désabonner",
  "spam.unsubscribeHint": "Demande à l'expéditeur de vous désabonner, puis archive ce message",
  "spam.openUnsubscribePage": "Ouvrir la page de désabonnement",
  "spam.openUnsubscribePageHint":
    "Ouvre la page de désabonnement de l'expéditeur dans un nouvel onglet ; une confirmation peut y être demandée",
  "spam.emailToUnsubscribe": "E-mail de désabonnement",
  "spam.emailToUnsubscribeHint": "Ouvre dans Gmail un e-mail de désabonnement prérempli, à envoyer vous-même",
  "spam.finishOnSenderPage":
    "Terminez le désabonnement sur la page de l'expéditeur, puis supprimez ce message ou marquez-le comme non spam.",
  "spam.finishInGmail":
    "Envoyez l'e-mail prérempli dans Gmail pour terminer le désabonnement, puis supprimez ce message ou marquez-le comme non spam.",
  "spam.noUnsubscribe": "Cet expéditeur ne propose pas d'option de désabonnement.",
  "spam.notSpam": "Pas un spam",
  "spam.notSpamHint": "Ne plus signaler ce message",
  "spam.working": "En cours…",
  "spam.openInGmail": "Ouvrir dans Gmail",

  "confirm.title": "Supprimer cet e-mail ?",
  "confirm.body":
    "De {name} : « {subject} ». Il sera placé dans la corbeille de Gmail, et vous pourrez annuler pendant quelques secondes.",
  "confirm.cancel": "Annuler",
  "confirm.delete": "Supprimer",

  "toast.deleted": "« {subject} » a été placé dans la corbeille.",
  "toast.unsubscribed": "Désabonnement de {name} effectué et message archivé.",
  "toast.unsubscribedNotArchived":
    "Désabonnement de {name} effectué, mais le message n'a pas pu être archivé. Il est toujours dans votre boîte de réception.",
  "toast.notSpam": "« {subject} » a été marqué comme non spam. Il ne sera plus signalé.",
  "toast.undone": "Annulé.",
  "toast.undoFailed": "Impossible d'annuler. Vérifiez le message dans Gmail.",
  "toast.undo": "Annuler",
  "toast.dismiss": "Fermer",

  "errors.summaryLoad": "Inbox Buddy n'a pas pu charger le courrier du jour. Réessayez dans un instant.",
  "errors.spamLoad": "Inbox Buddy n'a pas pu vérifier le spam. Réessayez dans un instant.",
  "errors.action": "Cela n'a pas fonctionné. Réessayez dans un instant.",
  "errors.network": "Impossible de joindre Inbox Buddy. Vérifiez votre connexion et réessayez.",
  "errors.timeout": "Inbox Buddy met trop de temps à répondre. Vérifiez votre connexion et réessayez.",
  "errors.slow": "Cela prend plus de temps que d'habitude…",
  "errors.gmail_reconnect": "Inbox Buddy n'a plus accès à votre Gmail. Reconnectez-le pour continuer.",
  "errors.gmail_unavailable": "Impossible de joindre Gmail pour le moment. Réessayez dans un instant.",
  "errors.rate_limited": "Vous faites cela trop souvent. Réessayez sous peu.",
  "errors.unauthenticated": "Votre session a pris fin. Reconnectez-vous pour continuer.",
  "errors.consent_required": "Veuillez d'abord accepter les Conditions et la Politique de confidentialité.",
  "errors.no_unsubscribe": "Cet expéditeur ne prend pas en charge le désabonnement en un clic.",
  "errors.unsubscribe_unsafe": "Le lien de désabonnement de cet expéditeur n'est pas autorisé.",
  "errors.unsubscribe_rejected": "L'expéditeur n'a pas accepté la demande de désabonnement. Vous êtes toujours abonné.",
  "errors.unsubscribe_failed":
    "Impossible de joindre l'expéditeur pour vous désabonner. Vous êtes toujours abonné. Réessayez plus tard.",
  "errors.retry": "Réessayer",
  "errors.reconnect": "Reconnecter Gmail",

  "footer.yourData": "Vos données",
  "footer.accountId": "Identifiant du compte",
  "footer.dataIntro": "Écrivez-nous depuis l'adresse de ce compte pour",
  "footer.requestCopy": "demander une copie",
  "footer.or": "ou",
  "footer.requestDeletion": "demander leur suppression",
  "footer.dataOutro": " ; le lien ajoute un code qui prouve que la demande vient de vous.",

  "notFound.title": "Page introuvable",
  "notFound.body": "La page que vous cherchez n'existe pas ou a peut-être été déplacée.",
  "error.title": "Une erreur s'est produite",
  "error.body": "Une erreur inattendue s'est produite. Vous pouvez réessayer ou revenir au tableau de bord.",
};
