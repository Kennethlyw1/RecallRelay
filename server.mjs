import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {seedData,NOTICE,EVIDENCE,classify,validateRecall,validateEvidence,planActions,summary} from './domain.mjs';
import {config,query,seedGraph,traceGraph,connectEvidence,remember,loadMemory,rememberRun,listModel,interpret,openSandbox,sandboxActions,closeSandbox,usageSnapshot} from './integrations.mjs';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const STATE=path.join(ROOT,'data','state.json');
const PORT=Number(process.env.PORT||config.PORT||4317);
let state;
try{state=JSON.parse(fs.readFileSync(STATE,'utf8'));state.busy=false;state.events||=[];}catch{state=seedData('recallrelay-'+randomUUID().slice(0,8));}
let lastError=state.runs.at(-1)?.status==='failed'?state.events.findLast(e=>e.tone==='error')?.detail||'The previous response needs attention.':null;
function save(){fs.writeFileSync(STATE+'.tmp',JSON.stringify(state,null,2));fs.renameSync(STATE+'.tmp',STATE);}
function event(title,detail,service='agent',tone='info'){
  state.events.push({id:randomUUID(),at:new Date().toISOString(),title,detail,service,tone,run:state.activeRun||null});
  if(state.events.length>150)state.events=state.events.slice(-150);save();
}
function view(){return {...state,summary:summary(state),usage:usageSnapshot(),lastError,fixtures:{notice:NOTICE,evidence:EVIDENCE},activeRun:state.activeRun||null};}

async function refreshTrace(){
  const result=await traceGraph(state,state.recall.lot);
  const local=classify(state,state.recall.lot);
  state.analysis={lot:state.recall.lot,...result,excluded:local.excluded};
  return state.analysis;
}

