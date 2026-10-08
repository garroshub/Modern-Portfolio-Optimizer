"""Public package regressions, input checks, risk invariants and calibration."""
import json
import numpy as np
import pandas as pd
import pytest
from portfolio_risk_lab import PortfolioAnalyzer, RiskConfig, calibrate_risk_margin
from portfolio_risk_lab.datasets import make_demo_returns
from portfolio_risk_lab.risk import forecast_covariances, optimize_allocation
from portfolio_risk_lab.uncertainty import month_ahead_error_ratios

@pytest.fixture(scope="module")
def sample():
    return make_demo_returns(1250,seed=7)

@pytest.fixture(scope="module")
def result(sample):
    return PortfolioAnalyzer(sample,cash_asset="Cash_Proxy").compare()

def test_portfolio_weights_and_risk_caps(result):
    a=result.allocation_comparison
    assert list(a)==["Current","Standard","Scenario Robust"]
    assert all(abs(a[k].sum()-1)<1e-5 for k in a)
    assert a.min().min()>-1e-9
    for name in ["Standard","Scenario Robust"]:
        assert a.loc[a.index!="Cash_Proxy",name].max()<=.40001
    assert result.risk_budget_analysis.loc["Standard","annual_model_volatility"]<=.12001
    assert result.risk_budget_analysis.loc["Scenario Robust","annual_worst_scenario_volatility"]<=result.decision_report["calibration"]["effective_risk_limit"]+1e-5

def test_json_and_risk_contributions(result):
    assert json.loads(json.dumps(result.to_dict(),allow_nan=False))
    for name in result.risk_contributions:
        assert abs(result.risk_contributions[name].sum()-
                   result.scenario_volatilities[name].max())<1e-4

def test_external_inputs(sample):
    w={c:1/len(sample.columns) for c in sample}
    expected={c:.05 for c in sample}
    model=PortfolioAnalyzer(sample,current_weights=w,expected_returns=expected,
                            config=RiskConfig(cash_asset="Cash_Proxy",risk_budget=.15))
    assert np.allclose(model.compare(methods=["standard"]).allocation_comparison.Current,1/len(sample.columns))

def test_custom_covariance_disables_empirical_calibration(sample):
    cols=list(sample)
    cov=pd.DataFrame(np.eye(len(cols))*.003,index=cols,columns=cols)
    result=PortfolioAnalyzer(sample,cash_asset="Cash_Proxy",risk_budget=.20,covariance=cov).compare()
    assert result.decision_report["calibration"]["status"]=="disabled_for_custom_covariance"

def test_completed_months_only(sample):
    cfg=RiskConfig(cash_asset="Cash_Proxy")
    w=np.array([.4,.4,.4,.4,.4,1.])
    a=sample.iloc[:-5]
    b=sample.iloc[:-1]
    assert (a.index[-1].year,a.index[-1].month)==(b.index[-1].year,b.index[-1].month)
    assert month_ahead_error_ratios(a,cfg,w)==month_ahead_error_ratios(b,cfg,w)

def test_covariance_positive_semidefinite(sample):
    matrices=forecast_covariances(sample.to_numpy(),RiskConfig())
    assert set(matrices)=={"long","short","ewma"}
    assert all(np.linalg.eigvalsh(s).min()>-1e-9 for s in matrices.values())

@pytest.mark.parametrize("method",["standard","scenario_robust"])
def test_single_model(sample,method):
    a=PortfolioAnalyzer(sample,cash_asset="Cash_Proxy").compare(methods=[method],uncertainty="none")
    assert len(a.allocation_comparison.columns)==2

def test_no_calibration(sample):
    a=PortfolioAnalyzer(sample,cash_asset="Cash_Proxy").compare(uncertainty="none")
    assert a.decision_report["calibration"]["status"]=="disabled"

def test_invalid_input_checks(sample):
    with pytest.raises(ValueError,match="DAILY DECIMAL"):
        PortfolioAnalyzer(sample*100,cash_asset="Cash_Proxy")
    with pytest.raises(ValueError,match="sum to 1"):
        PortfolioAnalyzer(sample,cash_asset="Cash_Proxy",current_weights={x:.1 for x in sample})
    with pytest.raises(ValueError,match="caps"):
        PortfolioAnalyzer(sample[["Bonds","Gold"]],max_weight=.4)
    with pytest.raises(ValueError,match="asset names"):
        PortfolioAnalyzer(sample,expected_returns={"unknown":.1})

def test_infeasible_risk_budget_rejected():
    cfg=RiskConfig(risk_budget=.0001)
    with pytest.raises(ValueError,match="No feasible"):
        optimize_allocation(np.array([.01,.02,.03]),np.eye(3)*.1,[np.eye(3)*.1],
                            np.ones(3)/3,.0001,np.array([.4,.4,.4]),cfg)

def test_calibration_contract(sample):
    cfg=RiskConfig(cash_asset="Cash_Proxy")
    report=calibrate_risk_margin(sample,cfg,np.array([.4,.4,.4,.4,.4,1.]))
    assert 1<=report.multiplier<=cfg.max_risk_multiplier
    assert report.effective_risk_limit<=cfg.risk_budget
    assert report.to_dict()["coverage_guarantee"] is False
