-- SATEER / P3.3.5T / MIGRATION 043
-- Déclaration de la permission générique d'édition des brouillons.
-- Aucun rôle / aucune relation de personne n'est créé(e) par cette migration.
-- NON APPLIQUÉE par P3.3.5Y.
BEGIN;
INSERT INTO public.permissions(code, nom, description, actif)
SELECT 'MANAGE_PROCEDURES',
       'Gérer les démarches consulaires',
       'Créer et modifier les brouillons des démarches, sans validation ni publication.',
       TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions WHERE code='MANAGE_PROCEDURES'
);
COMMIT;
