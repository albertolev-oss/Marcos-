import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { WebSocketServer } from 'ws';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActionQueue, planInstruction } from '../../../packages/agent-core/src/index.js';
import { csrfToken, redact, SessionClock } from '../../../packages/security/src/index.js';
import { ClinicalBrowser } from '../../../packages/browser-core/src/index.js';
import { DomainPolicy } from '../../../packages/security/src/index.js';

const app = express();
const port = Number(process.env.PORT ?? 3000);
const production = process.env.NODE_ENV === 'production';
const allowWrites = process.env.ALLOW_CLINICAL_WRITES === 'true';
if (allowWrites) console.warn('Clinical writes flag is active; confirmation remains mandatory.');
const idleMs = Number(process.env.SESSION_IDLE_MINUTES ?? 15) * 60_000;
const sessions = new Map<string,{csrf:string; clock:SessionClock}>();
const queue = new ActionQueue();
const domainPolicy = new DomainPolicy((process.env.ALLOWED_DOMAINS ?? '').split(',').map(x=>x.trim()).filter(Boolean));
const browser = new ClinicalBrowser(process.env.BROWSER_PROFILE_PATH ?? '/data/chromium-profile', domainPolicy);

app.set('trust proxy', 1);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],frameSrc:["'self'"],connectSrc:["'self'",'ws:','wss:'],styleSrc:["'self'","'unsafe-inline'"]}}}));
app.use(express.json({limit:'32kb'})); app.use(cookieParser());
app.use(rateLimit({windowMs:60_000,limit:60,standardHeaders:'draft-8',legacyHeaders:false}));

function auth(req:any,res:any,next:any) {
  const supplied = req.get('authorization')?.replace(/^Bearer /,'') || req.cookies?.clinical_access;
  const expected = process.env.APP_ACCESS_TOKEN;
  if (!expected || !supplied || supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))) return res.status(401).json({error:'unauthorized'});
  let sid=req.cookies?.clinical_sid; let session=sid&&sessions.get(sid);
  if (!session || session.clock.expired()) { if(sid) sessions.delete(sid); sid=crypto.randomUUID(); session={csrf:csrfToken(),clock:new SessionClock(idleMs)}; sessions.set(sid,session); res.cookie('clinical_sid',sid,{httpOnly:true,secure:production,sameSite:'strict',maxAge:idleMs}); }
  session.clock.touch(); req.session=session; next();
}
function csrf(req:any,res:any,next:any) { if (!['GET','HEAD'].includes(req.method) && req.get('x-csrf-token') !== req.session.csrf) return res.status(403).json({error:'csrf'}); next(); }
app.get('/healthz',(_req,res)=>res.json({status:'ok',mode:allowWrites?'confirmation-required':'read-only'}));
app.post('/api/login',(req,res)=>{ const expected=process.env.APP_ACCESS_TOKEN; if(!expected||req.body?.token!==expected)return res.status(401).json({error:'unauthorized'}); res.cookie('clinical_access',expected,{httpOnly:true,secure:production,sameSite:'strict',maxAge:idleMs}); res.json({ok:true}); });
app.use('/api',auth,csrf);
app.get('/api/session',(req:any,res)=>res.json({csrf:req.session.csrf,mode:allowWrites?'write-with-confirmation':'read-only',novncUrl:process.env.NOVNC_URL??'/novnc/vnc.html?autoconnect=true&resize=scale'}));
app.post('/api/instructions',async(req,res)=>{ const text=String(req.body?.instruction??'').slice(0,1000); const dom=browser.page?await browser.safeDom():[]; const decision=planInstruction(text,dom,allowWrites); console.info(JSON.stringify(redact({event:'instruction',status:decision.status,instruction:text}))); res.json(decision); });
app.post('/api/control/:action',async(req,res)=>{ const action=req.params.action; if(action==='stop')queue.stop(); else if(action==='continue')queue.resume(); else if(action==='logout'){ for(const name of ['clinical_sid','clinical_access'])res.clearCookie(name); } else if(action==='clear-profile'){ await browser.context?.clearCookies(); await browser.page?.evaluate(()=>{localStorage.clear();sessionStorage.clear()}); } else if(action!=='manual')return res.status(400).json({error:'invalid_action'}); res.json({ok:true,action}); });
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../web'); app.use(express.static(root)); app.get('*',(_req,res)=>res.sendFile(path.join(root,'index.html')));
const server=app.listen(port,()=>console.log(`Clinical agent listening on ${port}`));
if(process.env.BROWSER_ENABLED!=='false')browser.start().catch(error=>console.error(JSON.stringify(redact({event:'browser_start_failed',error:String(error)}))));
const wss=new WebSocketServer({server,path:'/ws'}); wss.on('connection',ws=>{ws.send(JSON.stringify({type:'status',connected:true})); const timer=setInterval(()=>ws.readyState===ws.OPEN&&ws.send(JSON.stringify({type:'heartbeat'})),15000); ws.on('close',()=>clearInterval(timer));});
export { app, server };
