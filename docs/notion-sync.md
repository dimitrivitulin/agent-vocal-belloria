# Synchronisation du CRM Notion

Le module `belloria_notion` applique localement les règles de rapprochement et d'idempotence définies dans `docs/notion-crm-model.md`. Il ne contient aucun secret et ses tests utilisent uniquement `MemoryGateway`.

## Flux

1. Normaliser l'email, le téléphone E.164 et les textes.
2. Rechercher le contact par email, puis téléphone ; refuser tout conflit.
3. Rechercher l'opportunité par fil Gmail, ou par `messageId` pour Tally, puis par clé contact/date/type.
4. Ignorer un message Gmail déjà traité.
5. Compléter uniquement les champs vides et conserver les champs commerciaux existants.
6. Enregistrer l'ID du message après la réussite de toute la transaction.

## Adaptateur Notion à fournir

Un adaptateur de production doit implémenter le contrat `Gateway` avec une transaction compensable : les créations et mises à jour doivent être annulées ou rester rejouables si une mutation échoue. Les identifiants des deux bases et le jeton Notion devront venir de variables d'environnement, jamais de l'appelant.

## Écart avec le CRM réel observé le 3 août 2026

Le CRM connecté comporte actuellement une base unique `Prospects & Clients` et une base `Prestations`. Le modèle cible BELL-002 prévoit plutôt `Contacts` et `Opportunités`, ainsi que des propriétés techniques absentes du schéma actuel. Aucune migration distante n'a été exécutée : elle devra être préparée et confirmée séparément afin de préserver les données existantes.
