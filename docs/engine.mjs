/**
 * Browser-only reference optimizer for the static GitHub Pages demonstration.
 * This is NOT the SciPy/SLSQP Python engine. It uses feasible coordinate
 * searches, checks every risk bound, and labels its results illustrative.
 * No broker connections, requests, cookies, tracking, or third-party scripts.
 */
export const DEFAULT_ASSETS = [
  "US Equity", "Global Equity", "Treasuries", "Gold", "Credit", "Cash Proxy"
];

const TRADING_DAYS = 252;
const nsum = a => a.reduce((s,x) => s+x, 0);
const clamp = (x,lo,hi) => Math.min(hi,Math.max(lo,x));
const dot = (a,b) => a.reduce((s,x,i) => s+x*b[i],0);
const zeros = n => Array.from({length:n},() => Array(n).fill(0));

function random(seed=20261008) {
  let s = seed>>>0;
  return () => ((s = (1664525*s+1013904223)>>>0) / 4294967296);
}
function normal(rand) {
  const u = Math.max(1e-12,rand());
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rand());
}
export function makeSynthetic(days=1280,seed=20261008) {
  const rand=random(seed), rows=[], dates=[];
  const exposures=[
    [.95,.27,.08],[.71,.62,.10],[-.20,.01,.68],
    [.09,.36,-.28],[.42,.09,.37],[.004,.001,.025]
  ];
  const means=[.082,.067,.033,.045,.054,.023].map(x=>x/252);
  const end=new Date("2026-10-07T00:00:00Z");
  let current=new Date(end);
  while(dates.length<days) {
    if(current.getUTCDay()!==0 && current.getUTCDay()!==6){
      dates.push(current.toISOString().slice(0,10));
    }
    current.setUTCDate(current.getUTCDate()-1);
  }
  dates.reverse();
  for(let i=0;i<days;i++){
    const factors=[normal(rand)*.009,normal(rand)*.007,normal(rand)*.004];
    const regime=i>510&&i<655?2.25:(i>930&&i<1030?1.55:1);
    rows.push(exposures.map((load,k) => means[k]+
      (dot(load,factors)+normal(rand)*.0018)*regime));
  }
  return {assets:[...DEFAULT_ASSETS],dates,returns:rows,
          source:"Synthetic illustration, not historical market data"};
}

/** Three repeatable and explicitly simulated PM case studies. */
export function makePreset(preset="balanced") {
  if (!["balanced","equity_shock","rates_shock"].includes(preset))
    throw Error("Unknown synthetic portfolio case.");
  const base=makeSynthetic(1280,20261008);
  if(preset==="balanced")return {...base,caseLabel:"Diversified portfolio"};
  const returns=base.returns.map((row,i)=>{
    const x=[...row];
    if(preset==="equity_shock" && i>=1020 && i<1135){
      x[0]=x[0]*1.65-.0014;
      x[1]=x[1]*1.5-.0011;
      x[4]=x[4]*1.3-.0006;
    }
    if(preset==="rates_shock" && i>=1010 && i<1140){
      x[2]=x[2]*1.8-.001;
      x[4]=x[4]*1.65-.0008;
      x[5]=x[5]*1.25;
    }
    return x;
  });
  return {...base,returns,caseLabel:preset==="equity_shock"?
    "Equity stress scenario":"Rates stress scenario"};
}

export function parseReturnsCSV(text) {
  if(typeof text!=="string"||text.length>2_000_000) throw Error("CSV must be below 2 MB.");
  const lines=text.trim().split(/\r?\n/);
  if(lines.length<505) throw Error("At least 504 daily return observations are required.");
  if(lines.length>6001) throw Error("Browser demo supports a maximum of 6,000 daily observations.");
  const headers=lines[0].split(",").map(s=>s.trim());
  if(headers[0].toLowerCase()!=="date"||headers.length<3||headers.length>14)
    throw Error("Expected date followed by 2–12 asset columns.");
  const assets=headers.slice(1);
  if(new Set(assets).size!==assets.length||assets.some(x=>!x||x.length>48))
    throw Error("Asset names must be unique and at most 48 characters.");
  const dates=[],returns=[];
  let prev="";
  for(let i=1;i<lines.length;i++){
    if(!lines[i].trim())continue;
    const parts=lines[i].split(",");
    if(parts.length!==headers.length) throw Error("Wrong column count on row "+(i+1));
    const day=parts[0].trim();
    if(!/^\d{4}-\d\d-\d\d$/.test(day)||!Number.isFinite(Date.parse(day+"T00:00:00Z"))||
       day<=prev) throw Error("Dates must be unique, valid, ISO-formatted and ascending (row "+(i+1)+").");
    const ret=parts.slice(1).map(x=>Number(x.trim()));
    if(parts.slice(1).some(x=>x.trim()==="")||ret.some(x=>!Number.isFinite(x)||x<=-1||Math.abs(x)>1))
      throw Error("Values must be finite daily decimal returns (row "+(i+1)+").");
    prev=day;dates.push(day);returns.push(ret);
  }
  if(returns.length<504)throw Error("At least 504 daily return observations required.");
  return {dates,assets,returns,source:"User-provided local CSV. Processed only in this browser."};
}

