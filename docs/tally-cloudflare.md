# Webhook Tally direct vers Cloudflare

## Flux

`Tally → POST /webhooks/tally → signature HMAC → D1 → MCP → CRM Notion`

Les notifications Gmail de Tally ne sont plus une entrée de traitement. Gmail reste utilisé pour les échanges commerciaux directs, Mariages.net, les devis envoyés et l'historique prospect.

## Activation Cloudflare

1. Générer une valeur aléatoire longue pour le secret de signature.
2. Charger la même valeur dans le secret Worker `TALLY_WEBHOOK_SECRET`.
3. Charger l'identifiant exact du formulaire « Devis express » dans `TALLY_FORM_ID`.
4. Appliquer la migration distante `0005_tally_submissions.sql`.
5. Déployer le Worker puis vérifier `/health`.

Les valeurs réelles restent dans les secrets Cloudflare et ne sont jamais ajoutées au dépôt.

## Configuration Tally

Dans le formulaire publié :

1. ouvrir `Integrations` puis `Webhooks` ;
2. utiliser l'URL `https://belloria-assistant.belloria-dvitulin.workers.dev/webhooks/tally` ;
3. activer le signing secret et saisir exactement la valeur de `TALLY_WEBHOOK_SECRET` ;
4. envoyer une soumission contrôlée puis vérifier que Tally reçoit un statut HTTP 200.

Le Worker refuse une signature invalide, un événement autre que `FORM_RESPONSE`, un payload incomplet et tout `formId` différent de `TALLY_FORM_ID`. `eventId` et `submissionId` assurent le rejeu sans doublon.

## Traitement et rétention

Le passage ChatGPT Work récupère les soumissions avec `belloria_list_tally_submissions`. Après création ou mise à jour réussie du CRM, il appelle `belloria_complete_tally_submission` avec confirmation explicite. Le payload brut est alors effacé de D1, tandis que l'identifiant technique et l'état traité sont conservés pour l'idempotence.

En cas d'échec CRM, la soumission reste `pending` et sera reprise au passage suivant. La notification email Tally peut rester activée pour lecture humaine, mais elle doit être exclue de la file automatisée Gmail.
