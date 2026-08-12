# BELL-047.3 — Alignement du compte Gmail d’envoi Belloria

Statut: blocked
Branche: `codex/bell-047-3-gmail-oauth-belloria`
Dernière mise à jour: 2026-08-12

## Objectif

Aligner l’autorisation OAuth Gmail du Worker sur le compte Belloria, afin que l’identité d’envoi réelle soit Belloria plutôt que Colibri.

## Contexte autorisé

- Domaine : configuration OAuth Gmail distante et validation Gmail en lecture.
- Fichiers initiaux : configuration Worker, documentation Gmail et suivi projet.
- Skill requis : Gmail, pour vérifier le compte en lecture après rotation ; aucun autre skill.
- MCP ou connecteur requis : Gmail et Chrome, pour la session Google Belloria ; aucun appel Gmail d’envoi sans confirmation Telegram.
- Hors périmètre : BELL-047.2/réconciliation, code d’envoi Gmail, Notion, migration D1, Queue, Brevo, WAHA/Meta et refactor général.

## Critères de sortie

- Le refresh token Gmail distant du Worker est remplacé uniquement par un consentement accordé sous le compte Belloria.
- L’identité OAuth active est vérifiée sans envoi d’email.
- Aucun code Worker ni aucune règle BELL-047.2 n’est modifié.

## Garde de sécurité

- Le refresh token ne doit jamais être affiché, copié dans le dépôt ou transmis dans la conversation.
- Le remplacement du secret de production exige une confirmation immédiate de l’utilisateur.
- BELL-047.2 reste bloqué : cette rotation ne valide ni le `Message-ID` ni la recherche `rfc822msgid`.

## État initial

- Le test contrôlé BELL-047.2 du 2026-08-11 a montré que le refresh token actuel correspond à `hello.colibridesign@gmail.com`, et non au compte Belloria attendu.
- BELL-047.2 a été préservé dans le stash local `bell-047.2 validation blocked` sans commit ni push, conformément à son arrêt avant implémentation.
- Le projet Google Cloud contient le client Web `Belloria GPT — Gmail`, mais aucun secret client réutilisable n'est visible : la console propose seulement d'en créer un. La rotation du seul refresh token n'est donc pas encore justifiée ; elle nécessiterait de remplacer aussi `GOOGLE_CLIENT_SECRET` distant avec un nouveau secret du même client, après accord explicite.
- La session Chrome `belloriaevent@gmail.com` est disponible, mais Google Cloud bloque son accès tant que la validation en deux étapes (MFA) du compte Belloria n'est pas activée. Cette activation doit être réalisée par le titulaire du compte avant toute rotation OAuth.

## Prochaine action

- Activer la MFA du compte `belloriaevent@gmail.com`, puis reprendre la rotation OAuth avec confirmation immédiate avant la création du secret client et le remplacement des secrets Worker distants.
