'use strict';
// Tests statiques purs : zero DB, zero API, zero fichiers ecrits.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||path.join(__dirname,'../..'));
const read=n=>fs.readFileSync(path.join(root,'database',n),'utf8');
const sql40=read('040_organisation_experience_activations.sql');
const sql41=read('041_organisation_experience_permissions.sql');
assert.match(sql40,/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+ux_organisations_id_tenant_for_experience/i);
assert.match(sql40,/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+organisation_experience_activations/i);
assert.match(sql40,/DEFAULT\s+'INACTIVE'/i);
assert.match(sql40,/UNIQUE\s*\(tenant_id,\s*organisation_id,\s*experience_id\)/i);
assert.match(sql40,/FOREIGN\s+KEY\s*\(organisation_id,\s*tenant_id\)/i);
assert.match(sql41,/INSERT\s+INTO\s+public\.permissions\s*\(code,\s*nom,\s*description,\s*actif\)/i);
assert.match(sql41,/ON\s+CONFLICT\s*\(code\)\s+DO\s+NOTHING\s*;/i);
for(const code of ['VIEW_ORGANISATION_EXPERIENCES','MANAGE_ORGANISATION_EXPERIENCES']){
 const n=(sql41.match(new RegExp("\\('"+code+"'",'g'))||[]).length;
 assert.equal(n,1,code+'_NON_UNIQUE_DANS_FICHIER');
}
assert.doesNotMatch(sql41,/\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?(?:public\.)?(?:organisation_roles|role_permissions|relations_personne_organisation_roles)\b/i);
assert.doesNotMatch(sql41,/\bON\s+CONFLICT\s*\(code\)\s+DO\s+UPDATE\b/i);
console.log('P335AE_STATIQUE_040_041_PASS: garde reexecution, aucune attribution de role, zero activation implicite');
