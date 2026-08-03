# Contexte du projet Belloria

## Objectif

Automatiser le traitement des demandes commerciales reçues sur Gmail, maintenir le CRM Belloria dans Notion et permettre le pilotage ainsi que les comptes rendus depuis un bot Telegram privé.

Le volume attendu est faible : quelques demandes de devis par jour. Le système doit rester simple, économique, traçable et facile à reprendre.

## Périmètre fonctionnel visé

- Détecter les emails commerciaux pertinents sans analyser les newsletters et notifications sans intérêt.
- Extraire directement les formulaires Tally structurés.
- Utiliser ChatGPT Work uniquement lorsqu'une qualification ou une compréhension en langage naturel est nécessaire.
- Rechercher, créer ou mettre à jour le contact et l'opportunité correspondants dans Notion.
- Envoyer un compte rendu sur Telegram.
- Recevoir des commandes Telegram en texte ou en vocal.
- Préparer les réponses Gmail et demander une validation avant envoi.

## Architecture retenue à ce stade

- Gmail applique des filtres et labels aux messages candidats.
- Une tâche ChatGPT Work cloud consulte périodiquement les éléments à traiter.
- Notion constitue la source de vérité du CRM métier.
- Le canal mobile actif est un bot Telegram privé sur Cloudflare Workers, limité à un seul identifiant de chat Belloria.
- D1 dédoublonne les commandes ; Workers AI transcrit les vocaux sans conserver les fichiers audio.
- La voie WhatsApp Cloud API officielle est abandonnée depuis le 2026-08-03 ; aucune demande d'examen Meta ni configuration de secrets ne doit être reprise.
- Le code Cloud API et la route Meta sont retirés du Worker actif ; les acquis du prototype restent dans l'historique Git et la documentation gelée.
- Le prototype WAHA Core/NOWEB reste désactivé comme historique et n'est pas une cible d'activation.

Cette architecture reste susceptible d'évoluer après validation du prototype. Les décisions durables sont consignées dans `docs/decisions/`.

## Flux principal envisagé

1. Gmail reçoit un email et applique un label de qualification initiale.
2. ChatGPT Work récupère les nouveaux candidats lors de son prochain passage.
3. Les messages Tally sont parsés sans IA ; les emails libres sont qualifiés si nécessaire.
4. Le système recherche un doublon par email, téléphone, date et type d'événement.
5. Le CRM Notion est créé ou actualisé.
6. Un compte rendu est envoyé sur le chat Telegram privé par le MCP Belloria.
7. Le message est marqué comme traité de manière idempotente.

## Contraintes importantes

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
- Événementiel Pour Tous.

Les emails promotionnels, notifications sociales et factures techniques doivent être exclus avant tout traitement IA.

## État actuel

Le projet est en phase de prototypage. BELL-016 remplace le canal WhatsApp par un bot Telegram privé sur le Worker Cloudflare existant, avec D1 pour l'idempotence et Workers AI pour les vocaux. L'activation distante attend uniquement la création du bot de test et la configuration de ses secrets.