async function runAgent(notice,{afterEvidence=false}={}){
  const startedAt=new Date().toISOString();
  const run={id:randomUUID().slice(0,8),startedAt,status:'running',lot:state.recall?.lot||'',actions:0};
  state.activeRun=run.id;state.runs.push(run);state.busy=true;lastError=null;save();
  try{
    if(!state.recall||state.recall.notice!==notice){
      event('Reading the recall notice','Nosana is extracting the recalled lot from the source notice.','nosana');
      const extraction=await interpret('recall',notice);
      state.recall={...validateRecall(extraction.data,notice,state),model:extraction.model,at:new Date().toISOString()};
      event('Recall identified',`Basil sauce lot ${state.recall.lot}. The lot identifier is present in the notice and connected inventory.`, 'nosana','success');
    }else event('Recall context restored',`Continuing lot ${state.recall.lot} from stored notice and response history.`, 'neo4j');
    run.lot=state.recall.lot;
    const memory=await loadMemory(state,run.lot);
    for(const prior of memory){
      if(!state.actions.some(a=>a.key===prior.key))state.actions.push({...prior,receipt:JSON.parse(prior.receipt),status:'verified',outletName:state.outlets.find(o=>o.id===prior.outlet)?.name});
      if(prior.type==='hold'){const order=state.orders.find(o=>o.id===prior.order);if(order)order.status='held';}
    }
    event('Response memory retrieved',`${memory.length} verified action${memory.length===1?'':'s'} already recorded for this recall.`, 'neo4j');
    const analysis=await refreshTrace();
    event('Downstream trace complete',`${analysis.affected.length} confirmed orders across ${new Set(analysis.affected.map(x=>x.outlet)).size} outlets. ${analysis.unresolved.length} order${analysis.unresolved.length===1?' still needs':'s still need'} batch evidence.`, 'neo4j','success');
    if(analysis.unresolved.length)event('Evidence gap found',`${analysis.unresolved.map(x=>x.id).join(', ')} cannot be cleared: production batch ${analysis.unresolved.map(x=>x.batch).join(', ')} has no ingredient-lot connection.`, 'agent','warning');
    const plans=planActions(state,analysis);
    for(const p of plans)if(memory.some(x=>x.key===p.key))p.completed=true;
    const pending=plans.filter(x=>!x.completed);
    const skipped=plans.length-pending.length;
    if(skipped)event('Duplicate actions avoided',`${skipped} verified action${skipped===1?'':'s'} reused from Neo4j memory.`, 'neo4j','success');
    if(pending.length){
      const holds=pending.filter(x=>x.type==='hold').length,notices=pending.filter(x=>x.type==='notice').length;
      event('Executing response plan',`${holds} shipment hold${holds===1?'':'s'} and ${notices} outlet notice draft${notices===1?'':'s'} in the synthetic order system.`, 'daytona');
      state.integration.daytona='running';save();
      const sandboxId=await openSandbox();state.sandboxId=sandboxId;save();
      const result=await sandboxActions(state,pending);
      for(const p of pending){
        const receipt=result.receipts.find(x=>x.key===p.key&&x.order===p.order&&x.type===p.type);
        if(!receipt?.verified)throw new Error(`Action for ${p.order} has no verified Daytona receipt. It remains open.`);
        const action={...p,status:'verified',at:new Date().toISOString(),run:run.id,sandboxId,receipt};
        await remember(state,action);
        const old=state.actions.findIndex(a=>a.key===p.key);if(old>=0)state.actions[old]=action;else state.actions.push(action);
        if(p.type==='hold')state.orders.find(o=>o.id===p.order).status='held';
        run.actions++;
        event(p.type==='hold'?'Shipment hold verified':'Outlet notice prepared',`${p.order} · ${p.outletName} · ${p.qty} units. ${p.type==='hold'?'Read-back confirms status: held.':'Draft retained for review; no message has been sent.'}`, 'daytona','success');
      }
      await refreshTrace();
    }
    run.status=state.analysis.unresolved.length?'needs evidence':'complete';
    run.finishedAt=new Date().toISOString();run.skipped=skipped;
    await rememberRun(state,run);
    event(afterEvidence?'Response expanded and remembered':'Response saved',`${run.actions} new verified action${run.actions===1?'':'s'}. ${skipped} duplicate${skipped===1?'':'s'} avoided. ${state.analysis.unresolved.length? 'The remaining evidence gap is still open.':'Every confirmed affected order has a verified response.'}`, 'neo4j','success');
  }catch(e){
    run.status='failed';run.finishedAt=new Date().toISOString();lastError=e.message;
    event('Response needs attention',e.message,'agent','error');
    if(run.lot)try{await rememberRun(state,run);}catch{}
  }finally{
    try{await closeSandbox();state.integration.daytona='stopped';if(state.sandboxId)event('Sandbox stopped','Execution is stopped to conserve promotional credits. Verified receipts remain available.','daytona');}catch(e){state.integration.daytona='stop uncertain';event('Sandbox stop needs attention',e.message,'daytona','error');}
    state.busy=false;state.activeRun=null;save();
  }
}

async function evidenceFlow(text,name){
  state.busy=true;lastError=null;save();
  try{
    event('Inspecting new evidence',`${name}: Nosana is reading the explicit production-lot assignment.`, 'nosana');
    const extraction=await interpret('evidence',text);
    const connection=validateEvidence(extraction.data,text,state);
    const existing=state.evidence.find(e=>e.batch===connection.batch&&e.lot===connection.lot&&e.text===text);
    if(!existing){
      const evidence={...connection,id:'EV-'+randomUUID().slice(0,6).toUpperCase(),name,source:name,text,at:new Date().toISOString(),model:extraction.model};
      await connectEvidence(state,evidence);
      const b=state.batches.find(x=>x.id===connection.batch);b.lot=connection.lot;b.source=name;b.gap=null;
      state.evidence.push(evidence);
      event('Missing connection established',`${connection.lot} → ${connection.batch} → ${connection.order}. The document explicitly confirms the ingredient lot used in production.`, 'neo4j','success');
    }else event('Evidence already recorded','The existing connection will be reused.','neo4j');
    await runAgent(state.recall.notice,{afterEvidence:true});
  }catch(e){lastError=e.message;event('Evidence could not be accepted',e.message,'agent','error');state.busy=false;save();}
}

