# ADR-009 — Actions GPT confirmées, idempotentes et traçables

Date: 2026-08-09
Statut: acceptée

## Contexte

Les mutations exposées par `worker/src/gpt-actions.js` appellent actuellement Gmail ou Notion dès que le même appel HTTP authentifié contient `confirmed: true`. Le Worker ne peut ni prouver une validation humaine, ni relier l'exécution au contenu présenté, ni dédupliquer un rejeu, ni distinguer un échec certain d'un effet externe accepté dont la réponse a été perdue.

Le mécanisme Telegram existant apporte un canal humain allowlisté, un jeton expirant et une consommation atomique D1, mais consomme l'approbation avant de connaître le résultat externe. Il ne doit donc pas être réutilisé tel quel.

## Décision

D1 reste l'unique persistance. Une action externe est créée avant confirmation avec :

- un `action_id` généré par le Worker ;
- un `client_request_id` unique pour dédupliquer la proposition ;
- un type, une cible et un payload canonique immuable ;
- la conséquence, la référence prospect éventuelle et l'expiration ;
- une empreinte SHA-256 de tous les éléments présentés à l'utilisateur ;
- un jeton de confirmation dont seule l'empreinte est persistée.

L'identité logique de l'effet est l'`action_id` lié au compte fournisseur, au type, à la cible et au payload canonique. Deux propositions volontairement identiques restent deux intentions distinctes ; un rejeu avec le même `client_request_id` doit retrouver la même action, et un contenu différent sous cette clé doit être refusé.

La machine d'état minimale est :

`pending → approved → claimed → succeeded`

avec `failed_retryable`, `failed_terminal`, `unknown` et `expired` lorsque nécessaires. La confirmation Telegram fait uniquement `pending → approved`. L'exécution réclame atomiquement une action `approved` ou `failed_retryable`, puis persiste le début du dispatch et le résultat fournisseur.

Un claim expiré sans début de dispatch peut être repris. Après un dispatch dont le résultat est ambigu, Gmail send et Notion create passent à `unknown` et ne sont jamais rejoués automatiquement. Notion update et archive peuvent être réconciliés ou rejoués seulement si la lecture de la ressource prouve que l'opération reste applicativement idempotente et qu'aucune modification concurrente ne contredit l'approbation.

L'endpoint d'exécution reçoit uniquement `action_id`. Il recharge le payload immuable depuis D1 et vérifie son empreinte ; il n'accepte jamais un nouveau destinataire, contenu ou ensemble de propriétés.

## Garanties et limites

- D1 peut garantir localement une proposition unique, une approbation unique et un seul claim concurrent.
- Une action `succeeded` retourne son résultat persisté sans nouvel appel fournisseur.
- Une action `unknown` exige une réconciliation ou une décision humaine ; elle n'est pas assimilée à un échec rejouable.
- Un `Message-ID` Gmail déterministe ou une propriété technique Notion peut faciliter la réconciliation, sans constituer à lui seul une garantie fournisseur.
- Belloria ne revendique pas d'« exactly once » chez Gmail ou pour une création Notion tant que le fournisseur n'offre pas une clé d'idempotence exploitable.

## Conséquences

- Les mutations directes protégées seulement par `confirmed: true` ne constituent pas la cible durable et devront être remplacées avant d'être considérées comme sûres au rejeu.
- Une migration D1 et une évolution limitée des Actions GPT et de la confirmation Telegram seront nécessaires.
- Aucune Queue Cloudflare, aucun framework, ORM, service ou base supplémentaire n'est requis.
- Les lectures Gmail/Notion restent hors de cette machine d'état.

