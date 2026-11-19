# SATEER Energy — MVP02-B1 : inventaire participatif privé

**Date de cadrage :** 19 novembre 2026. **Base Git requise :** `work/energy-mvp01`, commit `9f751b080408eb1f044eae1d77fbc2f6c6b69765`. **Statut initial :** proposition de tranche verticale, **non validée en recette sur Mac** tant que le rapport final ne prouve pas migration, authentification réelle et validation visuelle. Pas de droit institutionnel.

## Parcours simple

1. Un responsable ouvre **Mes appareils → Faire l'inventaire à plusieurs**, crée un code secret de 48 h et le partage directement avec une personne de confiance. Il peut avoir au maximum cinq invitations simultanément actives. Le code n'apparaît **qu'à la création** et n'est pas récupérable via GET.
2. La personne dispose de son propre compte SATEER déjà rattaché au même tenant Energy. Elle saisit le code dans **Je donne un coup de main** sur la page de participation, l'accepte et devient la contributrice unique de cette invitation. Le partage du code **ne transmet aucune session**.
3. Elle choisit une catégorie illustrée, donne un nom et une quantité, et peut laisser la puissance inconnue. La proposition reste `SOUMISE`, visible uniquement par le contributeur et le responsable. **Aucun accès aux appareils, photos, QR, dossiers ou mesures du responsable.**
4. Le responsable accepte ou refuse. **L'acceptation seule** crée une nouvelle ligne déclarative dans `energy_inventory_equipements`, à l'emplacement principal existant ou dans un emplacement technique par défaut. La ligne porte `provenance=DECLAREE` (contrainte du contrat historique), avec un journal explicite `origine=CONTRIBUTION_ACCEPTEE` et `verification=DECLARATIF_NON_MESURE`. Refus = aucune création canonique.
5. L'invitation est révocable immédiatement pour les nouvelles propositions. Les propositions déjà reçues restent dans l'historique privé du propriétaire, qui peut toujours les examiner. Une invitation expirée n'autorise pas de nouvelles propositions.

## Modèle et frontières

- Migration `054_energy_inventory_collaboration.sql`, **uniquement** `sateer_test` après consentement, aucune mutation des tables Core ni des expériences Bordeaux/Ambassade/Diaspora. Les champs `site_id,tenant_id,owner_personne_id` sont liés par FKs composites ; le contributeur référencé est la même personne que l'invité accepté. Le token aléatoire 192 bits est conservé **seulement sous forme SHA-256** et jamais dans une URL de lecture.
- `energy-collaboration-domain.js` contient les validations des objets, décisions et codes ; `energy-collaboration-store.js` contient les transactions Postgres et audits ; `energy-collaboration-http.js` applique le Core Auth injecté, l'appartenance au tenant, les contrôles de propriétaire ou de contributeur, l'Origin sur toute écriture, la non-mise en cache. Aucun nouveau service d'authentification, aucun moteur Equipment dupliqué.
- `energy_inventory_collaboration_events` est un journal append-only des invitations/contributions/revues. Les événements d'inventaire existants sont aussi ajoutés lorsque l'arbitrage insère l'équipement canonique.
- Le QR du passeport n'est **pas** un code d'invitation. Une invitation n'accorde jamais les privilèges de lecture d'un passeport, même après acceptation.

## Confidentialité, limites et sécurité

- Code partageable en dehors de l'application **manuellement** : pas d'e-mail, WhatsApp, SMS ni notification envoyée automatiquement ; ne pas créer un second moteur Communication. Le code est un secret de réservation **à usage unique** : la première personne authentifiée membre du tenant qui l'accepte devient la bénéficiaire. **Cette tranche n'offre pas de ciblage nominatif préalable**, à prévoir lors du durcissement des invitations. Ne le publier nulle part.
- L'utilisateur accepte de façon explicite ; le responsable peut révoquer. Pas de transfert à l'AEME, SENELEC, ANER, ASER ou Invest.
- Collaboration MVP02-B1 = **propositions textuelles d'équipements**, sans photos apportées directement par le contributeur. Le responsable peut ajouter les photos privées après acceptation grâce au passeport existant. L'extension photos et contributions sur plusieurs zones nécessitera un contrat documentaire/permission séparé.
- Une puissance renseignée est une donnée déclarée, **jamais une mesure certifiée**, ni un calcul de consommation, une garantie d'économie, un dimensionnement solaire ou une décision Ecofridges.
- Maximum 5 invitations en cours par site, 48 h de validité, et 100 propositions par invitation. Pour la production : limitation de débit et surveillance anti-abus des codes, invitations ciblées et notifiées via Communication, purge conforme des jetons expirés, revue des politiques de conservation, indexation/pagination scalable, habilitation institutionnelle réelle et interface mobile en conditions terrain.

## Tests / preuve de livraison

1. `node --test scripts/test-energy-mvp02b.js` (contrats métier, HTTP injecté, privacy, UX).
2. `scripts/maintenance/test-energy-mvp02b-pg.js` : migration 054 appliquée et *rollback intégral* sur le cluster local épinglé.
3. `scripts/maintenance/test-energy-mvp02b-reel.js` : comptes Energy A/B et cookies Core réels, invitation, soumission idempotente, acceptation/refus, révocation, isolation croisée.
4. Non-régression : Energy MVP01/MVP02A/UX/passeport/OCR, Core, P1, Ambassade et Diaspora D1/D3 (avec origine D3 fictive correctement fixée pour son seul processus).
5. Validation visuelle : A crée code, B l'accepte, propose un appareil, A décide ; pas de partage d'inventaire/photo ; code effacé à l'actualisation ; affichage téléphone et état d'erreur. Confirmation `VALIDER_VISUEL_MVP02B1` ; puis commit ciblé, push normal et SHA distant vérifié ; rapport ZIP ouvert Finder.

**Suite ordonnée :** MVP02-B2 si nécessaire (photo de proposition et invitation ciblée via Core/Communication, revues par zone), ensuite études pilotes Ecofridges et prédiagnostic/solaire sur données validées et consenties. Cette documentation décrit la tranche candidate, pas une acceptation de production.
