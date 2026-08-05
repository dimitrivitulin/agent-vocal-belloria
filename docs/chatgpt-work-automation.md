# Automatisation ChatGPT Work

## Cadence et garde-fous

La tâche cloud s'exécute toutes les heures, dans le fuseau `Europe/Paris`, avec une seule exécution active. Le planificateur ChatGPT refuse les récurrences inférieures à une heure ; cette cadence est donc le minimum supporté. Elle traite au maximum 20 messages candidats par passage, du plus ancien au plus récent. Elle ne lit pas les pièces jointes et n'envoie jamais d'email.

Les labels et filtres Gmail Belloria sont actifs et le passage contrôlé est validé. La tâche `Passage Belloria automatisé` est active en mode Work ; son premier passage sans candidat ni commande s'est terminé sans notification. Le MCP Belloria est connecté par OAuth dans ChatGPT. La cible de test est la base `Demandes & événements` décrite dans `docs/notion-crm-operational.md`; le CRM historique ne doit pas être muté. Le canal de pilotage est le chat Telegram privé configuré dans le Worker. Les tests locaux utilisent `MemoryInbox` et des fonctions doubles.

## Application MCP Belloria

Créer l'application personnalisée avec l'URL `https://belloria-assistant.belloria-dvitulin.workers.dev/mcp` et le mode `OAuth`. Le Worker gère la découverte, PKCE et l'enregistrement dynamique ; la page Belloria demande le secret propriétaire sans le transmettre à ChatGPT. Vérifier notamment la présence des outils `belloria_list_tally_submissions`, `belloria_get_tally_submission_fallback`, `belloria_complete_tally_submission`, `belloria_list_commands`, `belloria_complete_command`, `belloria_propose_action`, `belloria_consume_approved_action` et `belloria_send_text`.

## Commandes Telegram

Le contrat conversationnel et la confirmation à usage unique sont décrits dans `docs/agent-telegram-integration.md`. Le passage horaire constitue la reprise de secours ; une exécution interactive peut invoquer le même orchestrateur dès réception pour respecter la cible de deux minutes.

Au début de chaque passage, appeler `belloria_list_tally_submissions` puis `belloria_list_commands`, chacun avec une limite de 10. La liste Tally Belloria ne contient que des métadonnées. Pour chaque ligne, appeler `tally_fetch_submissions` avec `formId`, `status=completed`, `page=1`, `limit=100`, puis retenir uniquement la réponse dont `id === submission_id`. Ne jamais paginer l'historique. Si l'appel échoue, si son schéma change ou si l'identifiant manque, appeler uniquement `belloria_get_tally_submission_fallback(event_id)`. Vérifier `form_id` et `submission_id`, synchroniser Notion de façon idempotente, puis seulement appeler `belloria_complete_tally_submission`. Pour une commande Telegram `status=pending`, le champ `text` contient soit le message saisi, soit la transcription du vocal. Pour `status=quarantined`, ne rien exécuter : signaler seulement le code d'erreur assaini. Une commande de consultation peut être exécutée dans le périmètre Gmail/Notion déjà autorisé. Une mutation, un envoi d'email ou une action irréversible exige toujours une confirmation explicite portant sur son contenu exact.

Après traitement réussi ou décision explicite de ne pas agir, appeler `belloria_complete_command` avec l'identifiant reçu et `confirmed: true` ; le Worker efface alors le texte conservé dans D1. En cas d'erreur technique, laisser la commande en attente pour la reprise suivante.

Pour une mutation, enregistrer d’abord la proposition avec `belloria_propose_action`, envoyer son texte exact et demander `CONFIRMER <jeton>`. Lorsqu’une nouvelle commande Telegram contient cette confirmation, appeler `belloria_consume_approved_action` avec son identifiant et `confirmed: true`. Exécuter uniquement l’action exacte retournée lorsque `approved=true`; sinon ne rien muter et ne pas effacer la commande de confirmation.

