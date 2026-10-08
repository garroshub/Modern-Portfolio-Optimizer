"""CLI: deterministic demo, private CSV, error reporting."""
import json
import pandas as pd
from portfolio_risk_lab.cli import main
from portfolio_risk_lab.datasets import make_demo_returns

def test_demo_cli(tmp_path):
    p=tmp_path/"test.json"
    assert main(["demo","--output",str(p)])==0
    result=json.loads(p.read_text())
    assert result["input_source"]=="synthetic_demo"
    assert "Scenario Robust" in result["allocation_comparison"]["Equity_US"]

def test_csv_user_data_cli(tmp_path):
    returns=make_demo_returns(1250)
    fp=tmp_path/"rets.csv"
    returns.rename_axis("date").to_csv(fp,index=True)
    weights=tmp_path/"weights.csv"
    pd.DataFrame({"asset":list(returns),"weight":[1/len(returns.columns)]*len(returns.columns)}).to_csv(weights,index=False)
    out=tmp_path/"out.json"
    assert main(["compare","--returns",str(fp),"--weights",str(weights),
                 "--cash-asset","Cash_Proxy","--output",str(out)])==0
    assert json.loads(out.read_text())["input_source"]=="user_csv"

def test_cli_invalid_date(tmp_path):
    fp=tmp_path/"bad.csv"
    fp.write_text("date,A,B\nnot-a-date,.01,.02\n")
    assert main(["compare","--returns",str(fp)])==2

def test_cli_no_date_means_no_calibration(tmp_path):
    fp=tmp_path/"no_dates.csv"
    make_demo_returns(1250).reset_index(drop=True).to_csv(fp,index=False)
    out=tmp_path/"out.json"
    assert main(["compare","--returns",str(fp),"--output",str(out)])==0
    assert json.loads(out.read_text())["decision_report"]["calibration"]["status"]=="insufficient_history"
