# 008 — Canal Telegram privé sur Cloudflare

Date: 2026-08-03
Statut: acceptée

## Contexte

Belloria a besoin d'un canal mobile simple pour recevoir les comptes rendus, envoyer des commandes texte ou vocales et confirmer les actions sensibles. La voie WhatsApp officielle est abandonnée et WAHA réintroduirait une machine persistante ainsi qu'une session non officielle fragile.

Telegram fournit une Bot API avec webhooks HTTPS, messages texte, messages vocaux et notifications mobiles sans vérification Meta Business. Cloudflare Workers peut recevoir le webhook, D1 peut assurer l'idempotence et Workers AI peut transcrire les vocaux sans serveur permanent.

## Décision

Le canal mobile Belloria devient un bot Telegram privé hébergé sur Cloudflare Workers. Un secret de webhook authentifie Telegram et un identifiant de chat unique limite l'accès au compte Belloria. D1 conserve les commandes en attente et leur transcription, mais jamais les fichiers audio. Le MCP envoie les rapports vers ce chat fixe et n'accepte aucun destinataire fourni par l'appelant.

Les vocaux sont téléchargés de manière bornée depuis Telegram, transcrits en français avec `@cf/openai/whisper-large-v3-turbo`, puis abandonnés en mémoire. Les secrets restent dans les bindings chiffrés du Worker.

## Conséquences

- Aucune VM, session WhatsApp, validation Meta Business ou numéro téléphonique dédié n'est nécessaire.
- Le propriétaire doit disposer de Telegram et initier lui-même la conversation avec le bot avant tout envoi.
- Le bot ne remplace pas un canal client : il sert uniquement d'interface privée d'administration Belloria.
- Le coût de transcription Workers AI dépend de l'usage et doit être surveillé ; les vocaux sont limités en taille.
- Une petite application web privée reste une solution de repli si Telegram est refusé ultérieurement.