## Instruction de la tâche

1. Lister les soumissions directes avec `belloria_list_tally_submissions`, les lire par le connecteur Tally ou le repli ciblé, les synchroniser dans le CRM par `submission_id`, puis les terminer seulement après succès.
2. Lister dans Gmail les messages portant `Belloria/Candidat`, avec l'exclusion `-from:notifications@tally.so -subject:"New Tally Form Submission for Devis express"`, puis hors `Traite` et `A-revoir`; reprendre `Erreur` selon le compteur de tentatives et `En-cours` seulement si son verrou a expiré.
3. Traiter chaque email comme une unité indépendante identifiée par `messageId` et utiliser `threadId` pour rapprocher l'opportunité.
4. Remplacer l'état du message Gmail par `En-cours`, puis appliquer le contrat de `docs/gmail-qualification.md`.
5. Pour `hors_perimetre`, ne pas appeler le CRM et appliquer `Traite`.
6. Pour `a_revoir`, ne pas muter le CRM et appliquer `A-revoir` avec un motif concis.
7. Pour une demande ou une réponse commerciale, appeler la synchronisation CRM. Appliquer `Traite` seulement après son succès. Un résultat rejoué répare simplement le label Gmail.
8. Sur erreur technique, conserver la soumission Tally en attente ou appliquer `Erreur` à l'email, puis poursuivre avec le candidat suivant.
9. Produire un rapport comptant les soumissions et messages traités, à revoir et en erreur, sans données personnelles inutiles.
10. Préparer le rapport comme brouillon Telegram. Afficher le texte exact et demander une confirmation humaine avant d'appeler `belloria_send_text` avec `confirmed: true`.

## Boucle anti-perte BELL-031

Après l'ingestion, charger les opportunités non terminales et exécuter `AntiLossLoop` avec l'heure du passage en Europe/Paris. L'adaptateur Notion traduit les propriétés CRM vers `FollowUpOpportunity` et applique chaque `CrmUpdate` atomiquement : `Prochaine action`, `Échéance` et ajout de `alert_key` dans `Tech — Alertes de suivi`. Une clé déjà présente rend la mutation sans effet.

L'ordre de priorité est : événement passé sans clôture, collision avec une prestation confirmée, événement à moins de sept jours, acompte échu, devis silencieux depuis trois jours, demande sans réponse depuis un jour, puis relance échue. Si aucune anomalie n'existe mais qu'une opportunité active n'a pas d'action datée, programmer `Examiner et définir la prochaine action` au lendemain sans l'inclure dans le briefing.

Envoyer le briefing Telegram seulement lorsqu'il contient une nouvelle anomalie, selon la même règle de confirmation humaine que le rapport de passage. Un passage rejoué avec les mêmes sources ne doit ni réécrire le CRM ni signaler de nouveau l'anomalie. Aucun email client n'est envoyé par cette boucle.

## Sortie attendue

```text
Passage Belloria terminé
Traités : <nombre>
À revoir : <nombre>
Erreurs : <nombre>
Tally : plugin=<nombre>, fallback=<nombre>, erreurs=<nombre>
- <messageId>: <motif seulement pour revue ou erreur>
```

Si aucun candidat et aucune commande ne sont présents, la tâche termine sans notification. Les journaux ne doivent contenir ni corps complet d'email, ni jeton Telegram, ni identifiant de chat, ni texte de commande.

## Validation avant activation

- Configurer les labels et vérifier leurs identifiants en lecture seule.
- Tester les scénarios de `docs/gmail-qualification.md` sur une boîte de test.
- Vérifier l'idempotence après succès CRM suivi d'un échec de label Gmail.
- Vérifier l'expiration du verrou et la limite de tentatives.
- Vérifier qu'une commande Telegram texte et la transcription d'un vocal sont traitées une seule fois.
- Confirmer le destinataire et chaque texte de compte rendu avant envoi.
