# BELL-027 — Référentiel commercial Belloria

Statut: completed
Branche: `codex/bell-027-referentiel-commercial`
Dernière mise à jour: 2026-08-04

## Objectif

Construire une source de vérité versionnée des prestations Belloria, fondée sur le catalogue, les devis, les échanges clients, les factures et le CRM, afin que l'agent recommande sans inventer.

## Résultat livré

- Base Notion `Référentiel commercial Belloria` portée à 26 fiches et trois vues opérationnelles.
- Trois offres cœur validées : Cocktail 18 €/pers., Menu 25 €/pers. et Brunch 25 €/pers.
- Upsells réellement payés identifiés : mignardises, Salad'Bello, Bar de bienvenue, Cookie'Bello et donuts.
- Incompatibilité bloquante enregistrée dans les deux sens : Bar Charcu'Bello et Grazing Table Cocktail.
- Deux packs catalogue incohérents suspendus et règles logistiques maintenues en validation humaine.
- Rapport Notion et documentation locale alignés avec la hiérarchie des preuves.

## Corrections critiques

- Le Menu affiché à 55 € dans le catalogue vaut réellement 25 € TTC/personne.
- Plusieurs pieds de page du catalogue affichent `06 26 28 04 22` au lieu de `06 25 28 04 22`.
- Le minimum générique de 30 personnes et les frais logistiques à partir de 90 € ne sont pas appliqués automatiquement : les dossiers réels les contredisent ou ne permettent pas leur calcul.

## Validation

- Catalogue de 17 pages inspecté visuellement et textuellement.
- Devis, conversations et factures finales rapprochés pour les dossiers représentatifs.
- Événements confirmés ou terminés contrôlés dans le CRM.
- Les offres non prouvées restent `À valider` ; les packs incohérents restent `Suspendu`.

## Prochaine action

Exécuter `BELL-028 — Contexte prospect 360` en utilisant uniquement les fiches `Validé` du référentiel.
