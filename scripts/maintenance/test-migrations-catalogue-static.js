'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root=path.resolve(process.argv[2]||'');
const p42=fs.readFileSync(path.join(root,'database/042_procedure_catalogue_validation_explicite.sql'),'utf8');
const p43=fs.readFileSync(path.join(root,'database/043_permission_manage_procedures.sql'),'utf8');
assert.match(p42,/ALTER\s+TABLE\s+public\.organisation_procedure_catalogue/i);
assert.match(p42,/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+validation_explicite\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+FALSE/i);
assert.match(p42,/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+date_validation\s+TIMESTAMPTZ/i);
assert.match(p42,/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+date_publication\s+TIMESTAMPTZ/i);
assert.match(p43,/INSERT\s+INTO\s+public\.permissions/i);
assert.match(p43,/MANAGE_PROCEDURES/);
assert.doesNotMatch(p43,/\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?(?:public\.)?(?:organisation_roles|relations_personne_organisation_roles|role_permissions)\b/i);
for(const [name,src] of [['042',p42],['043',p43]]) {
 assert.match(src,/^\s*BEGIN\s*;/im);
 assert.match(src,/^\s*COMMIT\s*;/im);
 assert.doesNotMatch(src,/\b(?:DROP|TRUNCATE)\s+(?:TABLE|DATABASE)\b/i);
 console.log('P335Z_SQL_STATIQUE_'+name+': PASS');
}
