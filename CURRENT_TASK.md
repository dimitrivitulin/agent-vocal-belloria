# BELL-043 — Détails Tally dans Telegram

Statut: completed
Branche: `codex/bell-043-details-tally-telegram`
Dernière mise à jour: 2026-08-07

## Objectif

Envoyer immédiatement dans le chat Telegram privé un résumé exploitable de chaque nouveau formulaire Tally.

## Contexte autorisé

- Domaine : code local Worker Cloudflare et notification Telegram.
- Fichiers initiaux : `CURRENT_TASK.md`, `docs/TASKS.md`, `worker/src/index.js`, `worker/test/worker.test.js`, `docs/chatgpt-work-automation.md`.
- Skill requis : aucun pour l'implémentation locale.
- MCP requis : aucun.
- Hors périmètre : ChatGPT Work, Tally, Notion, Brevo, secrets et données de production.

## Périmètre

- Remplacer l'accusé Telegram générique par un résumé des champs structurés du formulaire.
- Exclure téléphone, email et toute valeur non prévue ou ambiguë.
- Préserver l'idempotence : une soumission ne produit qu'un seul message.
- Ajouter les tests et la documentation nécessaires.

## Critères de réussite

- Le message contient les détails métier reconnus disponibles, avec un rendu lisible.
- Les coordonnées personnelles ne sont jamais incluses.
- Le rejeu ne produit aucun second message.
- Les tests du Worker et `git diff --check` réussissent.

## Validation

- Les 30 tests Worker passent, dont le résumé Telegram et le rejeu idempotent.
- Version Cloudflare `43590b58-fa74-48a9-ae76-e096466fae05` déployée ; `/health` répond `ok`.
- La soumission Tally réelle de Dimitri a confirmé le rendu Telegram ; son email a été placé dans la corbeille et aucune ligne n'est en attente dans D1 ni présente dans le CRM Notion.

## Reprise

Lot terminé.
