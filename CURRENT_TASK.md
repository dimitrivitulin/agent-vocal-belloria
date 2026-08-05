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
- Stockage D1 des propositions et consommation atomique d’une confirmation Telegram exacte, avec expiration et protection contre le rejeu.

## Validation

- 63 tests Python réussis, dont 8 scénarios conversationnels dédiés et le contrat SQL D1 réel.
- 13 tests Worker réussis ; `git diff --check` réussi.
- Diff, périmètre, secrets et artefacts contrôlés.

## Prochaine action

Après autorisation explicite, appliquer la migration D1 et déployer le Worker ; reconnecter l’application MCP si nécessaire, puis mesurer la latence réelle avant de passer BELL-030 à `completed`.
