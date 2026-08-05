# BELL-032 — Mesure et amélioration de la conversion

Statut: completed
Branche: `codex/bell-032-mesure-conversion`
Dernière mise à jour: 2026-08-05

## Objectif

Mesurer le parcours demande→devis→confirmation et évaluer toute évolution du moteur de conversion avant son activation.

## Périmètre

- Calculer délai de première réponse, taux demande→devis, taux devis→confirmation, montant moyen, relances et motifs de perte.
- Produire une synthèse déterministe adaptée à Telegram et des propriétés structurées pour Notion.
- Constituer des cas de référence versionnés et comparer un moteur candidat à une référence.
- Ne contacter aucun service réel et ne modifier aucune donnée distante.

## Critères de réussite

- Les KPI distinguent données absentes, population éligible et résultats observés.
- Les montants respectent les preuves : devis envoyé pour le potentiel, facture pour le réalisé.
- Une régression d’action, d’offre ou de garde-fou est visible avant activation.
- Tests Python et Worker, `git diff --check` et examen du diff réussissent.

## Validation

- 77 tests Python et 18 tests Worker réussis.
- Calcul du funnel, populations vides, preuves financières et qualité des données couverts.
- Trois scénarios de référence vérifient action, offre et revue humaine ; les régressions sont nommées.
- Sorties Telegram/Notion pures, sans contact de service réel.

## Prochaine action

Définir le prochain lot produit à partir des retours d'usage de l'agent commercial complet.
