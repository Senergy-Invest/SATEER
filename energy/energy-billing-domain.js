'use strict';
/** E-METER-1B1 : saisies documentaires, sans calcul de cout, de kWh ni de tarif. */
const {UUID,ENERGIES}=require('./energy-meter-domain');
const NATURES=Object.freeze(['FACTURE','RECHARGE']);
const FIELDS=new Set(['nature','energie','dateDocument','periodeDebut','periodeFin','devise','montant','pointId','meterId','referenceDocument','referenceJustificatif']);
function exactObject(o){return o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>FIELDS.has(k));}
function date(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const [y,m,d]=s.split('-').map(Number);return y>=2000&&y<=2100&&m>=1&&m<=12&&d>=1&&d<=new Date(Date.UTC(y,m,0)).getUTCDate();}
function optionalText(x,n){return x===null||x===undefined||(typeof x==='string'&&x.trim().length>0&&x.trim().length<=n&&!/[\x00-\x1f\x7f]/.test(x));}
function amount(s){if(typeof s!=='string'||!/^\d{1,12}(?:\.\d{1,2})?$/.test(s))return null;
 const [a,b='']=s.split('.');return a.replace(/^0+(?=\d)/,'')+'.'+b.padEnd(2,'0');}
function declaration(o,now=Date.now()){
 if(!exactObject(o)||!NATURES.includes(o.nature)||!ENERGIES.includes(o.energie)||!date(o.dateDocument))return null;
 const today=new Date(now).toISOString().slice(0,10);if(o.dateDocument>today)return null;
 const periodeDebut=o.periodeDebut??null,periodeFin=o.periodeFin??null;
 if(o.nature==='FACTURE'&&(!date(periodeDebut)||!date(periodeFin)||periodeDebut>periodeFin||periodeFin>o.dateDocument))return null;
 if(o.nature==='RECHARGE'&&(periodeDebut!==null||periodeFin!==null))return null;
 const montant=amount(o.montant);if(!montant||!/^[A-Z]{3}$/.test(o.devise||''))return null;
 const pointId=o.pointId??null,meterId=o.meterId??null;
 if(pointId!==null&&!UUID.test(pointId)||meterId!==null&&(!UUID.test(meterId)||!pointId))return null;
 if(!optionalText(o.referenceDocument,80)||!optionalText(o.referenceJustificatif,120))return null;
 return Object.freeze({nature:o.nature,energie:o.energie,dateDocument:o.dateDocument,
  periodeDebut:o.nature==='FACTURE'?periodeDebut:null,periodeFin:o.nature==='FACTURE'?periodeFin:null,
  devise:o.devise,montant,pointId,meterId,referenceDocument:o.referenceDocument?.trim()||null,
  referenceJustificatif:o.referenceJustificatif?.trim()||null});
}
module.exports={NATURES,date,amount,declaration};
