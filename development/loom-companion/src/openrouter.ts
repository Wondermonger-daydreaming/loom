import { homedir } from 'os';
import { readFileSync } from 'fs';
import { join } from 'path';
import type LoomCompanionPlugin from './main';

export function resolveOpenRouterKey():string {
  const env=process.env.OPENROUTER_API_KEY?.trim();if(env)return env;
  try {const key=readFileSync(join(homedir(),'.loom-openrouter.key'),'utf8').trim();if(key)return key;}catch{}
  throw new Error('Set OPENROUTER_API_KEY or add your key to ~/.loom-openrouter.key.');
}
export interface ChatOpts {
  plugin:LoomCompanionPlugin; operation:string; target?:string; onRecord?:(r:any)=>void;
  model:string;system:string;user:string;temperature:number;maxTokens:number;signal:AbortSignal;
}
export async function* streamChat(opts:ChatOpts):AsyncGenerator<string>{
  if(!opts.model.trim())throw new Error('Choose a model before generating.');
  if(!Number.isFinite(opts.temperature)||opts.temperature<0||opts.temperature>2)throw new Error('Temperature must be between 0 and 2.');
  if(!Number.isInteger(opts.maxTokens)||opts.maxTokens<1)throw new Error('Max tokens must be a positive integer.');
  await opts.plugin.shared.ready;
  const body=opts.plugin.shared.parameters({model:opts.model,messages:[{role:'system',content:opts.system},{role:'user',content:opts.user}],temperature:opts.temperature,max_tokens:opts.maxTokens,stream:true});
  const startedAt=new Date().toISOString(),controller=new AbortController();
  const abort=()=>controller.abort();opts.signal.addEventListener('abort',abort,{once:true});if(opts.signal.aborted)abort();
  opts.plugin.controllers.add(controller);
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},120000);
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  let output='',status='error',responseId='',resolvedModel='',usage:any;
  const parse=(line:string):{done?:boolean;content?:string}=>{
    if(!line.startsWith('data:'))return {};
    const value=line.slice(5).trim();if(!value)return {};
    if(value==='[DONE]')return {done:true};
    const data=JSON.parse(value);
    if(data.error)throw new Error(data.error.message||'OpenRouter streaming error');
    responseId=data.id||responseId;resolvedModel=data.model||resolvedModel;usage=data.usage||usage;
    if(data.choices?.[0]?.error)throw new Error(data.choices[0].error.message||'Provider streaming error');
    const content=data.choices?.[0]?.delta?.content;
    return {content:typeof content==='string'?content:undefined};
  };
  try{
    const res=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+resolveOpenRouterKey(),'Content-Type':'application/json','HTTP-Referer':'https://obsidian.md','X-Title':'Loom Companion'},body:JSON.stringify(body),signal:controller.signal});
    if(!res.ok||!res.body)throw new Error('OpenRouter '+res.status+': '+(await res.text()).slice(0,300));
    reader=res.body.getReader();const decoder=new TextDecoder();let buffer='',finished=false;
    while(!finished){
      const {done,value}=await reader.read();buffer+=done?decoder.decode():decoder.decode(value,{stream:true});
      const lines=buffer.split('\n');buffer=lines.pop()||'';if(done&&buffer){lines.push(buffer);buffer='';}
      for(const line of lines){
        const event=parse(line.trim());if(event.done){finished=true;break;}
        if(event.content){output+=event.content;yield event.content;}
      }
      if(done)break;
    }
    if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
    status='complete';
  }catch(e){
    status=controller.signal.aborted?'aborted':'error';
    if(timedOut)throw new Error('Generation timed out after two minutes. Retry or choose a faster model.');
    throw e;
  }finally{
    clearTimeout(timer);
    if(reader){try{await reader.cancel();}catch{}reader.releaseLock();}
    const record={operation:opts.operation,provider:'openrouter',model:opts.model,resolvedModel,responseId,target:opts.target,startedAt,finishedAt:new Date().toISOString(),status,request:body,output,usage};
    const id=await opts.plugin.shared.record(record);
    opts.signal.removeEventListener('abort',abort);opts.plugin.controllers.delete(controller);
    opts.onRecord?.({...record,id});
    if(controller.signal.aborted && status==='complete')throw new DOMException('Aborted','AbortError');
  }
}
export async function collectChat(opts:ChatOpts):Promise<string>{let out='';for await(const delta of streamChat(opts))out+=delta;return out.trim();}
