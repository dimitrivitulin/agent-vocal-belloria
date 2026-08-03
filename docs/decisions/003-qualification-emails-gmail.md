# ADR-003 — Qualifier Gmail par message avec Notion comme autorité d'idempotence

Statut: accepté
Date: 2026-08-03

## Contexte

Gmail doit isoler quelques demandes commerciales par jour sans envoyer newsletters et notifications inutiles à l'IA. Un fil peut recevoir de nouveaux messages après son premier traitement et les labels Gmail peuvent être modifiés indépendamment du CRM.

## Décision

Les filtres Gmail constituent une file de candidats et attribuent une source lorsqu'elle est déterministe. L'automatisation traite chaque message séparément, utilise le `messageId` pour l'idempotence et le `threadId` pour rattacher l'échange à une opportunité. Les formulaires Tally reconnus sont parsés sans IA ; les emails libres sont qualifiés de manière structurée. Notion et son champ `Tech — IDs messages traités` sont l'autorité de succès ; les labels Gmail servent au routage et à l'observation.

## Conséquences

- Une nouvelle réponse dans un fil reste traitable indépendamment des messages précédents.
- Un échec de mise à jour des labels après un succès CRM ne produit pas de doublon.
- Les filtres doivent être validés sur des échantillons réels anonymisés avant activation.
- Les libellés Tally et expéditeurs reconnus deviennent une configuration versionnée.
- Les ambiguïtés sont dirigées vers une revue humaine et aucun email n'est envoyé automatiquement.
