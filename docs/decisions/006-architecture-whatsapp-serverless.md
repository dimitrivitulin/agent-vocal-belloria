# 006 — Architecture WhatsApp serverless sur Cloudflare

Date: 2026-08-03
Statut: acceptée

## Contexte

La VM gratuite envisagée pour WAHA n’est pas disponible et un VPS existant serait payant. Belloria a un faible volume, mais requiert une entrée HTTPS permanente, une vérification cryptographique, de l’idempotence et une reprise traçable sans maintenir une machine.

## Décision

La cible utilise WhatsApp Cloud API, hébergée par Meta, avec Cloudflare Workers pour le webhook et le MCP, et D1 pour les reçus d’idempotence et l’état de traitement. Notion reste la source de vérité CRM. Le webhook authentifie le corps brut, persiste avant acquittement et diffère les effets métier. WAHA et la configuration Docker sont conservés désactivés comme solution de repli.

## Conséquences

- Aucun processus WhatsApp ni VM persistante n’est requis côté Belloria.
- L’implémentation doit respecter le budget CPU du plan retenu et isoler les travaux longs derrière une file.
- Le runtime Worker demandera un portage explicite du cœur Python ou un équivalent testé ; BELL-013 en est responsable.
- D1 contient uniquement de l’état opérationnel minimisé et reconstructible, pas le CRM ni les conversations complètes.
- Les limites et tarifs Cloudflare et Meta devront être revérifiés avant activation ; la gratuité n’est pas garantie.
- Vercel Hobby n’est pas retenu pour cet usage commercial, et WAHA reste une option de retour arrière non activée.
