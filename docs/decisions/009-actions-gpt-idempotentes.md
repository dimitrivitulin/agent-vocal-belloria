# ADR-009 — Actions GPT confirmées, idempotentes et traçables

Date: 2026-08-09
Statut: acceptée

## Contexte

Les mutations exposées par `worker/src/gpt-actions.js` appellent actuellement Gmail ou Notion dès que le même appel HTTP authentifié contient `confirmed: true`. Le Worker ne peut ni prouver une validation humaine, ni relier l'exécution au contenu présenté, ni dédupliquer un rejeu, ni distinguer un échec certain d'un effet externe accepté dont la réponse a été perdue.

Le mécanisme Telegram existant apporte un canal humain allowlisté, un jeton expirant et une consommation atomique D1, mais consomme l'approbation avant de connaître le résultat externe. Il ne doit donc pas être réutilisé tel quel.

## Décision

D1 reste l'unique persistance. Une action externe est créée avant confirmation avec :

- un `action_id` généré par le Worker ;
- une origine persistée générique, `source_type` et `source_id` ; BELL-046 autorise uniquement `telegram_command` et exige un `command_id` D1 existant ;
- une `creation_key` dérivée par le Worker de l'origine, du type d'action et de la cible canonique ;
- un type, une cible et un payload canonique immuable ;
- une expiration, une empreinte SHA-256 du contenu canonique et un jeton de confirmation généré par le Worker ;
- le texte exact présenté dans Telegram et les références du message présenté puis de la confirmation allowlistée.

Un UUID inventé par GPT n'est pas une clé de rejeu fiable : une réponse HTTP perdue peut conduire le modèle à générer une nouvelle valeur. Une action ne peut donc être créée que depuis une intention déjà persistée côté Belloria. Une même source ne produit qu'une action du même type vers la même cible : un rejeu au contenu identique retrouve l'action existante ; un payload différent sous cette même `creation_key` est refusé. Une seconde intention humaine exige une nouvelle source.

La machine d'état minimale est :

`pending → approved → claimed → succeeded`

avec `failed`, `unknown` et `expired` préparés dans le schéma. La confirmation Telegram fait uniquement `pending → approved`, après preuve que le texte persisté a été présenté dans le chat allowlisté. L'exécution future réclamera atomiquement une action `approved`, puis persistera le début du dispatch et le résultat fournisseur.

Un claim expiré sans début de dispatch peut être repris. Après un dispatch dont le résultat est ambigu, Gmail send et Notion create passent à `unknown` et ne sont jamais rejoués automatiquement. Notion update et archive peuvent être réconciliés ou rejoués seulement si la lecture de la ressource prouve que l'opération reste applicativement idempotente et qu'aucune modification concurrente ne contredit l'approbation.

L'endpoint d'exécution reçoit uniquement `action_id`. Il recharge le payload immuable depuis D1 et vérifie son empreinte ; il n'accepte jamais un nouveau destinataire, contenu ou ensemble de propriétés.

## Garanties et limites

- D1 garantit localement une proposition unique par origine/type/cible, un contenu immuable, une approbation Telegram liée à un message présenté et un seul claim concurrent.
- Une action `succeeded` retourne son résultat persisté sans nouvel appel fournisseur.
- Une action `unknown` exige une réconciliation ou une décision humaine ; elle n'est pas assimilée à un échec rejouable.
- Un `Message-ID` Gmail déterministe ou une propriété technique Notion peut faciliter la réconciliation, sans constituer à lui seul une garantie fournisseur.
- Belloria ne revendique pas d'« exactly once » chez Gmail ou pour une création Notion tant que le fournisseur n'offre pas une clé d'idempotence exploitable.

## Conséquences

- BELL-046 livre uniquement le registre et l'approbation durable prêts à intégrer. Les mutations directes protégées seulement par `confirmed: true` restent actives et ne sont pas corrigées par ce lot.
- BELL-047 puis BELL-048 intégreront séparément Gmail et Notion en faisant recevoir à leurs exécuteurs le seul `action_id`.
- Aucune Queue Cloudflare, aucun framework, ORM, service ou base supplémentaire n'est requis.
- Les lectures Gmail/Notion restent hors de cette machine d'état.
