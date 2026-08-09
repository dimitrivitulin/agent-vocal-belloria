# BELL-045 — Transitions SMS Brevo monotones

Statut: completed
Branche: `codex/bell-045-brevo-sms-status`
Dernière mise à jour: 2026-08-09

## Objectif

Empêcher les callbacks Brevo tardifs ou répétés de faire régresser l'état SMS conservé dans D1.

## Contexte autorisé

- Domaine : callbacks SMS Brevo et suivi D1 des soumissions Tally.
- Fichiers initiaux : `worker/src/index.js`, `worker/test/worker.test.js`, `docs/tally-sms-ack.md`, suivi du lot.
- Skill requis : aucun.
- MCP ou connecteur requis : aucun ; aucun appel Brevo réel.
- Hors périmètre : refactor Worker, migrations, Telegram, Tally hors rapprochement du callback, MCP, OAuth, Actions GPT, WAHA/Meta, déploiement.

## Périmètre

- Rendre les transitions SQL monotones pour les rapprochements par `messageId` et tag Tally.
- Faire de `delivered` un état terminal et traiter les callbacks identiques comme de vrais no-op.
- Couvrir les transitions autorisées, refusées, répétées et les deux chemins de rapprochement.
- Documenter la politique des états d'échec.

## Critères de réussite

- `pending → accepted → delivered` fonctionne.
- `failed` ne régresse pas vers `accepted`, mais peut devenir `delivered`.
- `delivered` ne change plus et un no-op ne modifie pas `sms_updated_at`.
- Les tests Worker et `git diff --check` réussissent sans changement hors périmètre.

## Validation

- Tests Worker : 36 réussis le 2026-08-09.
- Les rapprochements par `messageId` et tag Tally appliquent la même progression monotone ; le tag précoce reste limité à `pending`.
- Les callbacks identiques ou régressifs retournent `accepted: 0` sans modifier `sms_status` ni `sms_updated_at`.
- Aucune migration ni intégration hors Brevo/Tally n'a été modifiée.
