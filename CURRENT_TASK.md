# BELL-007 — Automatisation ChatGPT Work

Statut: completed
Branche: `codex/bell-007-automatisation-chatgpt-work`
Dernière mise à jour: 2026-08-03

## Objectif

Définir et tester le passage périodique qui traite la file Gmail, synchronise les demandes qualifiées et prépare un compte rendu WhatsApp sans contacter de service réel.

## Critères de réussite

- Les messages candidats sont traités du plus ancien au plus récent.
- Chaque issue produit exactement un état Gmail terminal cohérent.
- Une erreur CRM reste rejouable et ne produit pas de faux succès.
- Le compte rendu distingue succès, revues, exclusions et erreurs.
- L'envoi WhatsApp reste un brouillon soumis à confirmation explicite.
- Les tests utilisent uniquement des doubles mémoire.

## Périmètre

- Orchestrateur local et contrats abstraits Gmail/qualification/CRM.
- Tests des transitions, reprises et rapports de passage.
- Runbook et prompt de configuration ChatGPT Work.
- Aucun accès Gmail, Notion ou WhatsApp réel et aucune activation distante.

## Fichiers concernés

- `belloria_work/`
- `tests/test_work_automation.py`
- `docs/chatgpt-work-automation.md`
- `CURRENT_TASK.md`
- `docs/TASKS.md`

## Prochaine action

Configurer les connecteurs sur un environnement de test, puis effectuer un passage en lecture seule avant toute activation distante.

## Validations effectuées

- 25 tests unitaires réussis, dont 7 dédiés au passage périodique, sans accès externe.
- Compilation Python et `git diff --check` réussis.
- Compte rendu limité à un brouillon sans données personnelles ni message d'erreur brut.
