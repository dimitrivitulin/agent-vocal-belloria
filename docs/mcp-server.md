# Serveur MCP Belloria

## Surface active sur Cloudflare

Le Worker expose le contrat JSON-RPC sur `POST /mcp`. Chaque requête exige `Authorization: Bearer <BELLORIA_MCP_TOKEN>`. Le canal est fixé côté serveur : aucun outil ne permet à l'appelant de choisir un chat Telegram ou un autre destinataire.

Outils exposés :

- `belloria_channel_status` indique seulement si Telegram et la transcription sont configurés ; aucun identifiant ni secret n'est renvoyé.
- `belloria_list_commands` retourne au plus 20 commandes en attente, avec le texte ou la transcription vocale, ainsi que les erreurs vocales mises en quarantaine.
- `belloria_complete_command` exige `confirmed: true`, marque une commande en attente ou en quarantaine comme traitée et efface son contenu dans D1.
- `belloria_send_text` exige le texte exact et `confirmed: true`, puis envoie uniquement vers le chat Belloria configuré.

Le webhook `POST /webhooks/telegram` vérifie `X-Telegram-Bot-Api-Secret-Token`, compare l'identifiant du chat avec la valeur autorisée et dédoublonne `update_id` dans D1. Un vocal de 5 Mio maximum est téléchargé en mémoire, transcrit en français par Workers AI puis abandonné ; seul le texte transcrit reste jusqu'à la fin de la commande.

## Configuration

Les secrets `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ALLOWED_CHAT_ID` et `BELLORIA_MCP_TOKEN` sont configurés comme secrets Worker. Ils ne doivent apparaître ni dans `wrangler.jsonc`, ni dans Git, ni dans les journaux. Le binding `AI` et le binding D1 `DB` sont déclarés dans `wrangler.jsonc`.

## Adaptateurs historiques

Le serveur Python et les adaptateurs WAHA/Meta restent dans le dépôt uniquement comme prototypes historiques testés. Ils ne font pas partie du Worker actif et aucune variable `META_*` ne doit être configurée. La décision durable du canal courant est décrite dans `docs/decisions/008-canal-telegram-cloudflare.md`.

## Validation

Les tests remplacent D1, Telegram et Workers AI par des doubles. Ils couvrent le secret de webhook, la liste blanche du chat, l'idempotence, la limite des vocaux, l'effacement des commandes et la confirmation avant envoi sans aucun appel réel.
