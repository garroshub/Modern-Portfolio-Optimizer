# Portfolio Risk & Rebalancing Lab

**General-purpose portfolio optimization and uncertainty-aware risk budgeting for portfolio-manager decision support.**

[Interactive PM decision workspace](https://garroshub.github.io/portfolio-risk-lab/) · [GitHub source](https://github.com/garroshub/portfolio-risk-lab) · [Issues](https://github.com/garroshub/portfolio-risk-lab/issues) · [MIT license and notices](https://github.com/garroshub/portfolio-risk-lab/blob/main/THIRD_PARTY_NOTICES.md)

Portfolio Risk Lab provides a general-purpose NumPy, pandas and SciPy API and CLI to compare conventional long-only portfolios with scenario-robust risk budgeting.

## Quick start

```bash
pip install portfolio-risk-lab
portfolio-risk-lab demo --output sample.json
```

```python
import pandas as pd
from portfolio_risk_lab import PortfolioAnalyzer, RiskConfig

daily_returns = pd.read_csv(
    "daily_returns.csv", parse_dates=["date"]
).set_index("date")

model = PortfolioAnalyzer(
    daily_returns,
    config=RiskConfig(
        risk_budget=0.12,
        max_weight=0.40,
        cash_asset="Cash_Proxy",
        transaction_cost_bps=10,
    ),
)
result = model.compare(
    methods=["standard", "scenario_robust"],
    uncertainty="historical_calibration",
)
print(result.allocation_comparison)
print(result.risk_budget_analysis)
```

Input values are daily simple decimal returns; `0.01` denotes +1%, not a price level. At least 504 daily rows are required by default.

## Features

- Standard and scenario-robust mean–variance optimization with hard long-only, fully invested position and risk constraints.
- Annualized long-window, short-window and EWMA covariance forecasts.
- Historical risk-error margin using exclusively matured, completed calendar months.
- Asset-weight comparisons, model disagreement, risk contributions, one-time trade-cost estimates, and JSON output.
- Data-source agnostic API/CLI, without broker accounts, order execution or Streamlit.

## Research boundaries

The library is intended for research and decision support, not trading signals or investment advice. Historical reference-portfolio error quantiles do not guarantee future risk-limit coverage. Exploratory backtests did not establish a persistent increase in economic utility over simply tighter conventional risk limits.

The [GitHub Pages decision workspace](https://garroshub.github.io/portfolio-risk-lab/) is a separate browser-only JavaScript approximation using simulated portfolio data. It is not the SciPy solver and does not retrieve live market prices.

The MIT license grants rights to newly authored Portfolio Risk Lab code. Historic third-party files in the GitHub repository are not bundled into the Python distribution and are explicitly excluded from the new-code license grant.
