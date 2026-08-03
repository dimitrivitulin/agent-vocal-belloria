# BELL-011 — Abstraction de la passerelle WhatsApp

Statut: completed
Branche: `codex/bell-011-abstraction-passerelle-whatsapp`
Dernière mise à jour: 2026-08-03

## Objectif

Découpler les fonctions Belloria de WAHA derrière une interface fournisseur, tout en conservant l'adaptateur WAHA comme repli testé et désactivé par défaut.

## Critères de réussite

- Le MCP dépend d'une interface fournisseur neutre pour l'état et l'envoi de texte.
- Les noms, schémas et règles de confirmation des outils MCP publics restent inchangés.
- WAHA est isolé dans un adaptateur testé et n'est actif qu'après sélection explicite.
- Aucun adaptateur Meta, appel réseau réel ou déploiement n'est ajouté.

## Périmètre

- Interface `WhatsAppGateway`, fabrique de configuration et adaptateur WAHA.
- Injection de la passerelle dans le dispatch MCP existant.
- Tests unitaires et documentation de la sélection explicite du fournisseur.
- Aucun changement du protocole MCP public ni implémentation Cloud API.

## Fichiers concernés

- `belloria_mcp/gateway.py`
- `belloria_mcp/server.py`
- `tests/test_mcp_server.py`
- `docs/mcp-server.md`
- `compose.yaml`
- `compose.cloud.yaml`
- `CURRENT_TASK.md`
- `docs/TASKS.md`

## Prochaine action

Implémenter ensuite **BELL-012 — Adaptateur WhatsApp Cloud API** avec des doubles et secrets d'exemple uniquement.

## Résultat

Le MCP dépend désormais d'une interface fournisseur neutre. WAHA est conservé comme adaptateur de repli testé, inactif sans `WHATSAPP_PROVIDER=waha`, sans changement des deux outils MCP publics.

## Validations effectuées

- 35 tests unitaires réussis, dont l'activation explicite et le rejet d'un fournisseur inconnu.
- Compilation Python et `git diff --check` réussis ; aucun service réel contacté.
