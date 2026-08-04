# Automatisation ChatGPT Work

## Cadence et garde-fous

La tâche cloud s'exécute toutes les heures, dans le fuseau `Europe/Paris`, avec une seule exécution active. Le planificateur ChatGPT refuse les récurrences inférieures à une heure ; cette cadence est donc le minimum supporté. Elle traite au maximum 20 messages candidats par passage, du plus ancien au plus récent. Elle ne lit pas les pièces jointes et n'envoie jamais d'email.

Les labels et filtres Gmail Belloria sont actifs et le passage contrôlé est validé. La tâche `Passage Belloria automatisé` est active en mode Work ; son premier passage sans candidat ni commande s'est terminé sans notification. Le MCP Belloria est connecté par OAuth dans ChatGPT. La cible de test est la base `Demandes & événements` décrite dans `docs/notion-crm-operational.md`; le CRM historique ne doit pas être muté. Le canal de pilotage est le chat Telegram privé configuré dans le Worker. Les tests locaux utilisent `MemoryInbox` et des fonctions doubles.

## Application MCP Belloria

Créer l'application personnalisée avec l'URL `https://belloria-assistant.belloria-dvitulin.workers.dev/mcp` et le mode `OAuth`. Le Worker gère la découverte, PKCE et l'enregistrement dynamique ; la page Belloria demande le secret propriétaire sans le transmettre à ChatGPT. Vérifier la présence exacte des outils `belloria_channel_status`, `belloria_list_commands`, `belloria_complete_command` et `belloria_send_text`.

## Commandes Telegram

Au début de chaque passage, appeler `belloria_list_commands` avec une limite de 10. Pour `status=pending`, le champ `text` contient soit le message saisi, soit la transcription du vocal. Pour `status=quarantined`, ne rien exécuter : signaler seulement le code d'erreur assaini. Une commande de consultation peut être exécutée dans le périmètre Gmail/Notion déjà autorisé. Une mutation, un envoi d'email ou une action irréversible exige toujours une confirmation explicite portant sur son contenu exact.

Après traitement réussi ou décision explicite de ne pas agir, appeler `belloria_complete_command` avec l'identifiant reçu et `confirmed: true` ; le Worker efface alors le texte conservé dans D1. En cas d'erreur technique, laisser la commande en attente pour la reprise suivante.

## Instruction de la tâche

1. Lister les messages portant `Belloria/Candidat`, hors `Traite` et `A-revoir`; reprendre `Erreur` selon le compteur de tentatives et `En-cours` seulement si son verrou a expiré.
2. Traiter chaque message comme une unité indépendante identifiée par `messageId`; utiliser `threadId` pour rapprocher l'opportunité, mais utiliser `messageId` comme clé d'opportunité pour chaque soumission Tally.
3. Remplacer l'état du message par `En-cours`, puis appliquer le contrat de `docs/gmail-qualification.md`.
4. Pour `hors_perimetre`, ne pas appeler le CRM et appliquer `Traite`.
5. Pour `a_revoir`, ne pas muter le CRM et appliquer `A-revoir` avec un motif concis.
6. Pour une demande ou une réponse commerciale, appeler la synchronisation CRM. Appliquer `Traite` seulement après son succès. Un résultat rejoué répare simplement le label Gmail.
7. Sur erreur technique, appliquer `Erreur`, conserver le message non traité côté CRM et poursuivre avec le candidat suivant.
8. Produire un rapport comptant les messages traités, à revoir et en erreur, sans données personnelles inutiles.
9. Préparer le rapport comme brouillon Telegram. Afficher le texte exact et demander une confirmation humaine avant d'appeler `belloria_send_text` avec `confirmed: true`.

## Sortie attendue

```text
Passage Belloria terminé
Traités : <nombre>
À revoir : <nombre>
Erreurs : <nombre>
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
