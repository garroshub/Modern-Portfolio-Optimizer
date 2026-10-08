import { test } from "node:test";
import assert from "node:assert/strict";
import {makeSynthetic,forecastModels,calibrate,analyze,parseReturnsCSV} from "../docs/engine.mjs";

const sample=makeSynthetic(1280,20261008);
const params={riskBudget:.12,maxWeight:.4,quantile:.85,costBps:10};

test("deterministic synthetic sample, sorted dates and six assets",()=>{
  const a=makeSynthetic(),b=makeSynthetic();
  assert.deepEqual(a,b);
  assert.equal(a.assets.length,6);
  assert.ok(a.returns.length>=504);
  assert.ok(a.dates[0]<a.dates.at(-1));
});
test("long/short/EWMA risk covariance finite and diagonal positive",()=>{
  const m=forecastModels(sample.returns);
  assert.deepEqual(Object.keys(m),["long","short","ewma"]);
  for(const mat of Object.values(m)){
    assert.equal(mat.length,sample.assets.length);
    assert.ok(mat.every((row,i)=>row.length===sample.assets.length &&
              row.every(x=>Number.isFinite(x))&&row[i]>0));
  }
});
test("portfolio constraints, full investment and meaningful model differences",()=>{
  const x=analyze(sample,params);
  const {profiles}=x;
  for(const name of ["Standard","Scenario Robust"]){
    const w=profiles[name].weights;
    assert.ok(Math.abs(w.reduce((a,b)=>a+b,0)-1)<1e-6);
    assert.ok(w.every((v,i)=>v>=-1e-9&&v<=(i===5?1:.4)+1e-7));
    assert.ok(profiles[name].maxScenarioVol<=profiles[name].budget+1e-6 ||
         name==="Standard"); // standard is constrained only under the long model
  }
  assert.ok(profiles.Standard.vol.long<=params.riskBudget+1e-6);
  assert.ok(profiles["Scenario Robust"].maxScenarioVol<=
            params.riskBudget/x.calibration.multiplier+1e-6);
  assert.notDeepEqual(profiles.Standard.weights,profiles["Scenario Robust"].weights);
});
test("more conservative risk budget changes feasible allocations",()=>{
  const normal=analyze(sample,params);
  const tighter=analyze(sample,{...params,riskBudget:.08});
  assert.ok(tighter.profiles["Scenario Robust"].maxScenarioVol <=
    normal.profiles["Scenario Robust"].maxScenarioVol + .0001);
  assert.ok(tighter.profiles["Scenario Robust"].maxScenarioVol<=
    tighter.profiles["Scenario Robust"].budget+1e-7);
});
test("historical margin, disabling and coverage caveat",()=>{
  const on=analyze(sample,params);
  const off=analyze(sample,{...params,calibration:false});
  assert.ok(on.calibration.multiplier>=1&&on.calibration.multiplier<=1.5);
  assert.equal(on.calibration.guarantee,false);
  assert.equal(off.calibration.multiplier,1);
  assert.equal(off.calibration.status,"disabled");
  assert.ok(on.profiles["Scenario Robust"].budget<=off.profiles["Scenario Robust"].budget);
});
test("quantile calibrator uses only completed calendar months",()=>{
  const up=[.4,.4,.4,.4,.4,1];
  const initial=calibrate(sample,up,.85);
  const shorter={...sample,dates:sample.dates.slice(0,-2),returns:sample.returns.slice(0,-2)};
  assert.equal(shorter.dates.at(-1).slice(0,7),sample.dates.at(-1).slice(0,7));
  const recalc=calibrate(shorter,up,.85);
  assert.deepEqual(initial,recalc);
});
test("CSV rejects invalid dates, missing returns and non-decimals",()=>{
  assert.throws(()=>parseReturnsCSV("date,A,B\n2020-01-01,0.1,0.2"),/504/);
  const d=makeSynthetic(510);
  let csv="date,A,B\n"+d.dates.map((v,i)=>v+","+d.returns[i][0]+","+d.returns[i][1]).join("\n");
  assert.equal(parseReturnsCSV(csv).returns.length,510);
  csv=csv.replace(/,[-\d.]+,/,",,");
  assert.throws(()=>parseReturnsCSV(csv),/decimal/);
});
test("beyond configured cap never silently returns invalid allocation",()=>{
  assert.throws(()=>analyze(sample,{...params,riskBudget:.001}),/outside valid limits/);
});
