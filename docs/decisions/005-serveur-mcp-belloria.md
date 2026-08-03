# 005 — Surface métier WhatsApp minimale

Date: 2026-08-03
Statut: acceptée

## Décision

Belloria ne donne jamais accès à l'API WAHA générique. Le serveur MCP conserve l'URL, la clé et la session WAHA, exige un jeton Bearer et publie uniquement la lecture de l'état ainsi que l'envoi d'un texte validé. Tout envoi reste soumis à une confirmation explicite en amont.

## Conséquences

- Un appelant ne peut choisir ni endpoint WAHA, ni session, ni type d'action arbitraire.
- Les médias, groupes, suppressions et gestion de session ne sont pas exposés.
- Le jeton statique convient au prototype local mais pas à une exposition Internet ; TLS et OAuth seront requis avant un usage distant.
