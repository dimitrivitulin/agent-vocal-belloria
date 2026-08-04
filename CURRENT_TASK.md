# BELL-023 — Validation du premier passage réel

Statut: completed
Branche: `codex/bell-023-validation-premier-passage-reel`
Dernière mise à jour: 2026-08-04

## Objectif

Surveiller le premier passage planifié contenant un nouveau candidat réel et confirmer que le flux Gmail vers la base Notion de test respecte le contrat validé, sans envoyer d'email ni de notification Telegram.

## Critères de réussite

- Un nouveau candidat réel est identifié après son traitement planifié.
- La qualification, la fiche Notion créée ou actualisée et l'état Gmail concordent.
- Aucun doublon ni mutation du CRM historique n'est observé.
- Aucun email ni compte rendu Telegram n'est envoyé pendant la validation.
- Les éventuels écarts sont documentés et corrigés dans un lot borné.
- Les validations locales, `git diff --check` et l'examen du diff réussissent.

## Fichiers concernés

- `CURRENT_TASK.md`
- `docs/TASKS.md`
- `docs/chatgpt-work-automation.md` uniquement si le passage réel révèle un écart documentaire
- fichiers d'automatisation ou tests uniquement si le passage réel révèle un défaut

## État vérifié

- BELL-022 est terminé, propre et publié sur `origin`.
- La tâche `Passage Belloria automatisé` est active toutes les heures.
- Le premier candidat réel observé est une soumission Tally reçue le 2026-08-04 pour un anniversaire de 25 convives le 2026-08-28.
- Gmail porte les labels `Belloria/Candidat`, `Belloria/Source/Tally` et `Belloria/Etat/Traite`, sans état d'erreur ou de revue.
- Une seule fiche correspondante existe dans la base Notion de test ; ses données métier, son lien Gmail et son identifiant technique concordent.
- La fiche est à l'étape `Devis à préparer`, avec l'action de préparer un devis pour 25 convives.
- Aucun email ni compte rendu Telegram n'a été envoyé pendant cette validation en lecture seule.

## Prochaine action

Ouvrir le prochain lot Belloria et définir l'étape opérationnelle suivant la validation du flux réel.
