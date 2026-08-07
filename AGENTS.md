# Règles de travail — Belloria

## Priorités

1. La demande explicite de l'utilisateur prime sur la feuille de route.
2. En l'absence de nouvelle demande, reprendre la tâche indiquée dans `CURRENT_TASK.md`.
3. Ne traiter qu'un lot cohérent par tâche Codex.
4. Ne charger que le contexte nécessaire à la décision ou au changement en cours.

## Contexte minimal au démarrage

Consulter dans cet ordre :

1. les fichiers `AGENTS.md` applicables ;
2. `docs/PROJECT_CONTEXT.md` ;
3. `CURRENT_TASK.md` ;
4. la branche active et `git status --short` ;
5. le diff Git existant ;
6. les fichiers mentionnés dans `CURRENT_TASK.md`.

Lire ensuite uniquement les dépendances, configurations, tests ou décisions nécessaires au lot. Ne pas charger automatiquement tout le dépôt, tous les journaux ou toutes les décisions historiques.

## Chargement à la demande

Avant toute lecture supplémentaire ou activation d'un outil spécialisé, classifier la demande par domaine et déclarer dans `CURRENT_TASK.md` :

- les fichiers initiaux autorisés ;
- le ou les skills nécessaires, avec un seul skill initial par défaut ;
- les MCP ou connecteurs nécessaires ;
- les éléments explicitement hors périmètre.

Appliquer ensuite ces règles :

- Commencer sans skill spécialisé lorsque la tâche peut être traitée avec le dépôt et les outils locaux.
- Charger un skill uniquement lorsque la demande correspond à son domaine ou que l'utilisateur le nomme ; n'en ajouter un second que si une dépendance concrète traverse réellement deux domaines.
- Ne jamais consulter un connecteur externe « au cas où ». Gmail, Notion, GitHub, navigateur, Supabase et les autres MCP ne sont utilisés que si le manifeste du lot ou la demande active les exige.
- Préférer des MCP désactivés par défaut dans la configuration Codex et les activer pour une tâche dédiée. Lorsqu'un outil est déjà exposé par l'environnement, ne pas l'appeler sans nécessité.
- Utiliser `rg` pour cibler les fichiers et symboles pertinents avant de lire un fichier complet ; partir des dépendances directes, tests associés et configurations proches.
- Résumer les sorties volumineuses et ne conserver dans les fichiers de suivi que le résultat utile, jamais les journaux complets.
- Ouvrir une nouvelle tâche Codex lorsqu'une feature indépendante nécessiterait un autre domaine, un autre skill ou un autre ensemble de MCP.

Matrice de déclenchement par défaut :

| Domaine de la demande | Contexte ou outil supplémentaire autorisé |
| --- | --- |
| Code local | Fichiers concernés, dépendances directes et tests associés |
| Supabase ou Postgres | Skill Supabase approprié, schéma et migrations concernés |
| GitHub, PR ou CI | Plugin GitHub approprié uniquement |
| Email | Gmail uniquement |
| Documentation métier | Notion uniquement |
| API OpenAI ou Codex | Documentation OpenAI uniquement |
| PDF, présentation ou tableur | Skill documentaire correspondant uniquement |
| Information actuelle ou page distante | Recherche web ou navigateur, seulement si nécessaire |
| Création ou modification d'image | ImageGen uniquement |

Si la demande ne correspond à aucune ligne, rester sur le contexte local minimal jusqu'à ce qu'une dépendance soit démontrée.

## Gestion du contexte

- `docs/PROJECT_CONTEXT.md` décrit uniquement l'état stable du système.
- `docs/TASKS.md` contient la feuille de route et les identifiants de lots.
- `CURRENT_TASK.md` contient uniquement la mémoire de travail du lot actif.
- `docs/decisions/` conserve les décisions d'architecture durables.
- Git constitue l'historique durable ; ne pas recopier l'historique des commits dans les documents.
- Garder `CURRENT_TASK.md` sous 100 lignes et chaque résumé sous cinq lignes lorsque possible.
- Enregistrer le résultat utile des validations sans recopier leurs sorties complètes.

