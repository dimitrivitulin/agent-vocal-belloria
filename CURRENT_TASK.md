# BELL-047.1 — Envoi Gmail durable

Statut: completed
Branche: `codex/bell-047-gmail-durable-dispatch`
Dernière mise à jour: 2026-08-10

## Objectif

Raccorder uniquement l'envoi Gmail au registre BELL-046 : proposition issue d'une commande Telegram persistée, approbation durable, claim et dispatch Gmail à effet unique, puis résultat `succeeded`, `failed` ou `unknown`.

## Contexte autorisé

- Domaine : code local Worker, migration D1, OpenAPI et tests Worker/D1.
- Fichiers initiaux : `worker/src/gpt-actions.js`, `worker/src/index.js`, migrations D1, tests Worker/D1 et suivi projet.
- Skill requis : aucun.
- MCP ou connecteur requis : aucun ; les tests doublent Gmail et Telegram.
- Hors périmètre : BELL-047.2/réconciliation, Notion, Brevo, WAHA/Meta, Queue, refactor général, déploiement.

## Décisions de lot

- `gmail_send` exige `source_type=telegram_command` et un `source_id` persistant ; aucune source ChatGPT n'est ajoutée.
- L'exécution accepte seulement `action_id` et relit le contenu canonique D1. `confirmed: true` n'autorise plus aucun envoi Gmail direct.
- Le marqueur de corrélation `Message-ID` est déterministe mais ne sert à aucune réconciliation dans ce lot.
- Après `dispatch_started_at`, tout résultat non explicitement rejeté par Gmail devient `unknown`, sans retry d'envoi.

## Critères de sortie

- Deux exécutions ou rejeux ne peuvent produire qu'un seul appel Gmail simulé.
- Les résultats terminaux sont persistés ; `succeeded` et `unknown` ne rappellent jamais Gmail.
- Les tests Worker/D1, le contrôle du diff et l'examen de périmètre réussissent.

## Résultat

- `POST /gpt-actions/gmail/send` ne crée plus qu'une proposition durable et présentée Telegram ; `confirmed: true` est refusé comme champ Gmail non pris en charge.
- `POST /gpt-actions/gmail/execute` accepte exclusivement `action_id`, réserve le dispatch avant l'unique appel Gmail et persiste les états terminaux immuables.
- BELL-047.2 reste seul responsable de valider puis d'implémenter une éventuelle réconciliation par `Message-ID`.

## Validation

- `npm.cmd run test:worker` : 43 tests réussis.
- Tests D1/Python : 79 tests réussis avec le runtime Python local.
- `git diff --check`, examen du diff et recherche des routes Gmail : réussis ; aucune modification Notion, Brevo, Queue ou WAHA/Meta.
