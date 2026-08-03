# BELL-016 — Bot Telegram privé sur Cloudflare

Statut: ready_for_review
Branche: `codex/bell-016-bot-telegram-cloudflare`
Dernière mise à jour: 2026-08-03

## Objectif

Remplacer le canal WhatsApp abandonné par un bot Telegram privé hébergé sur Cloudflare Workers, capable d'envoyer les comptes rendus et de recevoir des commandes texte ou vocales sans serveur persistant.

## Critères de réussite

- Le webhook Telegram vérifie le secret fourni par Telegram et refuse tout chat autre que le compte Belloria autorisé.
- Les commandes texte sont conservées de manière idempotente dans D1 et exposées au passage ChatGPT Work par MCP.
- Les vocaux sont téléchargés avec une taille bornée, transcrits par Workers AI et supprimés sans stockage audio durable.
- Le MCP envoie un texte uniquement vers le chat configuré et seulement après confirmation explicite.
- Aucun jeton, identifiant de chat, texte réel ou audio réel n'est écrit dans les journaux ou dans Git.
- Les tests utilisent uniquement des doubles et ne contactent ni Telegram, ni Cloudflare AI, ni Gmail, ni Notion réels.
- Le runbook permet de créer le bot, configurer les secrets, enregistrer le webhook et revenir en arrière.

## Fichiers concernés

- `worker/src/index.js`
- `worker/test/worker.test.js`
- `worker/migrations/0002_telegram_commands.sql`
- `wrangler.jsonc`
- `.dev.vars.example`
- `docs/telegram-cloudflare.md`
- `docs/chatgpt-work-automation.md`
- `docs/mcp-server.md`
- `docs/PROJECT_CONTEXT.md`
- `docs/decisions/008-canal-telegram-cloudflare.md`
- `CURRENT_TASK.md`
- `docs/TASKS.md`

## Prochaine action

Ouvrir BELL-017 pour créer le bot de test avec son identifiant définitif, charger les quatre secrets, enregistrer le webhook et valider un texte et un vocal fictifs de bout en bout.

## Résultat

Le Worker `belloria-assistant` remplace la route Meta par un webhook Telegram privé, conserve les commandes idempotentes dans D1, transcrit les vocaux bornés avec Workers AI et expose quatre outils MCP indépendants du fournisseur. Il est déployé sans secret et ne peut donc accepter aucun webhook ou appel MCP avant BELL-017.

## Validations effectuées

- Compatibilité vérifiée dans les documentations officielles Telegram Bot API et Cloudflare Workers/Workers AI le 2026-08-03.
- Branche et tâche renommées avec l'identifiant BELL-016.
- 8 tests Worker et 40 tests Python réussis ; vérification syntaxique du script de préparation réussie.
- Migration `0002_telegram_commands.sql` appliquée localement puis sur D1 distant sans suppression de donnée.
- Bundle Wrangler validé en `--dry-run` avec les bindings D1 et Workers AI.
- Worker déployé sur `belloria-assistant.belloria-dvitulin.workers.dev` ; `/health` répond HTTP 200 avec `channel=telegram`.
- Webhook et MCP distants répondent HTTP 401 tant que leurs secrets ne sont pas configurés.
- Table distante `telegram_commands` confirmée et liste des secrets du nouveau Worker vide.
- `git diff --check` réussi ; aucun jeton ou identifiant Telegram réel ajouté au dépôt.
