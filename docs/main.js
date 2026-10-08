import {makePreset,analyze} from "./engine.mjs";
const $=id=>document.getElementById(id);
const pct=(v,n=1)=>(v*100).toFixed(n)+"%";
const descriptions={
  balanced:"Six simulated assets · diversified portfolio",
  equity_shock:"Synthetic equity stress · higher recent equity risk",
  rates_shock:"Synthetic rate shock · Treasury and credit pressure"
};
const explanations={
  off:"Use only the standard risk forecast. The portfolios should coincide.",
  scenarios:"Constrain the allocation under three distinct covariance forecasts.",
  calibrated:"Use completed historical months to adjust risk for forecast errors.",
  stress:"Add a user-chosen buffer above the historical risk margin. Sensitivity only."
};
let data=makePreset("balanced"),result=null;
const make=(tag,cls="",text)=>{
  const x=document.createElement(tag);
  if(cls)x.className=cls;
  if(text!==undefined)x.textContent=text;
  return x;
};
const ns="http://www.w3.org/2000/svg";
function svgElement(tag,attrs,text){
  const x=document.createElementNS(ns,tag);
  for(const [key,value] of Object.entries(attrs))x.setAttribute(key,String(value));
  if(text!==undefined)x.textContent=text;
  return x;
}
const mode=()=>document.querySelector('input[name="uq-mode"]:checked')?.value||"calibrated";
function sync(){
  $("risk-label").textContent=Number($("risk").value).toFixed(1)+"%";
  $("weight-label").textContent=$("weight").value+"%";
  $("quantile-label").textContent=$("quantile").value+"%";
  $("stress-label").textContent=Number($("stress").value).toFixed(2)+"×";
  $("cost-label").textContent=$("cost").value+" bps";
  $("mode-description").textContent=explanations[mode()];
  $("case-description").textContent=descriptions[$("portfolio-case").value];
  $("quantile-control").hidden=!["calibrated","stress"].includes(mode());
  $("stress-control").hidden=mode()!=="stress";
}
function allocation(x){
  const host=$("weight-bars");host.replaceChildren();
  x.assets.forEach((asset,i)=>{
    const row=make("div","allocation-row"),a=x.profiles.Standard.weights[i],
          b=x.profiles["Scenario Robust"].weights[i];
    const name=make("span","asset-name",asset);name.title=asset;row.append(name);
    for(const [type,value] of [["blue",a],["mint",b]]){
      const cell=make("div","weight-cell"),track=make("div","weight-track");
      const fill=make("div","weight-fill "+type);
      fill.style.width=(100*Math.max(0,Math.min(value,1))).toFixed(1)+"%";
      track.append(fill);cell.append(track,make("span","weight-value",pct(value,0)));
      row.append(cell);
    }
    const diff=(b-a)*100;
    row.append(make("span","delta-value "+(diff>.05?"positive":diff<-.05?"negative":""),
      (diff>.05?"+":"")+diff.toFixed(1)+" pp"));
    host.append(row);
  });
}
function riskModels(x){
  const host=$("model-bars");host.replaceChildren();
  const standard=x.profiles.Standard.vol,uq=x.profiles["Scenario Robust"].vol;
  const max=Math.max(.10,...Object.values(standard),...Object.values(uq))*1.2;
  for(const [key,label] of [["long","Long / 504d"],["short","Short / 126d"],["ewma","EWMA / 42d"]]){
    const row=make("div","model-row"),group=make("div");
    for(const [type,value] of [["blue",standard[key]],["mint",uq[key]]]){
      const pair=make("div","model-pair"),track=make("div","model-track"),fill=make("div","model-fill "+type);
      fill.style.width=(value/max*100).toFixed(2)+"%";
      track.append(fill);pair.append(track,make("span","model-value",pct(value)));
      group.append(pair);
    }
    row.append(make("span","model-label",label),group);host.append(row);
  }
}
function plot(x){
  const host=$("risk-return-chart");host.replaceChildren();
  const profiles=[
    ["Current",x.profiles.Current,"#708ca3"],
    ["Standard",x.profiles.Standard,"#8aaef7"],
    ["UQ",x.profiles["Scenario Robust"],"#58e0c3"]
  ];
  const risk=profiles.map(r=>r[1].maxScenarioVol);
  const ret=profiles.map(r=>r[1].expectedReturn);
  const minX=Math.max(0,Math.min(...risk)*.70),maxX=Math.max(...risk)*1.19+.0001;
  const minY=Math.min(0,...ret)-.01,maxY=Math.max(...ret)+.016;
  const W=440,H=162,L=44,R=17,T=9,B=31;
  const xx=v=>L+(v-minX)/(maxX-minX)*(W-L-R);
  const yy=v=>H-B-(v-minY)/(maxY-minY)*(H-T-B);
  const svg=svgElement("svg",{viewBox:"0 0 "+W+" "+H,"aria-hidden":"true",role:"presentation"});
  for(let k=0;k<=3;k++){
    const y=T+(H-T-B)*k/3,value=maxY-(maxY-minY)*k/3;
    svg.append(svgElement("line",{x1:L,x2:W-R,y1:y,y2:y,stroke:"#2c4356"}));
    svg.append(svgElement("text",{x:L-7,y:y+3,"text-anchor":"end"},pct(value,0)));
    const xPos=L+(W-L-R)*k/3;
    svg.append(svgElement("line",{x1:xPos,x2:xPos,y1:T,y2:H-B,stroke:"#223749"}));
    svg.append(svgElement("text",{x:xPos,y:H-B+16,"text-anchor":"middle"},pct(minX+(maxX-minX)*k/3,0)));
  }
  svg.append(svgElement("text",{x:(L+W-R)/2,y:H-1,"text-anchor":"middle"},"Worst-scenario risk"));
  svg.append(svgElement("line",{x1:xx(risk[1]),y1:yy(ret[1]),x2:xx(risk[2]),y2:yy(ret[2]),stroke:"#579d92","stroke-dasharray":"4 4","stroke-width":1.5}));
  profiles.forEach(([name,value,color],i)=>{
    const xPos=xx(value.maxScenarioVol),yPos=yy(value.expectedReturn);
    svg.append(svgElement("circle",{cx:xPos,cy:yPos,r:5,fill:color,stroke:"#102033","stroke-width":2}));
    svg.append(svgElement("text",{x:xPos+7,y:yPos+(i===2?15:-10),fill:color},name));
  });
  host.append(svg);
}
function economics(x){
  const a=x.profiles.Standard,b=x.profiles["Scenario Robust"];
  const tbody=$("decision-tbody");tbody.replaceChildren();
  for(const [name,key] of [["Expected annual return","expectedReturn"],["Worst model risk","maxScenarioVol"],["One-way turnover","oneWayTurnover"],["One-time trading cost","costFraction"]]){
    const tr=make("tr");
    tr.append(make("td","",name),make("td","",pct(a[key],2)),make("td","",pct(b[key],2)));
    tbody.append(tr);
  }
  const reduction=(a.maxScenarioVol-b.maxScenarioVol)*100;
  const returnDelta=(b.expectedReturn-a.expectedReturn)*100;
  $("decision-insight").replaceChildren(make("b","","PM DECISION INSIGHT"),
    make("p","", "Selected UQ mode "+(reduction>=0?"reduces":"raises")+" modeled worst-case risk by "+Math.abs(reduction).toFixed(2)+" pp compared with standard. Expected annual return changes by "+(returnDelta>0?"+":"")+returnDelta.toFixed(2)+" pp. Consider the risk protection alongside its opportunity cost."),
    make("small","","All values are modeled with synthetic inputs, not realized gains."));
  $("calibration-note").textContent=(
    mode()==="stress"?"User-selected stress overlay":
    mode()==="calibrated"?"Historical error margin":
    mode()==="scenarios"?"Three scenarios":"UQ disabled")+
    " · "+x.calibration.multiplier.toFixed(2)+"×";
  $("delta-metric").textContent=(returnDelta>0?"+":"")+returnDelta.toFixed(2)+" pp";
  $("delta-metric").parentElement.classList.toggle("negative",returnDelta<-.005);
}
function render(x){
  $("error-box").hidden=true;$("dashboard-body").hidden=false;
  $("budget-metric").textContent=pct(x.options.riskBudget);
  $("effective-metric").textContent=pct(x.profiles["Scenario Robust"].budget);
  $("risk-metric").textContent=pct(x.profiles["Scenario Robust"].maxScenarioVol);
  $("run-status").textContent="ANALYSIS READY";
  allocation(x);riskModels(x);plot(x);economics(x);
  $("download-json").disabled=false;
}
function calculate(){
  sync();$("run-status").textContent="CALCULATING...";
  try{
    result=analyze(data,{
      riskBudget:Number($("risk").value)/100,
      maxWeight:Number($("weight").value)/100,
      quantile:Number($("quantile").value)/100,
      stressMultiplier:Number($("stress").value),
      costBps:Number($("cost").value),
      uncertaintyMode:mode()
    });
    render(result);
  }catch(error){
    result=null;$("error-box").hidden=false;
    $("error-box").textContent=error instanceof Error?error.message:"Portfolio calculation failed";
    $("dashboard-body").hidden=true;
    $("download-json").disabled=true;
    $("run-status").textContent="CHECK SETTINGS";
  }
}
$("portfolio-case").addEventListener("change",()=>{data=makePreset($("portfolio-case").value);calculate()});
for(const input of document.querySelectorAll('input[name="uq-mode"]'))input.addEventListener("change",calculate);
for(const id of ["risk","weight","quantile","stress","cost"]){
  $(id).addEventListener("input",sync);
  $(id).addEventListener("change",calculate);
}
$("run-analysis").addEventListener("click",calculate);
$("download-json").addEventListener("click",()=>{
  if(!result)return;
  const content=JSON.stringify({...result,syntheticCase:$("portfolio-case").value,generatedAt:new Date().toISOString()},null,2);
  const blob=new Blob([content],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="portfolio-risk-decision-demo.json";
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$("copy-code").addEventListener("click",async()=>{
  try{
    await navigator.clipboard.writeText($("code-example").textContent);
    $("copy-code").textContent="Copied";
    setTimeout(()=>$("copy-code").textContent="Copy code",1400);
  }catch(_){$("copy-code").textContent="Select and copy";}
});
sync();calculate();
