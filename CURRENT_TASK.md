# BELL-037 — Accusé SMS transactionnel immédiat

Statut: ready_for_review
Branche: `codex/bell-037-tally-sms-ack`
Dernière mise à jour: 2026-08-06

## Objectif

Après une nouvelle soumission Tally, envoyer un accusé SMS transactionnel immédiat, sobre et idempotent, sans promesse commerciale.

## Périmètre

- Extraire et valider un numéro français depuis les champs structurés Tally.
- Envoyer par Brevo un message transactionnel à trous contenant le prénom, le type et la date de l'événement, une réponse rapide annoncée et un appel à contacter Belloria pour plus d'informations.
- Tracer état, identifiant fournisseur et erreur assainie dans D1 sans dupliquer le numéro.
- Conserver la demande `pending` indépendamment du résultat SMS et ne contacter aucun prospect pendant les tests.

## Critères de réussite

- Un événement nouveau et valide déclenche au plus un appel fournisseur ; un rejeu n'en déclenche aucun.
- Numéro ou personnalisation obligatoire absent/ambigu/invalide et configuration absente n'envoient rien et restent observables.
- Le texte ne contient ni prix, ni disponibilité, ni promesse et tient dans un segment GSM-7.
- Migration, tests Worker, `git diff --check` et examen du diff réussissent.

## Validation externe

Le déploiement, la configuration des secrets et tout SMS réel nécessitent un compte Brevo prêt et une confirmation explicite avant l'envoi de validation.

## Résultat local

Intégration Brevo, modèle chaleureux `{prenom}` / `{evenement}` / `{date}` avec appel à contacter Belloria, validation mobile français, états D1 et callback authentifié livrés. Les 26 tests Worker et 78 tests Python passent. Le fournisseur et l'expéditeur ont été validés par un SMS réel livré ; le déploiement du nouveau modèle et la validation Tally de bout en bout sont reportés dans BELL-041.
