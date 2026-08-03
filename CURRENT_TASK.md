# BELL-006 — Synchronisation du CRM Notion

Statut: completed
Branche: `codex/bell-006-synchronisation-crm-notion`
Dernière mise à jour: 2026-08-03

## Objectif

Synchroniser une demande qualifiée vers les bases `Contacts` et `Opportunités` selon le contrat BELL-002, sans doublon et sans écraser les données commerciales manuelles.

## Critères de réussite

- Email, téléphone, textes et clés métier sont normalisés avant rapprochement.
- Les contacts sont rapprochés par email puis téléphone, avec conflit explicite.
- Les opportunités sont rapprochées par fil Gmail puis clé métier.
- Rejouer un message déjà traité ne produit aucune mutation.
- L'ID du message n'est enregistré qu'après toutes les mutations réussies.
- Les tests utilisent une passerelle mémoire et ne contactent pas Notion réel.

## Périmètre

- Modèles d'entrée, normalisation et moteur de synchronisation.
- Contrat abstrait de stockage Notion et double mémoire testable.
- Tests des cas de déduplication et d'échec prévus par BELL-002.
- Documentation de configuration et écart constaté avec le CRM réel.
- Aucune migration ni modification des bases Notion réelles.

## Fichiers concernés

- `belloria_notion/`
- `tests/test_notion_sync.py`
- `docs/notion-sync.md`
- `CURRENT_TASK.md`
- `docs/TASKS.md`

## Prochaine action

Après validation du modèle cible, implémenter l'adaptateur Notion et préparer une migration explicite des données réelles.

## Validations effectuées

- 18 tests unitaires réussis, dont 8 dédiés au CRM, sans accès Notion réel.
- Compilation Python et `git diff --check` réussis.
- Schéma Notion réel inspecté en lecture seule ; aucune mutation distante effectuée.
