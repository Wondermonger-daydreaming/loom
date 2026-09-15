export interface Change { before:string; after:string; changed:boolean; accept:boolean }
export function diffText(before:string,after:string):Change[]{
  if(before===after)return [{before,after,changed:false,accept:true}];
  const a=before.match(/\s+|[^\s]+/g)||[],b=after.match(/\s+|[^\s]+/g)||[];
  // Bound memory and UI cost for long passages; retain exact text in the fallback.
  if(a.length*b.length>600000){
    let start=0,end=0;
    while(start<before.length&&start<after.length&&before[start]===after[start])start++;
    while(end<before.length-start&&end<after.length-start&&before[before.length-end-1]===after[after.length-end-1])end++;
    return [
      {before:before.slice(0,start),after:after.slice(0,start),changed:false,accept:true},
      {before:before.slice(start,before.length-end),after:after.slice(start,after.length-end),changed:true,accept:true},
      {before:before.slice(before.length-end),after:after.slice(after.length-end),changed:false,accept:true}
    ].filter(x=>x.before||x.after);
  }
  const width=b.length+1,dp=new Uint32Array((a.length+1)*width);
  for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)dp[i*width+j]=a[i]===b[j]?dp[(i+1)*width+j+1]+1:Math.max(dp[(i+1)*width+j],dp[i*width+j+1]);
  const parts:Change[]=[];
  function add(x:string,y:string,changed:boolean){const last=parts[parts.length-1];if(last&&last.changed===changed){last.before+=x;last.after+=y;}else parts.push({before:x,after:y,changed,accept:true});}
  let i=0,j=0;
  while(i<a.length||j<b.length){
    if(i<a.length&&j<b.length&&a[i]===b[j]){add(a[i++],b[j++],false);}
    else if(i<a.length&&(j===b.length||dp[(i+1)*width+j]>=dp[i*width+j+1]))add(a[i++],'',true);
    else add('',b[j++],true);
  }
  return parts;
}
export const applyChanges=(parts:Change[])=>parts.map(p=>p.changed&&!p.accept?p.before:p.after).join('');
export function renderDiff(host:HTMLElement,parts:Change[],onChange:()=>void){
  host.empty();host.addClass('loom-companion-diff');
  let n=0;
  for(const part of parts){
    if(!part.changed){host.createSpan({text:part.after});continue;}
    const row=host.createSpan({cls:'loom-companion-change'});
    const label=row.createEl('label');
    const check=label.createEl('input',{type:'checkbox'});check.checked=part.accept;
    check.setAttribute('aria-label','Accept change '+(++n));
    label.createSpan({text:'Change '+n,cls:'loom-companion-change-label'});
    if(part.before)row.createEl('del',{text:part.before});
    if(part.after)row.createEl('ins',{text:part.after});
    check.addEventListener('change',()=>{part.accept=check.checked;row.toggleClass('is-rejected',!part.accept);onChange();});
  }
}
