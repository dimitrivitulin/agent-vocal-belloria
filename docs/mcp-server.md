# Serveur MCP Belloria

## Surface active sur Cloudflare

Le Worker expose le contrat JSON-RPC sur `POST /mcp`. L'accès distant suit OAuth 2.1 pour MCP avec PKCE S256, découverte RFC 8414/RFC 9728 et enregistrement dynamique des clients. Le canal est fixé côté serveur : aucun outil ne permet à l'appelant de choisir un chat Telegram ou un autre destinataire.

Le secret `BELLORIA_MCP_TOKEN` authentifie uniquement le propriétaire sur la page `/authorize`. Il n'est jamais remis à ChatGPT : le Worker émet des jetons OAuth temporaires distincts, dont le stockage technique est géré dans le namespace KV `OAUTH_KV`. Les requêtes directes vers `/mcp` sans jeton OAuth valide sont refusées avant d'atteindre les outils.

Outils exposés :

- `belloria_channel_status` indique seulement si Telegram et la transcription sont configurés ; aucun identifiant ni secret n'est renvoyé.
- `belloria_list_commands` retourne au plus 20 commandes en attente, avec le texte ou la transcription vocale, ainsi que les erreurs vocales mises en quarantaine.
- `belloria_complete_command` exige `confirmed: true`, marque une commande en attente ou en quarantaine comme traitée et efface son contenu dans D1.
- `belloria_propose_action` conserve dans D1 le prospect, les sources, le contenu exact, la conséquence et un jeton d’approbation pendant quinze minutes au maximum.
- `belloria_consume_approved_action` exige `confirmed: true` et l’identifiant d’une commande Telegram contenant exactement `CONFIRMER <jeton>` ; l’action est consommée atomiquement et ne peut pas être rejouée.
- `belloria_send_text` exige le texte exact et `confirmed: true`, puis envoie uniquement vers le chat Belloria configuré.

Le webhook `POST /webhooks/telegram` vérifie `X-Telegram-Bot-Api-Secret-Token`, compare l'identifiant du chat avec la valeur autorisée et dédoublonne `update_id` dans D1. Un vocal de 5 Mio maximum est téléchargé en mémoire, transcrit en français par Workers AI puis abandonné ; seul le texte transcrit reste jusqu'à la fin de la commande.

## Configuration

Les secrets `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ALLOWED_CHAT_ID` et `BELLORIA_MCP_TOKEN` sont configurés comme secrets Worker. Ils ne doivent apparaître ni dans `wrangler.jsonc`, ni dans Git, ni dans les journaux. Les bindings `AI`, D1 `DB` et KV `OAUTH_KV` sont déclarés dans `wrangler.jsonc`.

## Connexion à ChatGPT

1. Dans ChatGPT web, activer le mode développeur puis créer une application personnalisée.
2. Utiliser le nom `Belloria`, l'URL `https://belloria-assistant.belloria-dvitulin.workers.dev/mcp` et l'authentification `OAuth`.
3. Lancer l'analyse des outils, ouvrir le flux d'autorisation et saisir localement la valeur de `BELLORIA_MCP_TOKEN` dans la page Belloria.
4. Vérifier que les quatre outils attendus sont détectés avant de créer l'application.

Ne jamais choisir `Aucune authentification` ou `Mixte` pour contourner OAuth.

## Adaptateurs historiques

Le serveur Python et les adaptateurs WAHA/Meta restent dans le dépôt uniquement comme prototypes historiques testés. Ils ne font pas partie du Worker actif et aucune variable `META_*` ne doit être configurée. La décision durable du canal courant est décrite dans `docs/decisions/008-canal-telegram-cloudflare.md`.

## Validation

Les tests remplacent D1, Telegram et Workers AI par des doubles. Ils couvrent le secret de webhook, la liste blanche du chat, l'idempotence, la limite des vocaux, l'effacement des commandes, la confirmation exacte, l’expiration et le rejeu sans aucun appel réel.
