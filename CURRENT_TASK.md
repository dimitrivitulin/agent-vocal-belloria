# BELL-034 — Réception directe des formulaires Tally

Statut: completed
Branche: `codex/bell-034-webhook-tally`
Dernière mise à jour: 2026-08-06

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
- Migration appliquée et Worker `fef1d6f7-8035-4520-b462-5b44ed2f085b` déployé.
- Test signé de production accepté puis donnée synthétique supprimée ; aucun service client contacté.
- Soumission Tally réelle `DqAg2Yl` reçue directement et conservée en état `pending` sans passage par Gmail.

## Prochaine action

Préparer BELL-035 pour utiliser le connecteur Tally dans ChatGPT Work sans retirer le webhook anti-perte.