function covariance(rows,annualize=true) {
  const n=rows[0].length, count=rows.length, mu=Array(n).fill(0), matrix=zeros(n);
  for(const r of rows)for(let i=0;i<n;i++)mu[i]+=r[i]/count;
  for(const row of rows)for(let i=0;i<n;i++)for(let j=0;j<n;j++)
    matrix[i][j]+=(row[i]-mu[i])*(row[j]-mu[j])/(count-1);
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){
    matrix[i][j] *= annualize?TRADING_DAYS:1;
    if(i!==j)matrix[i][j]*=.90;
  }
  return matrix;
}
function ewmaCov(rows,halflife=42) {
  const n=rows[0].length, count=rows.length,mu=Array(n).fill(0),weights=[];
  for(let k=0;k<count;k++)weights.push(Math.exp(-Math.log(2)*(count-1-k)/halflife));
  const z=nsum(weights);for(let k=0;k<count;k++)weights[k]/=z;
  for(let k=0;k<count;k++)for(let i=0;i<n;i++)mu[i]+=rows[k][i]*weights[k];
  const denom=1-weights.reduce((s,w)=>s+w*w,0);
  const m=zeros(n);
  for(let k=0;k<count;k++)for(let i=0;i<n;i++)for(let j=0;j<n;j++)
    m[i][j] += weights[k]*(rows[k][i]-mu[i])*(rows[k][j]-mu[j])/denom*TRADING_DAYS;
  for(let i=0;i<n;i++)for(let j=0;j<n;j++)if(i!==j)m[i][j]*=.90;
  return m;
}
export function forecastModels(rows) {
  if(rows.length<504)throw Error("At least 504 daily observations required.");
  return {
    long:covariance(rows.slice(-504)),
    short:covariance(rows.slice(-126)),
    ewma:ewmaCov(rows.slice(-126))
  };
}
function matv(w,mat) {
  return w.reduce((s,wi,i)=>s+wi*mat[i].reduce((t,v,j)=>t+v*w[j],0),0);
}
function volatility(w,mat) {return Math.sqrt(Math.max(0,matv(w,mat)));}
function avgMatrix(a,b) {return a.map((r,i)=>r.map((v,j)=>(v+b[i][j])/2));}
function modelsVol(w,models) {
  return Object.fromEntries(Object.entries(models).map(([k,mat])=>[k,volatility(w,mat)]));
}
function quantile(vals,q) {
  const a=[...vals].sort((x,y)=>x-y);const v=(a.length-1)*q;const lo=Math.floor(v),hi=Math.ceil(v);
  return a[lo]+(a[hi]-a[lo])*(v-lo);
}
function referenceWeights(n,upper) {
  const anchors=[Array(n).fill(1/n)];
  for(let k=0;k<Math.min(n,7);k++){
    const w=Array(n).fill((1-upper[k])/(n-1));w[k]=upper[k];
    if(w.every((x,i)=>x<=upper[i]+1e-8))anchors.push(w);
  }
  return anchors;
}
export function calibrate(data,upper,q=.85) {
  if(data.dates.length!==data.returns.length)throw Error("Misaligned dates and returns.");
  const starts=[];
  for(let i=1;i<data.dates.length;i++)if(data.dates[i].slice(0,7)!==data.dates[i-1].slice(0,7))
    starts.push(i);
  const ratios=[],weights=referenceWeights(data.assets.length,upper);
  for(let k=0;k<starts.length-1;k++){
    const start=starts[k],end=starts[k+1];
    if(start<504||end-start<15)continue;
    const mats=forecastModels(data.returns.slice(0,start));
    let ratio=0;
    for(const w of weights){
      const expected=Math.max(...Object.values(mats).map(m=>volatility(w,m)));
      const series=data.returns.slice(start,end).map(row=>dot(w,row));
      const average=nsum(series)/series.length;
      const variance=series.reduce((s,x)=>s+(x-average)**2,0)/(series.length-1);
      if(expected>1e-9)ratio=Math.max(ratio,Math.sqrt(variance*252)/expected);
    }
    ratios.push(ratio);
  }
  const latest=ratios.slice(-36);
  if(latest.length<18)return {
    status:"insufficient_history",multiplier:1,empiricalCoverage:null,
    months:latest.length,quantile:q,clipped:false,guarantee:false
  };
  const raw=Math.max(1,quantile(latest,q));
  const multiplier=Math.min(1.5,raw);
  return {status:"historical_estimate",multiplier,
          empiricalCoverage:latest.filter(x=>x<=multiplier).length/latest.length,
          months:latest.length,quantile:q,clipped:raw>1.5,guarantee:false};
}
function objective(w,mu,C,current,penalty=.01) {
  return dot(w,mu)-2*matv(w,C)-
    penalty*nsum(w.map((v,i)=>Math.sqrt((v-current[i])**2+1e-8)));
}
function optimize(mu,C,scenarios,current,upper,riskBudget,cashIndex) {
  const n=mu.length,canUseCash=cashIndex>=0&&upper[cashIndex]>=1;
  const feasible=w=>scenarios.every(S=>volatility(w,S)<=riskBudget+1e-8);
  let w;
  if(canUseCash){w=Array(n).fill(0);w[cashIndex]=1;}
  else {w=upper.map(x=>x/nsum(upper));}
  const minRisk = w=>Math.max(...scenarios.map(S=>matv(w,S)));
  const iterate=(mode,sweeps)=>{
    for(let pass=0;pass<sweeps;pass++){
      let total=0;
      for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
        const lo=Math.max(-w[i],w[j]-upper[j]);
        const hi=Math.min(upper[i]-w[i],w[j]);
        if(hi-lo<1e-10)continue;
        const score=d=>{
          const next=[...w];next[i]+=d;next[j]-=d;
          if(mode==="minrisk")return -minRisk(next);
          return feasible(next)?objective(next,mu,C,current):-Infinity;
        };
        // Exact feasibility checks; seek best of grid and refined local optimum.
        let bestDelta=0,bestScore=score(0);
        for(let k=0;k<=28;k++){
          const delta=lo+(hi-lo)*k/28;
          const value=score(delta);
          if(value>bestScore+1e-12){bestScore=value;bestDelta=delta;}
        }
        // Local grid refinement without violating caps or risk limits.
        let radius=(hi-lo)/28;
        for(let z=0;z<3;z++){
          for(const delta of [bestDelta-radius/2,bestDelta+radius/2]){
            if(delta<lo||delta>hi)continue;
            const val=score(delta);
            if(val>bestScore+1e-12){bestScore=val;bestDelta=delta;}
          }
          radius/=2;
        }
        w[i]+=bestDelta;w[j]-=bestDelta;total+=Math.abs(bestDelta);
      }
      if(total<1e-6)break;
    }
  };
  if(!feasible(w))iterate("minrisk",20);
  if(!feasible(w))throw Error("The browser solver could not find a feasible risk-budget portfolio. Try a larger budget or a low-risk asset.");
  iterate("objective",30);
  if(!feasible(w)||Math.abs(nsum(w)-1)>1e-5||w.some((x,i)=>x< -1e-8||x>upper[i]+1e-7))
    throw Error("Feasibility check failed; browser result was rejected.");
  return w;
}
function analyzePosition(w,mu,models,current,costBps,budget){
  const vol=modelsVol(w,models);
  const turn=nsum(w.map((v,i)=>Math.abs(v-current[i])))/2;
  const max=Math.max(...Object.values(vol));
  return {weights:w,vol,expectedReturn:dot(w,mu),maxScenarioVol:max,
    budget,oneWayTurnover:turn,costFraction:turn*2*costBps/10000,
    expectedReturnAfterOneTimeCost:dot(w,mu)-turn*2*costBps/10000
  };
}
export function analyze(data,options={}) {
  const {assets,returns}=data;
  if(assets.length<2||assets.length>12||returns.length<504)
    throw Error("Browser demo requires 2–12 assets and at least 504 daily returns.");
  const riskBudget=Number(options.riskBudget??.12);
  const maxWeight=Number(options.maxWeight??.4);
  const costBps=Number(options.costBps??10);
  const q=Number(options.quantile??.85);
  const mode=options.uncertaintyMode??(options.calibration===false?"scenarios":"calibrated");
  const stressMultiplier=Number(options.stressMultiplier??1.20);
  if(!["off","scenarios","calibrated","stress"].includes(mode))
    throw Error("Unknown uncertainty-aware allocation mode.");
  if(!(stressMultiplier>=1&&stressMultiplier<=1.6))
    throw Error("Stress multiplier must be between 1.0 and 1.6.");
  if(!(riskBudget>=.03&&riskBudget<=.5&&maxWeight>=.2&&maxWeight<=1&&
       costBps>=0&&costBps<=1000&&q>=.5&&q<=.95))
    throw Error("One or more requested risk parameters are outside valid limits.");
  const cashIndex=options.cashAsset===null?-1:
    (assets.findIndex(a=>/cash|shy/i.test(a)) );
  const upper=assets.map((_,i)=>i===cashIndex?1:maxWeight);
  if(nsum(upper)<1-1e-9)throw Error("Position caps do not sum to a fully invested portfolio.");
  const current=options.currentWeights? [...options.currentWeights] :
    (assets.length===6&&data.source.startsWith("Synthetic")?
      [.28,.19,.14,.12,.17,.10]:Array(assets.length).fill(1/assets.length));
  if(current.length!==assets.length||current.some(x=>x<0||!Number.isFinite(x))||
     Math.abs(nsum(current)-1)>1e-6)throw Error("Invalid current portfolio weights.");
  const mu=Array(assets.length).fill(0);
  for(const row of returns.slice(-252))for(let i=0;i<assets.length;i++)mu[i]+=row[i];
  for(let i=0;i<mu.length;i++)mu[i]=clamp(mu[i]*252/252,-.6,.7); // annualization: 252 observations
  const models=forecastModels(returns);
  const report=calibrate(data,upper,q);
  const historical=(mode==="calibrated"||mode==="stress");
  const margin=mode==="stress"?report.multiplier*stressMultiplier:
    (historical?report.multiplier:1);
  const usedCalibration=historical?{
    ...report,multiplier:margin,
    baseHistoricalMultiplier:report.multiplier,
    stressOverlay:mode==="stress"?stressMultiplier:1,
    status:mode==="stress"?"illustrative_stress_overlay":report.status
  }:{...report,multiplier:1,status:(mode==="off"||options.calibration===false)?"disabled":"scenario_only",
       baseHistoricalMultiplier:report.multiplier,stressOverlay:1};
  const standard=optimize(mu,models.long,[models.long],current,upper,riskBudget,cashIndex);
  const robust=mode==="off"? [...standard] :
    optimize(mu,avgMatrix(models.long,models.short),
             Object.values(models),current,upper,riskBudget/margin,cashIndex);
  const profiles={
    Current:analyzePosition(current,mu,models,current,costBps,riskBudget),
    Standard:analyzePosition(standard,mu,models,current,costBps,riskBudget),
    "Scenario Robust":analyzePosition(robust,mu,models,current,costBps,riskBudget/margin),
  };
  return {
    assets,source:data.source,model:"Browser-only feasible coordinate-search approximation",
    fidelity:"This is illustrative browser optimization, not the SciPy Python solver.",
    options:{riskBudget,maxWeight,costBps,quantile:q,
      uncertaintyMode:mode,calibration:historical,stressMultiplier},
    calibration:usedCalibration,profiles,modelNames:["long","short","ewma"],
    warnings:[
      "All prices and returns in the built-in sample are simulated; no live market data.",
      "Browser results are approximate, with every risk constraint checked after optimization.",
      "Historical reference-direction calibration does not guarantee future coverage.",
      "Scenario-robust allocation can sacrifice expected return to reduce model risk.",
      ...(mode==="stress"?["The stress overlay is a user-selected sensitivity, not a calibrated probability or backtested risk model."]:[])
    ]
  };
}
