# BELL-022 — Passage planifié Gmail vers Notion

Statut: ready_for_review
Branche: `codex/bell-022-passage-planifie-gmail-notion`
Dernière mise à jour: 2026-08-04

## Objectif

Valider puis activer un passage planifié sûr entre la boîte Gmail Belloria et la base Notion de test `Demandes & événements`, sans toucher au CRM historique ni envoyer d'email.

## Critères de réussite

- Les labels Gmail Belloria requis existent et leurs noms sont vérifiés.
- Un passage en lecture seule sur des messages de test confirme la sélection et la qualification attendues.
- Un passage contrôlé crée ou actualise uniquement des fiches dans la base Notion de test.
- Le rejeu d'un message ne duplique pas la fiche et répare l'état Gmail.
- Aucun email ni compte rendu Telegram n'est envoyé sans confirmation explicite.
- Les validations locales, `git diff --check` et l'examen du diff réussissent.

## Fichiers concernés

- `CURRENT_TASK.md`
- `docs/TASKS.md`
- `docs/chatgpt-work-automation.md`
- fichiers d'automatisation ou tests uniquement si le passage réel révèle un écart au contrat existant

## État vérifié

- La base Notion de test `Demandes & événements` est accessible et son schéma contient les champs métier et techniques attendus.
- Les huit labels Gmail actifs ont été créés et vérifiés.
- Les signatures Tally et Mariages.net ont été validées en lecture seule sur l'historique ; les promotions Mariages.net restent exclues.
- Deux demandes Tally et une demande Mariages.net ont produit trois fiches distinctes dans la base Notion de test, puis ont reçu l'état Gmail `Traite`.
- Un rejeu contrôlé a retrouvé la fiche existante et réparé l'état Gmail sans créer de doublon.
- Les soumissions Tally utilisent désormais `messageId` comme clé d'opportunité afin d'éviter la fusion de clients regroupés dans un même fil Gmail.
- Aucun email ni compte rendu Telegram n'a été envoyé.
- Les quatre règles techniques de `tools/belloria-gmail-filters.xml` sont importées et actives dans `belloriaevent@gmail.com`.
- La tâche ChatGPT a été soumise en mode Work avec la cadence et les garde-fous complets, mais elle n'apparaît pas dans la liste des tâches planifiées actives.

## Prochaine action

Reprendre la conversation `Passage Belloria automatisé` dans ChatGPT Work et obtenir la création effective d'une tâche active toutes les quinze minutes, puis clôturer le lot.
