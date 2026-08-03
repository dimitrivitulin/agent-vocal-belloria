# Prototype WhatsApp sans serveur

## Résultat

Le prototype confirme que l’entrée WhatsApp peut être une fonction HTTP sans processus persistant. Le cœur dans `belloria_cloud/webhook.py` vérifie le challenge Meta, authentifie le corps brut avec `X-Hub-Signature-256` et extrait des clés d’idempotence depuis des événements synthétiques. Aucun appel Meta ni déploiement n’est nécessaire pour ces garanties.

## Cible retenue

La cible de BELL-013 est **Cloudflare Workers avec D1** : un Worker public reçoit le webhook et expose ultérieurement le MCP authentifié ; D1 conserve les reçus d’idempotence, l’état de traitement et une file légère. Les secrets du Worker contiennent le jeton de vérification Meta, l’App Secret, le jeton d’accès Cloud API et les secrets MCP. Les contenus métier durables restent dans Notion.

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
- BELL-012 implémente l’adaptateur Cloud API et la normalisation complète, avec doubles HTTP.
- BELL-013 porte le cœur dans le runtime Worker, crée le schéma D1, l’authentification MCP, les reprises et le déploiement.
- BELL-014 effectue seulement ensuite la validation avec le numéro de test Meta.

## Limites du prototype

Le prototype ne prouve ni l’éligibilité du compte Meta, ni la livraison réseau, ni la fenêtre de service, ni les modèles, ni les coûts Meta. Il ne traite pas encore tous les types de messages et ne constitue pas un endpoint déployable tel quel.
