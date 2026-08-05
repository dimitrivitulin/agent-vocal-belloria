# BELL-031 — Boucle anti-perte et suivi automatique

Statut: completed
Branche: `codex/bell-031-boucle-anti-perte`
Dernière mise à jour: 2026-08-05

## Objectif

Détecter les opportunités commerciales oubliées, garantir une prochaine action datée pour chaque prospect actif et produire un briefing Telegram sans doublon.

## Périmètre

- Détecter : demande sans réponse, relance échue, devis silencieux, acompte attendu, événement proche ou passé, collision avec une prestation confirmée.
- Planifier une correction CRM idempotente lorsque la prochaine action ou son échéance manque ou est obsolète.
- Dédupliquer les anomalies déjà signalées et rendre le briefing Telegram déterministe.
- Ne pas mesurer les KPI de conversion, envoyer d’email ni contacter les services réels.

## Critères de réussite

- Toute opportunité non terminale obtient une prochaine action et une échéance.
- Les six familles d’anomalies sont couvertes avec priorités et règles explicites.
- Un second passage identique ne remonte aucun doublon et ne produit aucune mutation supplémentaire.
- Tests Python et `git diff --check` réussissent.

## Validation

- 71 tests Python et 18 tests Worker réussis.
- Les six familles métier, la clôture des événements passés, la priorité, le repli avec action datée et le briefing sont couverts.
- Un rejeu identique, y compris le lendemain, ne remonte ni alerte ni mutation en double.
- `git diff --check` réussi ; aucun service réel contacté et aucun secret ajouté.

## Prochaine action

Exécuter `BELL-032 — Mesure et amélioration de la conversion` dans une tâche et une branche indépendantes.
