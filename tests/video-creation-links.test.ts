import test from 'node:test';
import assert from 'node:assert/strict';
import {rememberVideoCreation,projectVideoHistory,projectVideoOrders,videoCreationMembers} from '../desktop/renderer/src/components/video-creation-links.js';
import type {VideoOrder} from '../src/videogen/contracts.js';
const first='a1928c6b-cdd2-4971-b576-1aea7290d5f2',second='b1928c6b-cdd2-4971-b576-1aea7290d5f2',third='c1928c6b-cdd2-4971-b576-1aea7290d5f2';
function fixture(){const data=new Map<string,string>();return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value)}}}
test('legacy responses keep continuation in one history entry with original title and distinct orders',()=>{
 const storage=fixture();rememberVideoCreation('owner',second,first,storage);rememberVideoCreation('owner',third,first,storage);
 const orders=projectVideoOrders('owner',[{id:first,request_id:first},{id:second,request_id:second},{id:third,request_id:third}] as VideoOrder[],storage);
 assert(orders.every(row=>row.creation_id===first));assert.equal(new Set(orders.map(row=>row.request_id)).size,3);
 const history=projectVideoHistory('owner',[{requestId:third,title:'Third',createdAt:3,updatedAt:3,count:1},{requestId:second,title:'Second',createdAt:2,updatedAt:2,count:1},{requestId:first,title:'Original',createdAt:1,updatedAt:1,count:1}],storage);
 assert.deepEqual(history,[{requestId:first,title:'Original',createdAt:1,updatedAt:3,count:3}]);assert.deepEqual(videoCreationMembers('owner',first,storage),[first,second,third]);
});
test('new creation, unknown old records and another account stay separate',()=>{
 const storage=fixture();rememberVideoCreation('owner',second,first,storage);rememberVideoCreation('owner',third,undefined,storage);
 const rows=[{requestId:first,title:'A',createdAt:1,updatedAt:1,count:1},{requestId:second,title:'B',createdAt:2,updatedAt:2,count:1},{requestId:third,title:'C',createdAt:3,updatedAt:3,count:1}];
 assert.equal(projectVideoHistory('owner',rows,storage).length,2);assert.equal(projectVideoHistory('another',rows,storage).length,3);
});
test('current main-process creation metadata and legacy local links project consistently',()=>{
 const storage=fixture();rememberVideoCreation('owner',second,first,storage);
 assert.equal(projectVideoOrders('owner',[{request_id:second,creation_id:first}] as VideoOrder[],storage)[0].creation_id,first);
 assert.throws(()=>rememberVideoCreation('owner',second,third,storage),/INVALID_ORDER/);assert.throws(()=>rememberVideoCreation('owner','bad-id',first,storage),/INVALID_ORDER/);
});
