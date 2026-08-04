# BELL-026 — Cadrage agent commercial Telegram

Statut: completed
Branche: `codex/bell-026-cadrage-agent-commercial-telegram`
Dernière mise à jour: 2026-08-04

## Objectif

Transformer la feuille de route en programme de construction d'un agent commercial Belloria piloté depuis Telegram, capable de reconstruire un contexte prospect fiable, de maîtriser les prestations et de recommander l'action qui maximise les chances de conversion.

## Critères de réussite

- Telegram reste l'interface privée de pilotage texte et vocal.
- Le contexte prospect 360 et ses règles de preuve sont définis.
- Le référentiel commercial nécessaire à une recommandation fiable est défini.
- Le backlog sépare connaissance, contexte, recommandation, exécution et mesure.
- Les actions client restent soumises à une validation explicite.
- La priorité suivante est immédiatement exploitable.

## Fichiers concernés

- `CURRENT_TASK.md`
- `docs/TASKS.md`
- `docs/PROJECT_CONTEXT.md`
- `docs/agent-commercial-telegram.md`

## Décisions de périmètre

- L'agent écrit uniquement dans le CRM Belloria ; les autres dossiers Notion restent hors périmètre de mutation.
- Gmail, Tally, les devis envoyés et les factures servent de preuves avec une provenance conservée.
- Le transport Telegram existant est conservé ; sa boucle horaire devient un secours, pas la cible d'expérience conversationnelle.

## Prochaine action

Exécuter `BELL-027 — Référentiel commercial Belloria` avant de produire automatiquement des recommandations ou des réponses commerciales.

## État vérifié

- La feuille de route active contient six lots ordonnés de la connaissance à la mesure.
- Le dossier prospect 360, la hiérarchie des preuves et les limites de mutation sont définis.
- L'expérience Telegram cible distingue consultation, proposition, confirmation et exécution.
- `BELL-027` est la seule prochaine priorité fonctionnelle.
