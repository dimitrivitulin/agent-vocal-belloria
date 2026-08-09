# Accusé SMS transactionnel Tally

## Contrat

Une nouvelle soumission Tally persistée dans D1 déclenche en arrière-plan un SMS Brevo au plus une fois. Le rejeu du webhook ne redéclenche aucun appel. Le traitement CRM reste indépendant : une erreur SMS ne retire jamais la soumission de la file `pending`.

Le numéro doit être un mobile français `06` ou `07`, accepté en format national ou `+33`. Plusieurs numéros valides différents, un fixe ou un numéro étranger entraînent `skipped`. Le Worker ne duplique pas le numéro dans les colonnes de suivi.

Modèle à trous : `Bonjour {prenom}, merci pour votre demande. Votre {evenement} du {date} est enregistre. Nous vous recontacterons rapidement. Cyndy & Dimitri, Belloria` Le prénom est dérivé d'un nom structuré non ambigu ; l'événement et la date proviennent exclusivement des champs Tally. Si une valeur manque, est ambiguë ou rend le texte trop long, aucun SMS n'est envoyé et D1 indique `missing_or_invalid_sms_personalization`. Le texte reste ASCII, sous 160 caractères, sans prix ni promesse de disponibilité.

Pour les champs `MULTIPLE_CHOICE`, Tally transmet les identifiants sélectionnés dans `value` et les libellés dans `options`. Le Worker résout ces identifiants avant de construire le SMS ; un identifiant absent ou ambigu n'est jamais utilisé comme texte client.

## Configuration sans secret dans Git

- secret Worker `BREVO_API_KEY` ;
- variable ou secret `BREVO_SMS_SENDER`, après validation de l'identifiant expéditeur `Belloria` chez Brevo ;
- secret Worker `BREVO_WEBHOOK_TOKEN` ;
- migration D1 `0006_tally_sms_ack.sql`.

Configurer ensuite chez Brevo un webhook transactionnel, canal `sms`, vers `/webhooks/brevo-sms`, avec authentification Bearer utilisant `BREVO_WEBHOOK_TOKEN`. Souscrire au minimum aux événements d'acceptation, livraison et échec. Aucun secret ne doit être placé dans l'URL.

## États observables

- `pending` : tentative pas encore terminée ;
- `accepted` : Brevo a accepté l'envoi ;
- `delivered` : callback de livraison reçu ;
- `failed` : appel fournisseur ou livraison en échec ;
- `skipped` : numéro invalide/ambigu, personnalisation obligatoire absente/invalide ou fournisseur non configuré.

Les callbacks appliquent une progression monotone : `pending` peut devenir `accepted`, `failed` ou directement `delivered` ; `accepted` peut devenir `failed` ou `delivered` ; `failed` ne peut plus redevenir `accepted`, mais une preuve ultérieure de livraison peut le faire passer à `delivered`. L'état `delivered` est terminal, tout comme `skipped`. Un callback identique ou moins fiable est un no-op et ne modifie pas `sms_updated_at`. Cette politique s'applique au rapprochement par identifiant Brevo et au rapprochement précoce par tag Tally, ce dernier restant limité aux lignes encore `pending`.

`belloria_list_tally_submissions` expose ces métadonnées techniques et un code d'erreur assaini, sans numéro ni contenu SMS. Le payload Tally reste soumis à son effacement après succès CRM.

## Activation contrôlée

1. Valider le compte, les crédits SMS et l'identifiant expéditeur Brevo.
2. Appliquer la migration distante et configurer les trois secrets/variables.
3. Déployer le Worker et créer le webhook Brevo authentifié.
4. Envoyer d'abord une soumission contrôlée vers un numéro appartenant à Belloria, après confirmation explicite.
5. Vérifier `accepted`, puis `delivered`, le SMS reçu, l'absence de second envoi au rejeu et le maintien du flux CRM.

Le SMS transactionnel français n'exige pas de mention STOP selon la documentation Brevo actuelle, mais le message doit rester strictement informatif. Toute relance ou promotion relève d'un autre consentement et d'un autre lot.
