# BELL-002 — Modèle du CRM Notion

Statut: completed
Branche: `codex/bell-002-modele-crm-notion`
Dernière mise à jour: 2026-08-03

## Objectif

Définir un modèle Notion minimal et exploitable pour les contacts et opportunités Belloria, avec propriétés, statuts, relations et règles de déduplication explicites.

## Critères de réussite

- Les bases Contacts et Opportunités sont décrites avec leurs propriétés et types Notion.
- Le cycle de vie commercial et les champs obligatoires sont définis.
- Les clés de normalisation, de rapprochement et d'idempotence sont déterministes.
- Le modèle peut être implémenté sans décision métier structurante restante dans BELL-006.

## Travail terminé

- Modèle à deux bases, propriétés, relations et vues minimales défini.
- Cycle de vie commercial et règles de mise à jour documentés.
- Normalisation, déduplication et idempotence Gmail spécifiées.
- Décision d'architecture durable enregistrée.

## Prochaine action

Ouvrir `BELL-003 — Qualification des emails Gmail`.

## Fichiers concernés

- `docs/notion-crm-model.md`
- `docs/decisions/002-modele-crm-notion.md`
- `CURRENT_TASK.md`
- `docs/TASKS.md`

## Validations effectuées

- Cohérence du schéma et des règles de rapprochement : réussie.
- `git diff --check` : réussi.
- Examen du périmètre : réussi ; documentation et suivi uniquement.
- Recherche de secrets : réussie ; aucun secret ajouté.

## Risques ou points de vigilance

- Aucun espace Notion réel ne doit être modifié dans ce lot.
- Les identifiants techniques doivent rester stables si les libellés visibles évoluent.
