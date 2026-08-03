# 007 — Abandon de la voie WhatsApp officielle

Date: 2026-08-03
Statut: acceptée

## Contexte

La validation de WhatsApp Cloud API s'est arrêtée avant la création de l'application de test : Meta refuse au portefeuille Belloria le droit de revendiquer une application. La levée de cette restriction impose une procédure d'examen et une vérification mobile supplémentaires. Cette complexité n'est plus proportionnée au besoin actuel de Belloria.

## Décision

Belloria abandonne la voie WhatsApp Cloud API officielle. Aucune demande d'examen Meta ne sera soumise et aucun secret Meta ne sera configuré. Le Worker Cloudflare et la base D1 créés pendant le prototype restent gelés, sans connexion à Meta ni usage de production.

WAHA n'est pas réactivé automatiquement. Un lot distinct décidera soit de remettre en service cette solution non officielle derrière la frontière MCP existante, soit de retirer WhatsApp de la première version du produit.

Cette décision remplace la décision [006 — Architecture WhatsApp serverless sur Cloudflare](006-architecture-whatsapp-serverless.md).

## Conséquences

- BELL-014 ne peut pas satisfaire ses critères de bout en bout et est fermé comme bloqué par abandon de la voie Meta.
- BELL-015 est bloqué tant que la voie officielle reste abandonnée.
- Le code Cloud API, le Worker et D1 sont conservés comme prototype technique, sans poursuite de configuration ni promesse de mise en production.
- La suppression des ressources Cloudflare distantes fera l'objet d'une confirmation explicite, car elle est destructive.
- Les lots Gmail, Notion et qualification commerciale restent utilisables indépendamment de WhatsApp.
