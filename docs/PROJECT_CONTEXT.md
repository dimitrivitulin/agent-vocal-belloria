# Contexte du projet Belloria

## Objectif

Automatiser le traitement des demandes commerciales reçues sur Gmail, maintenir le CRM Belloria dans Notion et fournir un agent commercial privé piloté depuis Telegram. Cet agent doit reconstruire le contexte complet d'un prospect, recommander la meilleure action commerciale et préparer son exécution à partir d'une connaissance Belloria validée.

Le volume attendu est faible : quelques demandes de devis par jour. Le système doit rester simple, économique, traçable et facile à reprendre.

## Périmètre fonctionnel visé

- Détecter les emails commerciaux pertinents sans analyser les newsletters et notifications sans intérêt.
- Extraire directement les formulaires Tally structurés.
- Utiliser ChatGPT Work uniquement lorsqu'une qualification ou une compréhension en langage naturel est nécessaire.
- Rechercher, créer ou mettre à jour le contact et l'opportunité correspondants dans Notion.
- Envoyer un compte rendu sur Telegram.
- Recevoir des commandes Telegram en texte ou en vocal.
- Préparer les réponses Gmail et demander une validation avant envoi.
- Construire un dossier prospect 360 à partir du formulaire, de Gmail, du CRM, des devis réellement envoyés, des factures et du planning confirmé.
- Recommander l'offre, les questions, la relance ou l'action qui maximise la conversion sans inventer de prix, de contenu ou de disponibilité.

## Architecture retenue à ce stade

- Tally envoie directement chaque nouveau formulaire au Worker Cloudflare par webhook signé ; D1 conserve la file anti-perte jusqu'au succès CRM.
- Gmail applique des filtres et labels aux autres messages candidats.
- Une tâche ChatGPT Work cloud consulte périodiquement les éléments à traiter.
- Notion constitue la source de vérité du CRM métier.
- Le canal mobile actif est un bot Telegram privé sur Cloudflare Workers, limité à un seul identifiant de chat Belloria.
- Telegram est l'interface conversationnelle cible de l'agent commercial ; le passage horaire ChatGPT Work reste un mécanisme de synchronisation et de reprise, pas la latence cible des commandes interactives.
- Les recommandations s'appuient sur deux contextes reconstruits : un dossier prospect 360 sourcé et un référentiel commercial Belloria versionné et validé.
- L'agent peut lire les sources autorisées mais ne modifie que le CRM Belloria dans Notion.
- D1 dédoublonne les commandes ; Workers AI transcrit les vocaux sans conserver les fichiers audio.
- La voie WhatsApp Cloud API officielle est abandonnée depuis le 2026-08-03 ; aucune demande d'examen Meta ni configuration de secrets ne doit être reprise.
- Le code Cloud API et la route Meta sont retirés du Worker actif ; les acquis du prototype restent dans l'historique Git et la documentation gelée.
- Le prototype WAHA Core/NOWEB reste désactivé comme historique et n'est pas une cible d'activation.

Cette architecture reste susceptible d'évoluer après validation du prototype. Les décisions durables sont consignées dans `docs/decisions/`.

## Flux principal envisagé

1. Tally transmet les formulaires structurés au Worker ; Gmail qualifie séparément les emails directs et Mariages.net.
2. ChatGPT Work récupère les nouvelles soumissions et les candidats Gmail lors de son prochain passage.
3. Les formulaires Tally sont lus sans IA ; les emails libres sont qualifiés si nécessaire.
4. Le système recherche un doublon par email, téléphone, date et type d'événement.
5. Le CRM Notion est créé ou actualisé.
6. Un compte rendu est envoyé sur le chat Telegram privé par le MCP Belloria.
7. Le message est marqué comme traité de manière idempotente.

## Contraintes importantes

- Le dépôt local doit rester représentatif du dépôt GitHub : toute branche de lot conservée localement et tout commit terminé doivent être publiés sur `origin`, sauf décision explicite de garder un travail local temporaire. Avant livraison, vérifier les écarts local/distant et signaler toute exception.
- Le moteur doit être proportionné à un faible volume et éviter les services d'orchestration payants.
- ChatGPT Work fonctionne par tâche planifiée ; les commandes Telegram attendent dans D1 jusqu'à son prochain passage.
- La voie Cloud API/Meta n'est plus une cible active et ne doit pas être relancée sans nouvelle décision d'architecture.
- La solution WAHA de repli peut être déconnectée ou restreinte par WhatsApp.
- Le bot Telegram est un canal d'administration privé, pas un canal de conversation avec les clients.
- WAHA ne doit jamais être exposé directement à Internet.
- Le jeton Telegram, le secret du webhook, l'identifiant du chat et les éventuelles sessions WAHA sont des secrets critiques et doivent utiliser un stockage protégé ; aucun jeton Meta ne doit être configuré.
- Aucun email client ne doit être envoyé automatiquement au début du projet.

## Sources de demandes observées

- Tally — formulaire « Devis express » ;
- emails directs de prospects et de clients ;
- Mariages.net ;

Les emails promotionnels, notifications sociales et factures techniques doivent être exclus avant tout traitement IA.

## État actuel

Le projet est en phase de prototypage avancé. Le canal Telegram privé est actif sur le Worker Cloudflare avec D1 pour l'idempotence, les approbations à usage unique et Workers AI pour les vocaux. Le MCP déployé est connecté à ChatGPT Work par OAuth 2.1 avec PKCE ; ses sept outils incluent le rafraîchissement atomique d’instantanés prospect temporaires et il conserve puis consomme une action uniquement après une commande Telegram `CONFIRMER <jeton>`. Les commandes couvertes suivent une voie rapide `waitUntil` validée sous une seconde, tandis que le passage horaire reste la reprise. Les filtres Gmail et la synchronisation Notion sont validés ; la tâche `Passage Belloria automatisé` est active toutes les heures. Le CRM opérationnel contient les formulaires Tally récents, dédupliqués et rapprochés des échanges Gmail ; ses vues séparent les clients en cours des clients anciens, les dates passées non honorées sont perdues, et la vue `🔥 À traiter` expose les informations nécessaires à l'action. Le référentiel commercial Notion contient 26 fiches fondées sur le catalogue, les devis, les conversations, les factures et le CRM. Cocktail, Menu et Brunch sont utilisables comme offres cœur validées ; les upsells prouvés, les incompatibilités et les règles encore incertaines sont explicitement tracés. Le contexte prospect 360 est construit à la demande avec provenance, fraîcheur, contradictions et preuves financières strictes ; chaque soumission Tally reste isolée par `messageId`. Le moteur de conversion, l’agent conversationnel Telegram et la boucle anti-perte idempotente sont livrés et validés. Les KPI commerciaux sont calculables localement avec preuves financières strictes, rendus Telegram/Notion et cas de référence permettant de détecter une régression avant activation.
