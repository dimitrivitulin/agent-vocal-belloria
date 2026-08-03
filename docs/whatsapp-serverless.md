# Prototype WhatsApp sans serveur

> **Statut gelé depuis le 2026-08-03.** Belloria a abandonné la voie WhatsApp Cloud API officielle. Ne pas reprendre l'examen Meta, connecter une application ou configurer de secrets. Ce document conserve uniquement les acquis techniques du prototype.

## Résultat

Le prototype confirme que l’entrée WhatsApp peut être une fonction HTTP sans processus persistant. Le cœur dans `belloria_cloud/webhook.py` vérifie le challenge Meta, authentifie le corps brut avec `X-Hub-Signature-256`, extrait les clés d’idempotence et normalise les champs utiles des messages et statuts. L'adaptateur Python envoie le texte et récupère les médias derrière un transport HTTP remplaçable. Aucun appel Meta ni déploiement n’est nécessaire pour ces garanties.

## Ancienne cible technique (gelée)

La cible définie pour BELL-013 était **Cloudflare Workers avec D1** : un Worker public reçoit le webhook et expose ultérieurement le MCP authentifié ; D1 conserve les reçus d’idempotence, l’état de traitement et une file légère. Les secrets prévus comprenaient le jeton de vérification Meta, l’App Secret, le jeton d’accès Cloud API et les secrets MCP. Aucun de ces secrets Meta ne doit maintenant être configuré. Les contenus métier durables restent dans Notion.

À faible volume, les limites gratuites publiées (100 000 requêtes par jour, 10 ms CPU par invocation et 50 sous-requêtes) sont compatibles avec vérification, insertion d’un reçu et mise en file. D1 Free annonce 500 Mo par base, 5 Go par compte et 7 jours de restauration temporelle. Ce sont des limites contractuelles susceptibles de changer, pas une promesse de gratuité permanente.

Vercel Functions a été écarté comme cible gratuite principale : son plan Hobby est décrit comme personnel/non commercial. Il reste une option payante viable, mais n’apporte pas ici l’intégration stockage et les garde-fous de coût recherchés.

Sources officielles consultées le 2026-08-03 :

- [Limites Cloudflare Workers](https://developers.cloudflare.com/workers/platform/limits/)
- [Tarification Cloudflare Workers et D1](https://developers.cloudflare.com/workers/platform/pricing/)
- [Limites Cloudflare D1](https://developers.cloudflare.com/d1/platform/limits/)
- [Plan Vercel Hobby](https://vercel.com/docs/plans/hobby)

## Contrats figés

### Entrée Meta

- `GET /webhooks/meta` compare en temps constant `hub.verify_token`, exige `hub.mode=subscribe` et renvoie textuellement `hub.challenge`.
- `POST /webhooks/meta` vérifie `X-Hub-Signature-256=sha256=<hex>` sur les octets exacts du corps avant tout décodage.
- Seuls `object=whatsapp_business_account` et `field=messages` entrent dans le traitement.
- Une notification est acquittée rapidement après validation et enregistrement atomique ; les appels Gmail, Notion et médias sont asynchrones.

### Idempotence et stockage

- Message entrant : clé `wamid` fournie dans `messages[].id`.
- Statut sortant : clé composite `<wamid>:<status>` car un message traverse plusieurs états.
- D1 impose une contrainte unique sur la clé ; une livraison répétée acquitte sans répéter les effets.
- Le reçu minimal contient clé, type, identifiant du numéro, état, nombre de tentatives et horodatages. Le corps brut n’est pas conservé par défaut.
- Les erreurs transitoires restent rejouables ; après un seuil défini en BELL-013, elles passent en quarantaine avec données personnelles minimisées.

### Sécurité et exploitation

- Les jetons ne sont jamais stockés dans Git, D1 ou les journaux.
- Les journaux excluent téléphone, texte, URL média et corps brut ; ils utilisent la clé d’événement tronquée ou hachée.
- Le téléchargement d’un média utilise un jeton côté serveur, limite taille et type, puis supprime rapidement le fichier temporaire.
- Une réponse webhook rapide ne signifie pas traitement métier réussi : la reprise s’appuie sur l’état D1.
- Une exportation régulière des reçus utiles et le runbook de restauration seront livrés avec BELL-013.

## Découpage de réalisation

- BELL-011 introduit une interface de passerelle sans dépendance WAHA ou Meta.
- BELL-012 implémente l’adaptateur Cloud API et la normalisation des messages/statuts utiles, avec doubles HTTP. Les nouveaux types Meta devront être ajoutés explicitement lorsqu'ils deviennent nécessaires.
- BELL-013 porte le cœur dans le runtime Worker, crée le schéma D1, l’authentification MCP, les reprises et le déploiement.
- BELL-014 devait effectuer la validation avec le numéro de test Meta ; ce lot est arrêté avant création de l'application et avant soumission de l'examen.

## Worker Cloudflare livrable

Le Worker dans `worker/src/index.js` expose `GET/POST /webhooks/meta`, `POST /mcp` et `GET /health`. La migration `worker/migrations/0001_webhook_receipts.sql` crée la table D1 des reçus. Elle ne conserve ni corps brut, ni texte, ni numéro de contact, ni URL média. Le cron reprend au plus dix événements par passage ; après cinq échecs, le reçu passe en quarantaine. Les journaux ne contiennent qu'une clé tronquée et un code d'erreur assaini.

### Préparation et validation locale

1. Copier `.dev.vars.example` vers `.dev.vars` et remplacer uniquement avec des valeurs de test.
2. Installer avec `npm install`, puis exécuter `npm test`.
3. Vérifier le bundle avec `npx wrangler deploy --dry-run`.
4. Créer la base D1, reporter son identifiant dans `wrangler.jsonc`, puis appliquer localement `npx wrangler d1 migrations apply belloria-whatsapp --local`.

### Déploiement historique de test (gelé)

La procédure prévoyait de créer les secrets avec `npx wrangler secret put <NOM>`, d'appliquer la migration distante, puis de déployer. Elle ne doit plus être exécutée tant que la décision 007 reste active. Aucun secret ne doit être placé dans `wrangler.jsonc`, D1 ou les journaux.

L’environnement de test BELL-014 utilise la base D1 `belloria-whatsapp` et le Worker `belloria-whatsapp` sur `belloria-whatsapp.belloria-dvitulin.workers.dev`. La migration initiale est appliquée. Aucun secret Meta ne doit être configuré : cet environnement reste une archive technique incapable d'authentifier un webhook Meta réel ou d'envoyer un message WhatsApp.

### Sauvegarde et restauration

Avant une modification de schéma, exporter la base avec `npx wrangler d1 export belloria-whatsapp --remote --output backup.sql`. Restaurer dans une base neuve avec `npx wrangler d1 execute <nouvelle-base> --remote --file backup.sql`, vérifier les comptes par état, puis changer le binding lors d'un déploiement contrôlé. La restauration temporelle D1 peut compléter cette exportation ; ses limites doivent être vérifiées au moment de l'opération.

## Limites du prototype

Le prototype ne prouve ni l’éligibilité du compte Meta, ni la livraison réseau, ni la fenêtre de service, ni les modèles, ni les coûts Meta. Il ne traite pas encore tous les types de messages et ne constitue pas un endpoint déployable tel quel.
