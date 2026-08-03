# BELL-017 — Activation du bot Telegram de test

Statut: completed
Branche: `codex/bell-017-activation-bot-telegram`
Dernière mise à jour: 2026-08-04

## Objectif

Activer le bot Telegram privé de test sur le Worker Cloudflare déployé, puis valider avec des données fictives la réception idempotente d'une commande texte et la transcription d'un vocal.

## Critères de réussite

- Le bot de test possède un identifiant définitif et n'est utilisé que par le chat privé Belloria autorisé.
- Les quatre secrets sont chargés dans Cloudflare sans être affichés, journalisés ou ajoutés à Git.
- Le webhook Telegram est enregistré avec son secret et répond correctement.
- Un texte fictif apparaît une seule fois dans D1 et peut être lu puis terminé via MCP.
- Un vocal fictif court est transcrit, apparaît une seule fois et ne laisse aucun fichier audio durable.
- Les contrôles d'accès refusent un secret de webhook incorrect et protègent le MCP.
- Le retour arrière par suppression du webhook est vérifié comme immédiatement exploitable.

## Fichiers concernés

- `.dev.vars` (local, exclu de Git)
- `docs/telegram-cloudflare.md`
- `CURRENT_TASK.md`
- `docs/TASKS.md`

## Prochaine action

Ouvrir un nouveau lot pour connecter le MCP déployé à la tâche ChatGPT Work et valider un premier passage planifié avec des données fictives.

## Résultat

Le bot privé `@BelloriaAssistantTestBot` est actif sur le Worker déployé. Les secrets, le webhook, l'idempotence texte, la transcription vocale, la quarantaine d'un vocal vide et le nettoyage des commandes ont été validés avec des données fictives.

## Validations effectuées

- Quatre secrets chargés dans Cloudflare sans valeur ajoutée à Git ; Worker redéployé et webhook enregistré.
- `/health` répond HTTP 200 ; faux secret webhook et faux jeton MCP refusés en HTTP 401.
- Texte fictif reçu via MCP ; rejeu du même `update_id` accepté sans nouvelle insertion (`accepted=0`).
- Deux vocaux fictifs transcrits et un vocal vide mis en quarantaine avec `empty_transcript`.
- Les trois références de fichiers vocaux sont nulles dans D1 ; aucun audio durable n'est conservé.
- Les cinq commandes de test ont été terminées ; la file MCP est vide et aucun contenu terminé ne reste stocké.
