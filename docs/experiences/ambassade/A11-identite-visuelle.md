# SATEER Ambassade — A11 · Identité visuelle diplomatique

## Objet et périmètre

Différencier l'expérience **Ambassade** de **Mon Consulat** sans dupliquer Workflow,
Communication, le Core, les comptes ou les permissions. A11 est une évolution de façade,
**sans migration SQL, sans nouvelle API et sans attribution de droits**.

## Identité graphique

- Bleu nuit diplomatique `#101d37` / bleu institutionnel `#213f71`.
- Doré discret `#cda661` pour la hiérarchie visuelle et les détails, pas pour les alertes.
- Surfaces blanc cassé `#f4f5f8`, lisibilité et contraste sur fonds sombres.
- Distinction explicite **MISSION DIPLOMATIQUE · RECETTE**, organisation et tenant issus du Core.
- Responsive et anneaux de focus visibles, respect de `prefers-reduced-motion`.

## Organisation technique

`public/ambassade-identity.css` : styles exclusivement sous `body.sateer-ambassade` ou
`body.sx-ambassade-mode`. Aucun sélecteur global qui changerait les pages Consulat.

`public/ambassade-identity.js` : vérifie `SATEER_CONTEXT_READY` puis l'appartenance
exacte `organisation.id` + `organisation.type === 'AMBASSADE'` + `tenant_code`.
Le contexte URL ne suffit jamais. Les écrans partagés ne reçoivent la classe qu'après
vérification : formulaire, détail, Workspace, publication. La façade native
`ambassade.html` garde un thème cohérent même lors de l'état de chargement.

Les `id` métier existants sont conservés, notamment `ambassadeDemandeLink`,
`ambassadeOperationsContenu`, `ambassadeParcoursBureaux`, `workspaceUnitName`.

## Sécurité et non-régression

- Aucune logique de routage, permission, authentification, workflow ou publication modifiée.
- Pas de lecture transversale d'autres organisations ni d'une boîte réelle.
- Le Consulat et les espaces SATEER génériques conservent leur apparence antérieure.
- `textContent` seulement pour les valeurs de nom d'organisation ; pas d'injection HTML.
- Le badge **RECETTE** empêche de présenter la démonstration comme une connexion officielle.

## Recette

`node scripts/test-ambassade-identity.js` vérifie les contextes autorisés et refusés,
les cinq pages, le choix de source, le scope CSS et les points d'ancrage métier.
Exécuter ensuite les contrôles de contrats A1–A9, les tests de sécurité `npm test`,
le harnais E2E Ambassade + P6 Consulat, A3d et P3.1 sur `sateer_test` épinglée.

Après tests et push, une personne doit encore constater les écrans dans les vrais
comptes de recette. Cette étape n'est pas implicitement PASS.

## Réserves

A11 ne fournit ni onboarding externe, ni e-mail officiel, ni transfert interpostes,
ni habilitation institutionnelle réelle. Les comptes et l'instance restent de **recette**.
