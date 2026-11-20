'use strict';
const {UUID}=require('./energy-case-domain');
const VIEWS=Object.freeze(['PHYSIQUE','ELECTRIQUE','FONCTIONNELLE']);
const KINDS=Object.freeze(['LIEU','ELECTRIQUE','EQUIPEMENT']);
function exact(v,keys){return v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));}
function position(o){if(!exact(o,['vue','type','refId','x','y','expectedRevision'])||!VIEWS.includes(o.vue)||!KINDS.includes(o.type)||!UUID.test(o.refId||'')||!Number.isInteger(o.x)||o.x<0||o.x>1000||!Number.isInteger(o.y)||o.y<0||o.y>700||!Number.isSafeInteger(o.expectedRevision)||o.expectedRevision<0||o.expectedRevision>999999)return null;
 return {...o};}
module.exports={VIEWS,KINDS,position};
