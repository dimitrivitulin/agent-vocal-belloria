# BELL-018 — Connexion MCP à ChatGPT Work

Statut: completed
Branche: `codex/bell-018-connexion-mcp-chatgpt-work`
Dernière mise à jour: 2026-08-04

## Objectif

Rendre le MCP Telegram déployé compatible avec l'authentification OAuth exigée par les applications personnalisées ChatGPT, puis valider sa découverte et un premier passage fictif sans appel Gmail ou Notion réel.

## Critères de réussite

- Le Worker expose le flux OAuth 2.1 attendu par MCP avec PKCE et découverte standard.
- L'autorisation reste limitée au propriétaire Belloria et aucun secret n'est ajouté à Git ou aux journaux.
- Les routes Telegram existantes, l'idempotence et la transcription restent inchangées.
- Les outils MCP sont découverts par ChatGPT après authentification.
- Un passage fictif lit puis termine une commande de test sans envoi Gmail/Notion réel.
- Les tests, `git diff --check` et l'examen du diff réussissent.

## Fichiers concernés

- `worker/src/index.js`
- `worker/test/worker.test.js`
- `wrangler.jsonc`
- `package.json`
- `.dev.vars.example`
- `docs/chatgpt-work-automation.md`
- `docs/mcp-server.md`
- `CURRENT_TASK.md`
- `docs/TASKS.md`

## Prochaine action

Ouvrir le lot suivant pour configurer le passage planifié ChatGPT Work sur les sources Gmail et Notion de test.

## Résultat

Le MCP Belloria déployé est connecté à ChatGPT Work par OAuth 2.1 avec PKCE. ChatGPT découvre les quatre actions et a lu puis terminé une commande Telegram fictive, sans envoyer de message Telegram ni contacter Gmail ou Notion.

## Validations effectuées

- Découverte OAuth, enregistrement dynamique, autorisation, échange de jeton et métadonnées MCP validés sur le Worker déployé.
- Accès MCP non authentifié refusé ; initialisation, notifications MCP et `tools/list` validés.
- Les quatre actions Belloria sont visibles dans ChatGPT Work.
- `belloria_list_commands(limit: 10)` a retourné la commande fictive `602781223` une seule fois.
- `belloria_complete_command` avec confirmation explicite a retourné `{ "completed": true }`.
- Aucun message Telegram envoyé et aucun appel Gmail ou Notion réel effectué.
