# ADR-010 — Envoi Gmail durable par action approuvée

Date: 2026-08-10
Statut: acceptée

## Décision

BELL-047.1 remplace le dispatch Gmail direct fondé sur `confirmed: true` par une proposition `gmail_send` issue d'une commande Telegram persistée. La proposition conserve sa cible, son contenu et un `Message-ID` de corrélation déterministe dans D1 ; elle est présentée puis approuvée via le mécanisme BELL-046.

`POST /gpt-actions/gmail/execute` accepte exclusivement `action_id`. Il relit et vérifie le contenu D1, réclame l'action approuvée, puis inscrit `dispatch_started_at` par mise à jour conditionnelle avant son unique appel Gmail. Un second exécuteur ne peut pas réserver ce marqueur ni appeler Gmail. Une action `succeeded`, `failed` ou `unknown` retourne son résultat persistant sans nouvel appel fournisseur.

Un `Message-ID` de la forme `<belloria-<creation_key>@belloria.invalid>` est ajouté au MIME. Il est seulement un marqueur de corrélation candidat : BELL-047.1 n'interroge pas Gmail avec ce header et ne revendique aucune réconciliation fournisseur.

## Classification des erreurs

Avant `dispatch_started_at`, les erreurs certaines deviennent `failed` : contenu D1 invalide ou intègre, Gmail non configuré, échec de renouvellement OAuth et scope Gmail insuffisant. Aucun appel `messages.send` n'a alors été tenté.

Après `dispatch_started_at`, un rejet Gmail devient `failed` uniquement si le corps structuré de la réponse confirme l'un des cas suivants :

- HTTP 400, statut `INVALID_ARGUMENT`, reason `invalidArgument` ;
- HTTP 401, statut `UNAUTHENTICATED`, reason `authError` ou `invalidCredentials` ;
- HTTP 403, statut `PERMISSION_DENIED`, reason `insufficientPermissions`.

Tout autre résultat devient `unknown` : timeout, rupture réseau, crash, JSON absent ou sans `Message.id`, réponse 429, réponse 5xx, réponse 4xx non reconnue ou corps fournisseur absent. Aucun de ces états ne provoque un retry Gmail automatique. Un claim avec `dispatch_started_at` encore non terminal est rapporté comme en cours pendant deux minutes ; au-delà, une nouvelle demande d'exécution le fixe à `unknown`, sans envoi.

## Conséquences

- La lecture Gmail existante ne change pas.
- Les mutations Notion restent hors de ce lot et utilisent encore leur contrat actuel jusqu'à BELL-048.
- BELL-047.2 devra valider en conditions contrôlées la conservation et la recherche du `Message-ID` avant d'implémenter toute réconciliation.
