# BELL-020 — CRM Belloria opérationnel

Statut: completed
Branche: `codex/bell-020-crm-belloria-operationnel`
Dernière mise à jour: 2026-08-04

## Objectif

Créer un nouveau CRM Notion séparé, adapté aux demandes réellement observées dans Gmail et centré sur les actions commerciales utiles à Belloria.

## Critères de réussite

- Un échantillon Tally, Mariages.net, email direct, devis, modification et refus est analysé en lecture seule.
- Le CRM réel existant reste intact.
- Une demande ou un événement est suivi sur une seule ligne, enrichie par les messages du même fil Gmail.
- Le pipeline distingue réponse, qualification, devis, modification, relance, acompte, confirmation, perte et fin de prestation.
- Des vues immédiatement utiles présentent les actions, le pipeline, le calendrier et les prestations confirmées.
- Aucun email n'est envoyé et aucune donnée client réelle n'est copiée pendant la validation.
- La documentation, `git diff --check` et l'examen du diff réussissent.

## Fichiers concernés

- `docs/notion-crm-operational.md`
- `docs/chatgpt-work-automation.md`
- `docs/TASKS.md`
- `CURRENT_TASK.md`

## Prochaine action

Faire valider le CRM vide dans Notion, puis ouvrir un lot séparé pour importer un échantillon borné et connecter l'automatisation Gmail.

## Résultat

Le nouveau CRM `CRM Belloria — Pilotage commercial` est créé séparément dans Notion avec la base `Demandes & événements` et quatre vues opérationnelles. Le modèle provient des flux Gmail réels observés ; l'ancien CRM et les emails restent inchangés.

## Validations effectuées

- Échantillons Gmail Tally, Mariages.net, email direct, devis, modification, acompte attendu et refus lus sans mutation.
- Schéma et vues du nouveau CRM relus via Notion après création.
- Requête de contrôle : base vide, aucune donnée client importée.
- Ancien CRM conservé sans modification.
- `git diff --check`, examen du périmètre et recherche de secrets réussis.
