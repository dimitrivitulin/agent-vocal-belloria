# BELL-046 — Registre d’actions externes et approbation durable

Statut: completed
Branche: `codex/bell-046-gpt-actions-idempotence`
Dernière mise à jour: 2026-08-10

## Objectif

Livrer le registre D1 générique prêt à intégrer : création immuable, présentation et approbation Telegram, puis claim atomique. Aucun adaptateur Gmail ou Notion ne l’utilise encore.

## Contexte autorisé

- Domaine : code local Worker, D1 et confirmation Telegram.
- Fichiers initiaux : `worker/src/index.js`, migrations D1, tests Worker/D1, ADR-009 et suivi projet.
- Skill requis : aucun.
- MCP ou connecteur requis : aucun ; les tests doublent Telegram et n’appellent ni Gmail ni Notion.
- Hors périmètre : `worker/src/gpt-actions.js`, OpenAPI, routes `confirmed: true`, Gmail, Notion, Brevo, WAHA/Meta, découpage du Worker et déploiement.

## Décisions de lot

- Une action doit venir d’une source persistée ; BELL-046 autorise uniquement `telegram_command` dont `source_id` existe dans `telegram_commands`.
- `creation_key` dérive de `source_type`, `source_id`, `action_type` et de la cible canonique. Même clé + contenu identique retrouve l’action ; contenu différent est un conflit.
- Le Worker produit `action_id` et le jeton ; D1 stocke cible, payload, message de présentation et hash de contrôle de façon immuable.
- La confirmation allowlistée réalise seulement `pending → approved`; le claim conditionnel réalise seulement `approved → claimed`.

## Critères de sortie

- Tests de création, rejet, expiration, présentation, confirmation, concurrence de claim et immuabilité réussis sans appel Gmail/Notion.
- Diff contrôlé, suivi/ADR mis à jour et aucune route actuelle modifiée.

## Résultat

- `external_actions` est prêt à intégrer, avec source générique limitée à `telegram_command`, contenu immuable, preuve Telegram et claim conditionnel.
- Les routes Actions GPT, OpenAPI, Gmail et Notion ne sont pas modifiés ; `confirmed: true` reste donc insuffisant jusqu’aux lots BELL-047/BELL-048.

## Validation

- `npm.cmd run test:worker` : 39 tests réussis.
- Tests D1/Python : 79 tests réussis via le runtime Python local.
- `git diff --check` et examen du diff : périmètre limité au registre, aux tests et au suivi.