## Nommage cohérent

Au démarrage d'un lot, utiliser partout le même identifiant :

- tâche Codex : `BELL-<numéro> — <résultat attendu>` ;
- `CURRENT_TASK.md` et `docs/TASKS.md` : même identifiant et même intitulé ;
- branche : `codex/bell-<numéro>-<description-courte>` ;
- commit conventionnel : type et périmètre correspondant au lot.

Renommer la tâche Codex lorsque la feature active change réellement. Une feature indépendante doit obtenir un nouvel identifiant et, de préférence, une nouvelle tâche Codex.

## Git

- Ne jamais travailler directement sur `main` ou `master`.
- Vérifier la branche et l'état du dépôt avant toute modification.
- Préserver les changements existants hors périmètre.
- Ne pas créer de branche, worktree ou commit intermédiaire sans bénéfice concret.
- Produire un seul ensemble de changements cohérent par lot.
- Utiliser des commits conventionnels : `feat`, `fix`, `test`, `docs`, `chore`, `ci`.
- Créer un commit seulement quand le lot est cohérent et validé.
- Les commits locaux et les pushs vers les branches de travail sur `origin` sont autorisés sans confirmation supplémentaire de l'utilisateur.
- Pousser tout lot terminé sur sa branche `origin` afin que GitHub reflète l'état local utile ; un travail temporaire ou incomplet peut rester local s'il est explicitement signalé.
- Avant livraison, comparer les branches locales et distantes et signaler tout commit ou toute branche non publié.
- Ne jamais forcer un push ni réécrire une branche partagée sans autorisation explicite.
- Demander une autorisation explicite avant tout push vers `main` ou `master`.
- Demander une autorisation explicite avant tout merge important présentant un risque de casse ; les merges ordinaires et à faible risque sur une branche de travail sont autorisés sans confirmation supplémentaire.

## Validation avant livraison

- Exécuter les validations proportionnées au risque.
- Exécuter `git diff --check`.
- Examiner le diff et confirmer son périmètre.
- Vérifier qu'aucun secret, fichier temporaire, journal volumineux ou artefact parasite n'est inclus.
- Mettre à jour `CURRENT_TASK.md`, `docs/TASKS.md` et, seulement si nécessaire, le contexte stable ou une décision d'architecture.

Une tâche est `completed` uniquement lorsque le périmètre est livré, les validations prévues réussissent, le diff est examiné et aucune action nécessaire au lot ne reste ouverte.

Statuts autorisés : `pending`, `in_progress`, `blocked`, `ready_for_review`, `completed`.

## Sécurité

- Ne jamais ajouter de secret réel au dépôt.
- Utiliser des fichiers d'exemple pour documenter les variables d'environnement.
- Travailler de manière autonome dans le dépôt : lecture, édition, dépendances, tests, Git local et accès réseau ordinaires ne nécessitent pas de confirmation supplémentaire.
- Regrouper les opérations nécessitant une élévation dans une demande d'approbation unique et précisément délimitée lorsque cela est possible.
- Demander une autorisation avant toute opération irréversible ou sensible : suppression de données réelles, mise en production, migration destructive, changement de branche par défaut, réécriture Git partagée ou modification majeure d'architecture.
- Demander une confirmation avant tout envoi externe au nom de Belloria : email, message WhatsApp, invitation, publication ou modification irréversible d'un service distant.
- Les tests ne doivent pas contacter Gmail, Notion ou WhatsApp réels sans demande explicite.

## Rituel d'un lot

1. Examiner le contexte minimal, Git et la demande active.
2. Définir le périmètre et les critères de réussite dans `CURRENT_TASK.md`.
3. Renommer la tâche Codex en cohérence avec le lot.
4. Implémenter uniquement le périmètre annoncé.
5. Tester progressivement puis effectuer la validation de livraison.
6. Examiner le diff, les secrets et les fichiers parasites.
7. Mettre à jour le suivi et laisser une prochaine action immédiatement exploitable.
8. Committer si le lot est terminé et pousser sa branche de travail sur `origin` ; demander une autorisation uniquement dans les cas sensibles définis par les règles Git.
