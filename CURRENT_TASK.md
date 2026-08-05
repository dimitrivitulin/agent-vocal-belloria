# BELL-030 — Agent conversationnel Telegram

Statut: ready_for_review
Branche: `codex/bell-030-agent-telegram`
Dernière mise à jour: 2026-08-05

## Objectif

Brancher les commandes Telegram texte ou vocales au contexte prospect 360 et au moteur de conversion, avec confirmation explicite avant toute mutation.

## Résultat livré

- Orchestrateur commun aux commandes texte et aux transcriptions vocales.
- Consultations, résolution non ambiguë, contexte 360 et recommandations du moteur de conversion.
- Proposition traçable avec contenu exact, conséquence, sources et approbation à usage unique valable dix minutes.
- Adaptateurs injectés pour isoler Gmail, Notion et Telegram ; aucun service réel contacté par les tests.

## Validation

- 62 tests Python réussis, dont 8 scénarios conversationnels dédiés.
- 11 tests Worker réussis ; `git diff --check` réussi.
- Diff, périmètre, secrets et artefacts contrôlés.

## Prochaine action

Brancher un stockage D1 atomique des approbations et l’adaptateur d’exécution interactive au Worker, puis mesurer la latence réelle avant de passer BELL-030 à `completed`.
