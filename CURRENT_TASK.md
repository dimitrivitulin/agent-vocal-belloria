# BELL-027 — Référentiel commercial Belloria

Statut: ready_for_review
Branche: `codex/bell-027-referentiel-commercial`
Dernière mise à jour: 2026-08-04

## Objectif

Construire une source de vérité versionnée des prestations Belloria afin que l'agent puisse recommander une offre sans inventer de prix, de contenu ni de capacité.

## Critères de réussite

- Les prestations ont une fiche structurée, une source, une date de preuve et un statut de validation.
- Seules les fiches `Validé` sont utilisables comme règle commerciale courante.
- Les prix historiques sont distingués des tarifs validés.
- Les inconnues opérationnelles sont explicites et bloquent toute promesse automatique.
- Belloria peut valider les premières fiches dans Notion sans modifier le code.

## Fichiers concernés

- `CURRENT_TASK.md`
- `docs/TASKS.md`
- `docs/PROJECT_CONTEXT.md`
- `docs/referentiel-commercial.md`

## Réalisation

- Base Notion `Référentiel commercial Belloria` créée sous la page Belloria.
- Six fiches sourcées créées : deux grazing tables, deux ateliers, brunch et plateaux.
- Quatre prix datés du 31 juillet 2026 sont enregistrés en `À valider`, jamais comme tarifs garantis.
- Composition, logistique connue, associations et informations manquantes sont tracées dans chaque fiche.

## Validation humaine requise

Valider ou corriger les prix, minimums, capacités, délais, frais logistiques, règles commerciales et limites alimentaires. Renseigner `Validé par` et `Dernière validation`, puis passer chaque fiche approuvée à `Validé`.

## Prochaine action

Après validation Belloria des fiches, clôturer `BELL-027` puis exécuter `BELL-028 — Contexte prospect 360`.

## État vérifié

- La base et ses six fiches sont lisibles dans Notion.
- Toutes les données non approuvées restent en `À valider`.
- Aucun email n'a été envoyé et aucun CRM prospect n'a été modifié.
