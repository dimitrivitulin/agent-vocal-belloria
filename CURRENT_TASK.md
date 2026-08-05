# BELL-034 — Réception directe des formulaires Tally

Statut: ready_for_review
Branche: `codex/bell-034-webhook-tally`
Dernière mise à jour: 2026-08-05

## Objectif

Recevoir les soumissions Tally directement dans Cloudflare, sans utiliser leur notification Gmail comme entrée de traitement.

## Périmètre

- Vérifier la signature du webhook et limiter l'entrée au formulaire configuré.
- Dédupliquer et conserver temporairement les soumissions dans D1.
- Exposer la file Tally au passage ChatGPT Work via le MCP, puis effacer le payload après succès CRM.
- Conserver Gmail pour les emails directs et Mariages.net, sans traiter les notifications Tally.

## Critères de réussite

- Une livraison répétée du même événement ne crée pas de doublon.
- Une signature invalide ou un autre formulaire est refusé.
- Le passage planifié peut lister puis terminer explicitement chaque soumission.
- Tests Worker, `git diff --check` et examen du diff réussissent.

## Validation

- 21 tests Worker et 77 tests Python réussis ; signature, filtrage de formulaire, rejeu et effacement après traitement sont couverts.
- Migration D1 `0005_tally_submissions.sql` ajoutée.
- Aucun service réel contacté et aucune donnée distante modifiée.

## Prochaine action

Après accord : appliquer la migration, charger les secrets, déployer, puis connecter l'URL dans Tally et adapter la tâche ChatGPT Work.
