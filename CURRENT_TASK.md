# BELL-037 — Accusé SMS transactionnel immédiat

Statut: ready_for_review
Branche: `codex/bell-037-sms-brevo-message`
Dernière mise à jour: 2026-08-07

## Objectif

Remplacer le texte de l'accusé SMS Brevo par le message validé, personnalisé avec le nom, le type et la date d'événement du formulaire Tally, tout en restant sur un seul segment GSM-7.

## Contexte autorisé

- Domaine : code local Worker Cloudflare et SMS Brevo.
- Fichiers initiaux : `CURRENT_TASK.md`, `docs/TASKS.md`, `worker/src/index.js`, `worker/test/worker.test.js`, `docs/tally-sms-ack.md`.
- Skill requis : aucun.
- MCP requis : aucun.
- Hors périmètre : modification des secrets, envoi de test, configuration Brevo, Tally, Notion et Telegram.

## Périmètre

- Utiliser le prénom issu du nom, le type et la date d'événement fournis par Tally.
- Adopter le texte court validé et une signature Belloria.
- Conserver les garde-fous : ASCII/GSM-7, 160 caractères maximum et refus si les données sont absentes ou ambiguës.

## Critères de réussite

- Le SMS reçu est personnalisé avec le nom, l'événement et la date du formulaire.
- Il reste compatible GSM-7 et tient en un segment.
- Les tests Worker et `git diff --check` réussissent.

## Reprise

Worker de production déployé sans modification des secrets ni envoi de SMS de test. La prochaine action est une soumission Tally contrôlée vers un numéro Belloria.

## Validation

- Les 31 tests Worker passent et `git diff --check` est valide.
- La partie Python de `npm test` n'a pas démarré : l'interpréteur Python est absent du terminal ; elle ne couvre pas le Worker SMS.
- Déploiement Cloudflare validé : version `977401bc-8f53-4e7d-ac4d-165e031e22a6` ; `GET /health` retourne `{"status":"ok","channel":"telegram"}`.
