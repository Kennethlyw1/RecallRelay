export const NOTICE = `SYNTHETIC DEMO — supplier recall notice\nOrchard Ingredients requests the recall of basil sauce, lot B17, supplied on 28 October 2026. Place remaining stock and pending shipments containing this lot on hold. Trace all downstream production and deliveries. Retain batch and delivery evidence for follow-up. This notice is fictional and is not a public food safety alert.`;
export const EVIDENCE = `SYNTHETIC DEMO — delivery note DN-003\nSupplier: Orchard Ingredients\nIngredient: basil sauce\nIngredient lot: B17\nProduction batch: P204\nOrder: O1007\nOutlet: Airport Kitchen\nQuantity: 32 units\nProduction date: 29 October 2026\nThis note confirms that production batch P204 used ingredient lot B17.\nThis is a fictional record for the RecallRelay demonstration.`;

export function seedData(namespace) {
  const lots = [
    {id:'B17',name:'Basil sauce · B17',kind:'lot',supplier:'Orchard Ingredients',source:'supplier-lots.csv:2'},
    {id:'B18',name:'Basil sauce · B18',kind:'lot',supplier:'Orchard Ingredients',source:'supplier-lots.csv:3'}
  ];
  const batches = [
    {id:'P201',name:'Basil pasta',kind:'batch',lot:'B17',source:'production.csv:2'},
    {id:'P202',name:'Garden wrap',kind:'batch',lot:'B17',source:'production.csv:3'},
    {id:'P203',name:'Vegetable bowl',kind:'batch',lot:'B18',source:'production.csv:4'},
    {id:'P204',name:'Basil pasta',kind:'batch',lot:null,source:'production.csv:5',gap:'Ingredient lot missing from production record'},
    {id:'P205',name:'Basil pasta',kind:'batch',lot:'B18',source:'production.csv:6'}
  ];
  const outlets = [
    {id:'HARBOUR',name:'Harbour Kitchen',kind:'outlet',source:'outlets.csv:2'},
    {id:'CENTRAL',name:'Central Kitchen',kind:'outlet',source:'outlets.csv:3'},
    {id:'AIRPORT',name:'Airport Kitchen',kind:'outlet',source:'outlets.csv:4'}
  ];
  const tuples = [
    ['O1001','P201','HARBOUR',48,'pending'], ['O1002','P202','CENTRAL',36,'pending'],
    ['O1003','P202','HARBOUR',24,'delivered'], ['O1004','P203','CENTRAL',60,'pending'],
    ['O1005','P201','CENTRAL',18,'delivered'], ['O1006','P203','HARBOUR',40,'delivered'],
    ['O1007','P204','AIRPORT',32,'pending'], ['O1008','P205','AIRPORT',20,'pending']
  ];
  const orders=tuples.map(([id,batch,outlet,qty,status],i)=>({id,batch,outlet,qty,status,name:id,kind:'order',source:`orders.csv:${i+2}`}));
  return {namespace,lots,batches,outlets,orders,evidence:[],actions:[],runs:[],events:[],recall:null,analysis:null,integration:{neo4j:'checking',daytona:'ready',nosana:'checking'},busy:false};
}

export function classify(state, lot) {
  const batches=new Map(state.batches.map(b=>[b.id,b]));
  const affected=[], unresolved=[], excluded=[];
  for (const o of state.orders) {
    const b=batches.get(o.batch);
    const row={...o,product:b.name,lot:b.lot,outletName:state.outlets.find(x=>x.id===o.outlet).name,productionSource:b.source};
    if (!b.lot) unresolved.push(row);
    else if (b.lot===lot) affected.push(row);
    else excluded.push(row);
  }
  return {lot,affected,unresolved,excluded};
}

export function validateRecall(extraction, text, state) {
  if (!extraction || typeof extraction.lot!=='string') throw new Error('The notice did not identify a supported ingredient lot.');
  const lot=extraction.lot.toUpperCase().trim();
  if (!state.lots.some(x=>x.id===lot) || !new RegExp(`\\b${lot}\\b`,'i').test(text)) throw new Error('The extracted lot is not supported by the notice and the connected records.');
  if (!text.toLowerCase().includes('basil sauce')) throw new Error('This demo currently supports basil sauce recall notices.');
  return {lot,supplier:'Orchard Ingredients',product:'Basil sauce',notice:text,summary:String(extraction.summary||`Trace basil sauce lot ${lot}.`).slice(0,400)};
}

export function validateEvidence(extraction, text, state) {
  if (!extraction || !['batch','lot','order'].every(k=>typeof extraction[k]==='string')) throw new Error('The evidence must identify a production batch, ingredient lot, and order.');
  const result=Object.fromEntries(['batch','lot','order'].map(k=>[k,extraction[k].toUpperCase().trim()]));
  for (const value of Object.values(result)) if (!new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(text)) throw new Error('The proposed connection is not supported by the uploaded text.');
  const batch=state.batches.find(x=>x.id===result.batch),order=state.orders.find(x=>x.id===result.order);
  if (!batch || !state.lots.some(x=>x.id===result.lot) || !order || order.batch!==result.batch) throw new Error('Evidence does not match the connected production and order records.');
  if (batch.lot && batch.lot!==result.lot) throw new Error('This document conflicts with an existing lot assignment. Review it before changing the trace.');
  // A direct source statement is required; co-occurring identifiers alone do not establish lineage.
  const direct=new RegExp(`(?:production\\s+)?batch\\s+${result.batch}\\s+(?:used|contains|was made with)\\s+(?:ingredient\\s+)?lot\\s+${result.lot}`,'i');
  if (!direct.test(text)) throw new Error(`Include a direct statement such as "Production batch ${result.batch} used ingredient lot ${result.lot}". Identifiers alone do not prove the connection.`);
  return result;
}

export function actionKey(state, lot, order, type) {return `${state.namespace}:${lot}:${order}:${type}`;}

export function planActions(state, analysis) {
  return analysis.affected.map(o=>{
    const type=o.status==='delivered'?'notice':'hold';
    const key=actionKey(state,analysis.lot,o.id,type);
    return {key,order:o.id,type,qty:o.qty,outlet:o.outlet,outletName:o.outletName,batch:o.batch,lot:analysis.lot,
      completed:state.actions.some(a=>a.key===key&&a.status==='verified')};
  });
}

export function summary(state) {
  const a=state.analysis;
  return {affected:a?.affected.length||0,outlets:new Set(a?.affected.map(x=>x.outlet)||[]).size,
    units:a?.affected.reduce((n,x)=>n+x.qty,0)||0,
    held:state.orders.filter(x=>x.status==='held').length,
    heldUnits:state.orders.filter(x=>x.status==='held').reduce((n,x)=>n+x.qty,0),
    unresolved:a?.unresolved.length??state.orders.filter(o=>!state.batches.find(b=>b.id===o.batch).lot).length,
    notices:state.actions.filter(x=>x.type==='notice'&&x.status==='verified').length,
    actions:state.actions.filter(x=>x.status==='verified').length};
}
