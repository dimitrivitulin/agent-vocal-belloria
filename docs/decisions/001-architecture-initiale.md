# 001 — Architecture initiale du prototype

Date: 2026-08-03
Statut: acceptée

## Contexte

Belloria reçoit au maximum quelques demandes commerciales par jour. Une plateforme d'orchestration payante ou une infrastructure distribuée seraient disproportionnées. L'abonnement ChatGPT Work doit être utilisé pour la qualification lorsque cela est pertinent.

## Décision

Le prototype repose sur des filtres Gmail, une tâche ChatGPT Work cloud, Notion comme CRM, WAHA NOWEB pour la connexion WhatsApp et un serveur MCP Belloria sécurisé entre ChatGPT Work et WAHA.

Les traitements structurés, notamment les formulaires Tally, sont réalisés sans IA. ChatGPT Work intervient pour les emails libres, les commandes en langage naturel et les comptes rendus.

## Conséquences

- Le coût récurrent peut rester très faible.
- Le traitement dépend de la fréquence de la tâche ChatGPT Work et n'est pas instantané.
- WAHA nécessite un hébergement persistant et un stockage protégé.
- La connexion WhatsApp non officielle présente un risque de déconnexion ou de restriction.
- Un numéro de test distinct doit être utilisé avant toute adoption par Belloria.
