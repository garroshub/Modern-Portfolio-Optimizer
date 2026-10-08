import {makeSynthetic,parseReturnsCSV,analyze} from "./engine.mjs";
const $=id=>document.getElementById(id);
const pct=(v,d=1)=>(v*100).toFixed(d)+"%";
const dataset=makeSynthetic();
let data=dataset,lastResult=null;
const colors={Current:"Current",Standard:"Standard","Scenario Robust":"Robust"};

function create(tag,cls="",value){
  const x=document.createElement(tag);if(cls)x.className=cls;
  if(value!==undefined)x.textContent=value;return x;
}
function labels(){
  $("risk-label").textContent=Number($("risk").value).toFixed(1)+"%";
  $("weight-label").textContent=Number($("weight").value).toFixed(0)+"%";
  $("quantile-label").textContent=Number($("quantile").value).toFixed(0)+"%";
  $("cost-label").textContent=Number($("cost").value).toFixed(0)+" bps";
}
function drawWeights(result){
  const target=$("weight-bars");target.replaceChildren();
  for(let i=0;i<result.assets.length;i++){
    const row=create("div","weight-row");
    const name=create("span","weight-name",result.assets[i]);name.title=result.assets[i];
    const value=create("div","weight-lines"),tracks=create("div","weight-tracks");
    for(const method of ["Current","Standard","Scenario Robust"]){
      const track=create("div","weight-track");
      track.title=method+": "+pct(result.profiles[method].weights[i]);
      const fill=create("div","weight-fill "+colors[method]);
      fill.style.width=Math.max(0,100*result.profiles[method].weights[i]).toFixed(2)+"%";
      track.appendChild(fill);tracks.appendChild(track);
    }
    value.append(tracks,create("div","weight-label",pct(result.profiles["Scenario Robust"].weights[i],0)));
    row.append(name,value);target.append(row);
  }
}
function drawModels(result){
  const target=$("model-bars");target.replaceChildren();
  const model=result.profiles.Current.vol;
  const max=Math.max(.10,...Object.values(model))*1.25;
  for(const [key,title] of [["long","504-day long"],["short","126-day short"],["ewma","EWMA / 42"]]){
    const row=create("div","scenario-row"),track=create("div","scenario-track");
    const fill=create("div","scenario-fill");
    fill.style.width=(100*model[key]/max).toFixed(2)+"%";
    track.appendChild(fill);
    row.append(create("span","",title),track,create("span","scenario-val",pct(model[key])));
    target.append(row);
  }
}
function drawTradeoffs(result){
  const std=result.profiles.Standard,rob=result.profiles["Scenario Robust"];
  const tbody=$("decision-tbody");tbody.replaceChildren();
  const metrics=[
    ["Expected annual return","expectedReturn"],
    ["Highest modeled volatility","maxScenarioVol"],
    ["One-way turnover","oneWayTurnover"],
    ["One-time transaction cost","costFraction"],
    ["Return after trading cost","expectedReturnAfterOneTimeCost"],
    ["Applied risk limit","budget"]
  ];
  for(const [label,key] of metrics){
    const row=create("tr");
    row.append(create("td","",label),create("td","",pct(std[key],2)),
               create("td","",pct(rob[key],2)));
    tbody.append(row);
  }
  const volDiff=100*(std.maxScenarioVol-rob.maxScenarioVol);
  const returnDiff=100*(std.expectedReturn-rob.expectedReturn);
  const insight=$("decision-insight");insight.replaceChildren();
  insight.append(create("b","","PM DECISION INSIGHT"),
    create("p","",
      "Compared with the standard allocation, robust constraints "+
      (volDiff>=0?"reduce":"increase")+" the highest modeled volatility by "+
      Math.abs(volDiff).toFixed(2)+" percentage points. "+
      "Modeled annual return is "+Math.abs(returnDiff).toFixed(2)+
      " percentage points "+(returnDiff>=0?"lower":"higher")+
      " under the robust model. Examine this trade-off before accepting a tighter risk budget. These are estimates, not realized performance."
    ));
}
function render(result){
  $("error-box").hidden=true;$("dashboard-body").hidden=false;
  $("budget-metric").textContent=pct(result.options.riskBudget);
  $("effective-metric").textContent=pct(result.profiles["Scenario Robust"].budget);
  $("margin-metric").textContent=result.calibration.multiplier.toFixed(2)+"×";
  $("history-metric").textContent=result.calibration.months+" completed months";
  $("risk-metric").textContent=pct(result.profiles["Scenario Robust"].maxScenarioVol);
  $("run-status").textContent="MODEL CALCULATED";
  drawWeights(result);drawModels(result);drawTradeoffs(result);
  $("download-json").disabled=false;
}
function calculate(){
  labels();$("run-status").textContent="CALCULATING...";
  try{
    lastResult=analyze(data,{
      riskBudget:Number($("risk").value)/100,
      maxWeight:Number($("weight").value)/100,
      quantile:Number($("quantile").value)/100,
      costBps:Number($("cost").value),
      calibration:$("use-calibration").checked
    });
    render(lastResult);
  }catch(error){
    lastResult=null;$("error-box").hidden=false;
    $("error-box").textContent=error instanceof Error?error.message:"Portfolio analysis failed";
    $("run-status").textContent="NEEDS ATTENTION";
    $("dashboard-body").hidden=true;$("download-json").disabled=true;
  }
}
$("run-analysis").addEventListener("click",calculate);
for(const id of ["risk","weight","quantile","cost"]){
  $(id).addEventListener("input",labels);$(id).addEventListener("change",calculate);
}
$("use-calibration").addEventListener("change",calculate);
$("btn-synthetic").addEventListener("click",()=>{
  data=dataset;$("upload-csv").value="";
  $("btn-synthetic").classList.add("active");
  $("btn-synthetic").setAttribute("aria-pressed","true");
  $("upload-label").classList.remove("active");
  $("data-note").textContent="Illustrative simulated assets. No historical market data.";
  calculate();
});
$("upload-csv").addEventListener("change",async(event)=>{
  const file=event.target.files?.[0];if(!file)return;
  try{
    if(file.size>2_000_000)throw Error("CSV must be below 2 MB.");
    data=parseReturnsCSV(await file.text());
    $("data-note").textContent=file.name+": "+data.returns.length+" rows; "+data.assets.length+" assets. Data stays on this device.";
    $("btn-synthetic").classList.remove("active");
    $("btn-synthetic").setAttribute("aria-pressed","false");
    $("upload-label").classList.add("active");
    calculate();
  }catch(error){
    $("data-note").textContent="CSV not accepted: "+(error instanceof Error?error.message:"Invalid CSV");
    event.target.value="";
  }
});
$("download-json").addEventListener("click",()=>{
  if(!lastResult)return;
  const blob=new Blob([JSON.stringify({...lastResult,generatedAt:new Date().toISOString(),syntheticData:data===dataset},null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),anchor=document.createElement("a");
  anchor.href=url;anchor.download="portfolio-risk-browser-decision.json";
  document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$("copy-code").addEventListener("click",async()=>{
  try{
    await navigator.clipboard.writeText($("code-example").textContent);
    $("copy-code").textContent="Copied";
    setTimeout(()=>$("copy-code").textContent="Copy",1250);
  }catch(_){$("copy-code").textContent="Select and copy";}
});
labels();calculate();
