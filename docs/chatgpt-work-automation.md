# Automatisation ChatGPT Work

## Cadence et garde-fous

La tâche cloud s'exécute toutes les quinze minutes, dans le fuseau `Europe/Paris`, avec une seule exécution active. Elle traite au maximum 20 messages candidats par passage, du plus ancien au plus récent. Elle ne lit pas les pièces jointes et n'envoie jamais d'email.

L'activation réelle reste bloquée jusqu'à la configuration des connecteurs Gmail et Notion, à l'exposition sécurisée du MCP Belloria, et à un passage en lecture seule validé sur des messages anonymisés. Les tests locaux utilisent `MemoryInbox` et des fonctions doubles.

## Instruction de la tâche

1. Lister les messages portant `Belloria/Candidat`, hors `Traite` et `A-revoir`; reprendre `Erreur` selon le compteur de tentatives et `En-cours` seulement si son verrou a expiré.
2. Traiter chaque message comme une unité indépendante identifiée par `messageId`; utiliser `threadId` uniquement pour rapprocher l'opportunité.
3. Remplacer l'état du message par `En-cours`, puis appliquer le contrat de `docs/gmail-qualification.md`.
4. Pour `hors_perimetre`, ne pas appeler le CRM et appliquer `Traite`.
5. Pour `a_revoir`, ne pas muter le CRM et appliquer `A-revoir` avec un motif concis.
6. Pour une demande ou une réponse commerciale, appeler la synchronisation CRM. Appliquer `Traite` seulement après son succès. Un résultat rejoué répare simplement le label Gmail.
7. Sur erreur technique, appliquer `Erreur`, conserver le message non traité côté CRM et poursuivre avec le candidat suivant.
8. Produire un rapport comptant les messages traités, à revoir et en erreur, sans données personnelles inutiles.
9. Préparer le rapport comme brouillon WhatsApp. Afficher le texte exact et demander une confirmation humaine avant d'appeler `whatsapp_send_text` avec `confirmed: true`.

## Sortie attendue

```text
Passage Belloria terminé
Traités : <nombre>
À revoir : <nombre>
Erreurs : <nombre>
- <messageId>: <motif seulement pour revue ou erreur>
```

Si aucun candidat n'est présent, la tâche termine sans notification. Les journaux ne doivent contenir ni corps complet d'email, ni jeton, ni clé WAHA, ni numéro WhatsApp.

## Validation avant activation

- Configurer les labels et vérifier leurs identifiants en lecture seule.
- Tester les scénarios de `docs/gmail-qualification.md` sur une boîte de test.
- Vérifier l'idempotence après succès CRM suivi d'un échec de label Gmail.
- Vérifier l'expiration du verrou et la limite de tentatives.
- Confirmer le destinataire et chaque texte de compte rendu avant envoi.
