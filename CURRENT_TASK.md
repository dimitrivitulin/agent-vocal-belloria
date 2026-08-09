# BELL-046 — Conception des Actions GPT idempotentes

Statut: completed
Branche: `codex/bell-046-gpt-actions-idempotence`
Dernière mise à jour: 2026-08-09

## Objectif

Définir une architecture minimale garantissant qu'une mutation Gmail ou Notion préparée par le GPT reste immuable, réellement approuvée, réclamée une seule fois localement et traçable jusque dans les résultats incertains.

## Contexte autorisé

- Domaine : conception des Actions GPT, approbations Telegram et persistance D1.
- Fichiers initiaux : `worker/src/gpt-actions.js`, approbations dans `worker/src/index.js`, migration `0003`, tests et documentation Actions GPT.
- Skill requis : aucun.
- MCP ou connecteur requis : aucun ; aucun accès Gmail, Notion ou Telegram réel.
- Hors périmètre : code applicatif, migration, déploiement, secret, donnée réelle et refactor du Worker.

## Décision

- D1 portera une action externe immuable identifiée par `action_id`, `client_request_id` et une empreinte du contenu approuvé.
- La confirmation humaine viendra du canal Telegram allowlisté et fera `pending → approved`, sans consommer l'action.
- Un claim SQL atomique fera `approved → claimed`; succès, échec et résultat incertain seront persistés.
- Gmail send et Notion create ne seront jamais rejoués automatiquement après un dispatch ambigu ; l'état `unknown` exigera réconciliation ou décision humaine.
- Les écritures directes fondées uniquement sur `confirmed: true` seront remplacées dans un lot d'implémentation séparé.

## Résultat

- ADR-009 acceptée avec machine d'état, identité de l'effet, politique de panne et limites de garantie.
- `PROJECT_CONTEXT.md` distingue désormais la cible validée de l'implémentation directe actuellement déployée.
- BELL-047 porte l'implémentation future, sans Queue, framework, ORM, nouvelle base ni service supplémentaire.

## Validation

- Documentation uniquement ; aucun code, test, schéma D1 ou service externe modifié.
- `git diff --check` valide et diff limité au contexte, à la feuille de route, à la mémoire de lot et à l'ADR.