async function initialize(){
  try{await query('RETURN 1 AS connected');await seedGraph(state);state.integration.neo4j='connected';}
  catch(e){state.integration.neo4j='unavailable';lastError=e.message;}
  try{const model=await listModel();state.integration.nosana='connected';state.model=model.id;}
  catch(e){state.integration.nosana='unavailable';lastError=e.message;}
  state.integration.daytona=config.DAYTONA_API_KEY?'ready':'not configured';save();
}
const contentTypes={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function body(req){
  let value='';for await(const chunk of req){value+=chunk;if(value.length>24000)throw new Error('Request too large.');}
  return JSON.parse(value||'{}');
}
const server=http.createServer(async(req,res)=>{
  try{
    if(!['127.0.0.1:'+PORT,'localhost:'+PORT].includes(req.headers.host)){json(res,403,{error:'Local access only.'});return;}
    const url=new URL(req.url,'http://127.0.0.1:'+PORT);
    if(req.method==='GET'&&url.pathname==='/api/state'){json(res,200,view());return;}
    if(req.method==='GET'&&url.pathname.startsWith('/api/source/')){
      const names={lot:'supplier-lots.csv',batch:'production.csv',order:'orders.csv',outlet:'outlets.csv'};
      const name=names[url.pathname.slice('/api/source/'.length)];
      if(!name){json(res,404,{error:'Unknown source.'});return;}
      json(res,200,{name,text:fs.readFileSync(path.join(ROOT,'fixtures',name),'utf8')});return;
    }
    if(req.method==='POST'&&url.pathname.startsWith('/api/')){
      if(req.headers.origin&&!['http://127.0.0.1:'+PORT,'http://localhost:'+PORT].includes(req.headers.origin)){json(res,403,{error:'Origin not allowed.'});return;}
      if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'Use application/json.'});return;}
      if(state.busy){json(res,409,{error:'A response is already running. Please wait.'});return;}
      const input=await body(req);
      if(state.busy){json(res,409,{error:'A response is already running. Please wait.'});return;}
      if(url.pathname==='/api/run'){
        const notice=String(input.notice||NOTICE).trim();if(notice.length>12000||notice.length<10)throw new Error('Use a recall notice between 10 and 12,000 characters.');
        state.busy=true;void runAgent(notice);json(res,202,{accepted:true});return;
      }
      if(url.pathname==='/api/evidence'){
        if(!state.recall)throw new Error('Run the recall trace before adding evidence.');
        const text=String(input.text||'').trim(),name=String(input.name||'delivery-note.txt').replace(/[^a-zA-Z0-9_. -]/g,'').slice(0,80);
        if(!text||text.length>12000)throw new Error('Use a text or CSV document below 12,000 characters.');
        state.busy=true;void evidenceFlow(text,name);json(res,202,{accepted:true});return;
      }
      if(url.pathname==='/api/reset'){
        const previous=state;state=seedData('recallrelay-'+randomUUID().slice(0,8));state.busy=true;
        try{await seedGraph(state);state.integration={...previous.integration,neo4j:'connected',daytona:'ready'};state.model=previous.model;lastError=null;event('Fresh demonstration ready','A new synthetic dataset was created. Previous recall evidence and receipts remain in their original namespace.','neo4j');}
        catch(e){state=previous;throw e;}finally{state.busy=false;save();}
        json(res,200,{ok:true});return;
      }
      json(res,404,{error:'Unknown action.'});return;
    }
    if(req.method==='GET'&&url.pathname==='/api/export'){
      res.writeHead(200,{'Content-Type':'application/json','Content-Disposition':'attachment; filename="recallrelay-evidence-pack.json"'});
      res.end(JSON.stringify({demo:true,namespace:state.namespace,recall:state.recall,analysis:state.analysis,evidence:state.evidence,actions:state.actions,runs:state.runs,events:state.events},null,2));return;
    }
    const files={'/':'index.html','/style.css':'style.css','/app.js':'app.js'};
    if(req.method==='GET'&&files[url.pathname]){
      const file=path.join(ROOT,'public',files[url.pathname]);
      res.writeHead(200,{'Content-Type':contentTypes[path.extname(file)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"});res.end(fs.readFileSync(file));return;
    }
    json(res,404,{error:'Not found.'});
  }catch(e){json(res,400,{error:e.message});}
});
await initialize();
server.listen(PORT,'127.0.0.1',()=>console.log(`RecallRelay running at http://127.0.0.1:${PORT} — synthetic demonstration`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await closeSandbox().catch(()=>{});server.close(()=>process.exit(0));});
