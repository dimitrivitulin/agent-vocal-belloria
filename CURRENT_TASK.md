# BELL-003 — Qualification des emails Gmail

Statut: completed
Branche: `codex/bell-003-qualification-emails-gmail`
Dernière mise à jour: 2026-08-03

## Objectif

Définir un routage Gmail minimal et déterministe pour isoler les demandes commerciales, distinguer les formulaires Tally des emails libres et permettre un traitement idempotent.

## Critères de réussite

- Les labels et filtres Gmail couvrent les sources connues et excluent les catégories sans intérêt.
- Le contrat d'entrée décrit les champs Gmail nécessaires et les états du traitement.
- Le format Tally est extractible sans IA, avec gestion explicite des champs absents ou inconnus.
- Les règles de reprise, d'échec et d'idempotence sont compatibles avec le modèle CRM Notion.
- Des cas de test représentatifs permettent d'implémenter BELL-007 sans décision structurante restante.

## Travail terminé

- Taxonomie des labels et ordre logique des filtres Gmail définis.
- Contrats de qualification des emails libres et formulaires Tally documentés.
- États, reprise, idempotence et cas de validation spécifiés.
- Autorité de succès Notion et traitement Gmail par message consignés dans une décision durable.

## Prochaine action

Ouvrir `BELL-004 — Passerelle WhatsApp WAHA`.

## Fichiers concernés

- `docs/gmail-qualification.md`
- `docs/decisions/003-qualification-emails-gmail.md`
- `CURRENT_TASK.md`
- `docs/TASKS.md`

## Validations effectuées

- Cohérence avec le modèle CRM Notion : réussie.
- Vérification des comportements Gmail sur la documentation officielle : réussie.
- `git diff --check` : réussi.
- Examen du périmètre et recherche de secrets : réussis.

## Risques ou points de vigilance

- Aucun filtre Gmail réel ne doit être créé dans ce lot.
- Les adresses expéditrices et exemples de messages réels restent à confirmer sur des échantillons anonymisés.
- Aucun test ne doit accéder à une boîte Gmail réelle.
