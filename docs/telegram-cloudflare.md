# Bot Telegram privé sur Cloudflare

## Résultat visé

Le bot remplace WhatsApp comme interface privée de Belloria : il reçoit des commandes texte ou vocales, permet à ChatGPT Work de les récupérer lors de son passage planifié et reçoit les comptes rendus confirmés. Le Worker n'accepte qu'un seul chat, ne conserve jamais les fichiers audio et ne peut pas envoyer vers un destinataire fourni par l'appelant.

Architecture :

1. Telegram envoie une mise à jour HTTPS à `POST /webhooks/telegram` avec un secret de webhook.
2. Le Worker refuse les chats non autorisés et insère chaque `update_id` une seule fois dans D1.
3. Un texte devient immédiatement une commande en attente. Un vocal de 5 Mio maximum est téléchargé, transcrit en français par Workers AI puis supprimé de la mémoire.
4. Le Worker répond aux intentions couvertes depuis un instantané D1 temporaire et frais ; les autres commandes restent disponibles pour le passage ChatGPT Work horaire.
5. Toute mutation reste une proposition et exige une confirmation Telegram exacte avant exécution.

## Environnement de test déployé

Le Worker `belloria-assistant` est disponible sur `https://belloria-assistant.belloria-dvitulin.workers.dev`. La migration D1 `0002_telegram_commands.sql` est appliquée, le binding Workers AI est actif et le bot privé `@BelloriaAssistantTestBot` est enregistré. Les quatre secrets et le webhook sont configurés depuis BELL-017 ; leurs valeurs restent uniquement dans les stockages protégés locaux et Cloudflare.

## Secrets

Copier `.dev.vars.example` vers `.dev.vars` et remplacer les quatre valeurs. `.dev.vars` est exclu de Git.

- `TELEGRAM_BOT_TOKEN` : jeton remis par `@BotFather`.
- `TELEGRAM_WEBHOOK_SECRET` : valeur aléatoire longue, limitée aux lettres, chiffres, `_` et `-` pour respecter le contrat Telegram.
- `TELEGRAM_ALLOWED_CHAT_ID` : identifiant du chat privé Belloria ; il reste le seul chat capable d'envoyer des commandes au Worker.
- `TELEGRAM_NOTIFICATION_CHAT_ID` : identifiant facultatif d'un groupe Telegram interne. Lorsqu'il est défini, les notifications Tally y sont publiées ; les confirmations et commandes restent dans le chat privé.
- `BELLORIA_MCP_TOKEN` : jeton distinct protégeant le MCP.

## Activation du bot de test

1. Dans Telegram, ouvrir `@BotFather`, envoyer `/newbot`, choisir un nom et un identifiant se terminant par `bot`, puis conserver le jeton uniquement dans `.dev.vars`.
2. Ouvrir le nouveau bot et lui envoyer `/start`.
3. Exécuter `npm run telegram:chats`. Le script lit le jeton depuis `.dev.vars` et n'affiche que les identifiants de chats trouvés. Reporter l'identifiant privé dans `TELEGRAM_ALLOWED_CHAT_ID`.
4. Appliquer les migrations avec `npx wrangler d1 migrations apply belloria-whatsapp --remote`.
5. Charger les secrets avec `npx wrangler secret bulk .dev.vars`, puis déployer avec `npx wrangler deploy`.
6. Enregistrer le webhook avec `npm run telegram:webhook -- https://<worker>/webhooks/telegram`.
7. Envoyer un texte fictif puis un vocal court. Vérifier par MCP que chacun apparaît une seule fois, sans utiliser de donnée client.

Cette procédure a été validée de bout en bout le 2026-08-04 : texte idempotent, deux transcriptions vocales, quarantaine d'un vocal vide, suppression des références audio et nettoyage des commandes terminées.

Le script de préparation ne journalise jamais le jeton, les messages ou les noms de compte. Les commandes Wrangler chiffrent les secrets côté Cloudflare ; leur valeur n'est pas placée dans `wrangler.jsonc`.

## Groupe de notifications interne

Pour que plusieurs personnes reçoivent chaque nouvelle demande sans leur donner accès aux commandes commerciales :

1. Créer un groupe Telegram et y ajouter les collaborateurs, puis y ajouter le bot.
2. Relever l'identifiant du groupe (il commence normalement par `-100`). Avec le webhook déjà actif, `npm run telegram:chats` renvoie volontairement une erreur Telegram 409 ; utiliser un bot Telegram d'identification ajouté temporairement au groupe, ou planifier une brève suspension du webhook avant d'utiliser ce script.
3. Ajouter cet identifiant comme secret `TELEGRAM_NOTIFICATION_CHAT_ID`, puis déployer le Worker. Ne remplacez pas `TELEGRAM_ALLOWED_CHAT_ID` : il protège le chat privé de pilotage.
4. Déclencher une soumission Tally de test : le résumé non sensible doit apparaître une seule fois dans le groupe.

Les membres du groupe voient les notifications, mais leurs messages ne deviennent pas des commandes du bot. Éviter d'y inviter des prospects : les résumés y restent visibles pour tous les membres.

## Vérifications fonctionnelles

- `GET /health` répond avec `status=ok` et `channel=telegram`.
- Un secret de webhook incorrect reçoit HTTP 401.
- Un autre chat reçoit une réponse HTTP 200 avec `accepted=0` afin d'éviter les nouvelles tentatives Telegram, sans créer de commande.
- Une nouvelle commande apparaît via `belloria_list_commands` ; une livraison répétée du même `update_id` n'ajoute rien. Un vocal refusé apparaît avec `status=quarantined` et un code d'erreur sans contenu audio.
- `belloria_complete_command` efface le texte après confirmation.
- `belloria_send_text` ignore tout destinataire externe et envoie uniquement au chat configuré après confirmation.
- `belloria_refresh_fast_snapshots` remplace atomiquement les instantanés temporaires ; un contexte absent, ambigu ou périmé est refusé sans perdre la commande.

## Retour arrière

Exécuter `npm run telegram:remove-webhook` pour interrompre immédiatement les nouvelles commandes sans supprimer D1 ni le bot. La suppression du bot, des secrets Worker, de la table D1 ou du Worker est destructive et demande une confirmation explicite. Les commandes déjà en attente peuvent être terminées ou supprimées dans un lot de nettoyage distinct.

## Limites et sources

Le bot est une interface d'administration ; il ne peut pas initier une conversation tant que le propriétaire ne lui a pas écrit et il ne doit pas être partagé avec les clients. Les tarifs et limites de Workers AI sont susceptibles d'évoluer.

Sources officielles consultées le 2026-08-03 :

- [Telegram Bot API — webhooks, messages vocaux et fichiers](https://core.telegram.org/bots/api)
- [Telegram — création d'un bot avec BotFather](https://core.telegram.org/bots/features#botfather)
- [Cloudflare Workers — vue d'ensemble](https://developers.cloudflare.com/workers/)
- [Cloudflare Workers — secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare Workers AI — Whisper large v3 turbo](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/)
