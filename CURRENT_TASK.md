# BELL-044 — Groupe de notifications Telegram

Statut: completed
Branche: `codex/bell-044-telegram-groupe-notifications`
Dernière mise à jour: 2026-08-07

## Objectif

Publier les résumés Tally dans un groupe Telegram interne, sans ouvrir les commandes commerciales aux membres du groupe.

## Contexte autorisé

- Domaine : code local Worker Cloudflare et notification Telegram.
- Fichiers initiaux : `CURRENT_TASK.md`, `docs/TASKS.md`, `worker/src/index.js`, `worker/test/worker.test.js`, `.dev.vars.example`, `docs/telegram-cloudflare.md`.
- Skill requis : aucun.
- MCP requis : aucun.
- Hors périmètre : secrets, déploiement, ajout de membres Telegram, ChatGPT Work, Tally, Notion et Brevo.

## Périmètre

- Ajouter un destinataire de notification de groupe facultatif, distinct du chat privé autorisé.
- Conserver le chat privé comme unique source de commandes et de confirmations.
- Documenter la configuration manuelle et couvrir le routage par un test.

## Critères de réussite

- Une notification Tally utilise le groupe si son identifiant est configuré, sinon le chat privé existant.
- Un message de groupe ne peut pas créer de commande.
- Les tests Worker et `git diff --check` réussissent.

## Reprise

Lot terminé : le groupe est configuré comme destinataire des notifications Tally et le webhook Telegram est rétabli.

## Validation

- Les 31 tests Worker et `git diff --check` passent.
- Le secret Cloudflare du groupe est configuré sans être ajouté au dépôt.
- Worker déployé : version `a935c766-cf0e-463b-92d8-aea17daee302` ; webhook réenregistré après la lecture de l'identifiant du groupe.
