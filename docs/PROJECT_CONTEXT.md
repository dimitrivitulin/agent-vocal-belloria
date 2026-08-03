# Contexte du projet Belloria

## Objectif

Automatiser le traitement des demandes commerciales reçues sur Gmail, maintenir le CRM Belloria dans Notion et permettre le pilotage ainsi que les comptes rendus depuis WhatsApp.

Le volume attendu est faible : quelques demandes de devis par jour. Le système doit rester simple, économique, traçable et facile à reprendre.

## Périmètre fonctionnel visé

- Détecter les emails commerciaux pertinents sans analyser les newsletters et notifications sans intérêt.
- Extraire directement les formulaires Tally structurés.
- Utiliser ChatGPT Work uniquement lorsqu'une qualification ou une compréhension en langage naturel est nécessaire.
- Rechercher, créer ou mettre à jour le contact et l'opportunité correspondants dans Notion.
- Envoyer un compte rendu sur WhatsApp.
- Recevoir des commandes WhatsApp en texte ou en vocal.
- Préparer les réponses Gmail et demander une validation avant envoi.

## Architecture retenue à ce stade

- Gmail applique des filtres et labels aux messages candidats.
- Une tâche ChatGPT Work cloud consulte périodiquement les éléments à traiter.
- Notion constitue la source de vérité du CRM métier.
- WAHA Core, avec le moteur NOWEB, fournit une connexion WhatsApp Web non officielle.
- Un serveur MCP Belloria sécurisé masque WAHA et n'expose que des actions limitées à ChatGPT Work.
- Une petite machine cloud persistante héberge WAHA et le MCP ; Oracle Cloud Always Free est le candidat actuel pour le prototype.

Cette architecture reste susceptible d'évoluer après validation du prototype. Les décisions durables sont consignées dans `docs/decisions/`.

## Flux principal envisagé

1. Gmail reçoit un email et applique un label de qualification initiale.
2. ChatGPT Work récupère les nouveaux candidats lors de son prochain passage.
3. Les messages Tally sont parsés sans IA ; les emails libres sont qualifiés si nécessaire.
4. Le système recherche un doublon par email, téléphone, date et type d'événement.
5. Le CRM Notion est créé ou actualisé.
6. Un compte rendu est envoyé sur WhatsApp par le MCP Belloria.
7. Le message est marqué comme traité de manière idempotente.

## Contraintes importantes

- Le moteur doit être proportionné à un faible volume et éviter les services d'orchestration payants.
- ChatGPT Work fonctionne par tâche planifiée et ne reçoit pas directement un webhook Gmail ou WhatsApp.
- Une connexion WhatsApp Web non officielle peut être déconnectée ou restreinte par WhatsApp.
- Le numéro principal Belloria ne doit pas être utilisé pendant les premiers tests.
- WAHA ne doit jamais être exposé directement à Internet.
- Les sessions WhatsApp sont des secrets critiques et doivent utiliser un stockage persistant protégé.
- Aucun email client ne doit être envoyé automatiquement au début du projet.

## Sources de demandes observées

- Tally — formulaire « Devis express » ;
- emails directs de prospects et de clients ;
- Mariages.net ;
- Événementiel Pour Tous.

Les emails promotionnels, notifications sociales et factures techniques doivent être exclus avant tout traitement IA.

## État actuel

Le projet est en phase d'organisation et de conception. Aucun service, compte réel, secret ou déploiement de production n'est encore configuré dans le dépôt.
