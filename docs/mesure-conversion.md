# Mesure et amélioration de la conversion

Le calcul est local, déterministe et sans écriture distante. Il prend une population explicite de parcours commerciaux sur une période choisie ; aucune absence de donnée n'est transformée en zéro métier.

## Indicateurs

- Le délai de première réponse est la médiane entre la demande et la première réponse Belloria tracée.
- Le taux demande → devis compte uniquement un devis réellement envoyé.
- Le taux devis → confirmation utilise comme dénominateur les devis envoyés.
- Le montant potentiel moyen vient uniquement des devis envoyés ; le réalisé moyen uniquement des factures liées à une confirmation.
- Les relances, pertes, motifs manquants et premières réponses manquantes restent visibles.

La sortie `notion_properties()` fournit des propriétés structurées à écrire dans une fiche de pilotage par un adaptateur autorisé. `telegram_briefing()` fournit une synthèse compacte. Le noyau n'appelle ni Notion ni Telegram.

## Évaluation avant activation

Les cas de référence versionnés fixent l'action attendue, l'offre cœur et l'exigence de revue humaine. Une version candidate est activable seulement si tous les cas passent. `compare_candidate()` signale les cas qui passaient avec la référence et régressent avec la candidate ; une modification de prompt, règle ou référentiel doit être comparée avant déploiement.
