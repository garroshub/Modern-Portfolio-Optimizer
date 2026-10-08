<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="Portfolio Risk and Rebalancing Lab — decision support for portfolio allocation under uncertain risk forecasts">
</p>

<p align="center">
  <strong>Compare allocations when risk models disagree — and see what protection costs.</strong>
</p>

<div align="center">

[![Decision Workspace](https://img.shields.io/badge/Launch-Decision_Workspace-168E80?style=for-the-badge&logo=githubpages&logoColor=white)](https://garroshub.github.io/portfolio-risk-lab/)
[![Python API](https://img.shields.io/badge/Explore-Python_API-3776AB?style=for-the-badge&logo=python&logoColor=white)](#python-api)
[![Quick Start](https://img.shields.io/badge/Get-Started-425C74?style=for-the-badge&logo=gnubash&logoColor=white)](#quick-start)

[![Methodology](https://img.shields.io/badge/Read-Methodology-276E77?style=for-the-badge)](#how-it-works)
[![Discussions](https://img.shields.io/badge/Join-Discussions-0B5FFF?style=for-the-badge&logo=github&logoColor=white)](https://github.com/garroshub/portfolio-risk-lab/discussions)
[![License: MIT](https://img.shields.io/badge/License-MIT-E5ECEF?style=for-the-badge)](LICENSE)

</div>

<p align="center">
  <a href="https://garroshub.github.io/portfolio-risk-lab/"><img src="./assets/readme/decision-workspace.webp" width="100%" alt="Real browser workspace with simulated portfolios, four uncertainty-aware modes, asset weight comparison, model disagreement, and risk-versus-return visualization"></a>
</p>

<p align="center"><sub>Real local interface screenshot · Simulated data · Browser-side approximation of the full Python optimizer</sub></p>

## What you can do

**Portfolio Risk & Rebalancing Lab** is a general-purpose Python optimization toolkit and a serverless portfolio manager decision workspace. It shows how competing covariance forecasts and historical risk-prediction errors affect portfolio weights, risk-budget feasibility, and the potential cost of risk protection.

| PM question | Decision output |
| --- | --- |
| Where do risk models disagree? | Long-window, short-window, and EWMA volatility forecasts |
| What changes when uncertainty matters? | Standard versus uncertainty-aware portfolio allocations |
| How conservative is the adjustment? | Historical risk-error margin and effective risk budget |
| What is the cost of protection? | Expected-return difference, turnover, and estimated trading cost |

### Interactive workspace

The [browser workspace](https://garroshub.github.io/portfolio-risk-lab/) puts the controls first. Choose one of three **synthetic** portfolio cases, then compare four experimental modes:

| Mode | Portfolio decision rule |
| --- | --- |
| **Off** | Use the standard long-window covariance |
| **Scenario guard** | Respect three simultaneous covariance scenarios |
| **Calibrated** | Apply a completed-month historical risk-error margin |
| **Stress overlay** | Add a user-controlled extra stress buffer |

Adjust the annual risk budget, maximum asset weight, historical quantile, and trading cost. The browser recalculates weights, covariance disagreement, a risk–return map, and the expected opportunity cost of protecting the portfolio.

> **Pages deployment:** This website needs GitHub Pages enabled with **Settings → Pages → GitHub Actions**. If the hosted URL is not yet active, run the complete static site locally from [`docs/`](./docs/).

## Quick start

The installable Python package requires **Python 3.10+**, NumPy, pandas, and SciPy. PyPI publication is not yet part of this release.

```bash
git clone https://github.com/garroshub/portfolio-risk-lab.git
cd portfolio-risk-lab
python -m pip install -e .

# Reproducible simulated example
portfolio-risk-lab demo --output demo_report.json

# Your own daily returns
portfolio-risk-lab compare \
  --returns daily_returns.csv \
  --cash-asset Cash_Proxy \
  --risk-budget 0.12 \
  --output decision_report.json
```

Inputs are **daily simple decimal returns**, not prices: `0.01` means +1%. The default configuration requires at least 504 daily observations. Historical monthly calibration also requires a unique ascending date index.

## Python API

```python
import pandas as pd
from portfolio_risk_lab import PortfolioAnalyzer, RiskConfig

returns = (
    pd.read_csv("daily_returns.csv", parse_dates=["date"])
    .set_index("date")
)

lab = PortfolioAnalyzer(
    returns=returns,
    current_weights=None,   # or an asset-aligned mapping / Series / array
    config=RiskConfig(
        risk_budget=0.12,
        max_weight=0.40,
        cash_asset="Cash_Proxy",
        transaction_cost_bps=10,
        risk_calibration_quantile=0.85,
    ),
)

result = lab.compare(
    methods=["standard", "scenario_robust"],
    uncertainty="historical_calibration",  # or "none"
)

print(result.allocation_comparison)
print(result.scenario_volatilities)
print(result.risk_budget_analysis)
print(result.risk_contributions)
```

Optional asset-aligned **annualized** `expected_returns=` and `covariance=` values are supported. Custom covariance disables historical error calibration because that supplied forecast has not been validated by the historical procedure.

The optimizer is long-only and fully invested, with per-asset caps and hard volatility constraints. It raises an error if the risk budget is infeasible. A configured `cash_asset` is a **tradable asset** with its own risk, not guaranteed risk-free cash.

## How it works

```text
Daily portfolio returns
    │
    ├─ 504-day covariance ───────────────┐
    ├─ 126-day covariance ───────────────┤──► Scenario risk constraints
    └─ EWMA covariance ──────────────────┘               │
                                                        ▼
Completed-month forecast errors ─► Risk margin ─► Robust allocation
                                                        │
Standard allocation ────────────────────────────────────┤
                                                        ▼
                                     Weights · Risk · Return · Trade cost
```

The uncertainty calibrator compares realized monthly volatility with model forecasts on **predefined reference portfolios**, using only fully completed months. The portfolio manager can inspect how the estimated margin changes the feasible allocation and what it may cost in expected return.

The GitHub Pages demonstration uses a **constraint-checked JavaScript coordinate-search approximation**, distinct from the **SciPy** optimizer in the Python package.

## Research boundaries

Uncertainty-Aware Allocation is **experimental decision support**, not validated alpha or a statistical coverage guarantee.

- Historical risk-constrained allocations sometimes reduced realized monthly volatility-limit violations.
- Simpler conservative limits frequently produced **higher economic utility** in risk-matched tests.
- A nominal historical 85% quantile did **not** reliably yield 85% out-of-sample coverage in the exploratory ETF universes.
- The website uses **simulated portfolios**, does not fetch live prices, and cannot place trades.

Local research outputs and experimental data are excluded from the publishable Python package and this website.

## Testing and local preview

```bash
python -m pytest -q -o addopts= tests_package
node --test tests_site/browser_engine.test.mjs
node --check docs/main.js

# Static GitHub Pages preview
python -m http.server 8765 --directory docs

# Local wheel / sdist
python -m build --no-isolation
```

The source lives in [`portfolio_risk_lab/`](./portfolio_risk_lab/), and the Pages deployment workflow is [`.github/workflows/pages.yml`](./.github/workflows/pages.yml). No browser server or broker account is required to use the Python API.

## License and attribution

**MIT License applies to the newly authored Portfolio Risk & Rebalancing Lab components** and their documentation. See [`LICENSE`](./LICENSE) and [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).

The retained legacy Markowitz files in `src/` and associated original tests/data credit **Marek Ozana (2024)**. Their licensing rights were not established by this update. They are **not relicensed** under the MIT grant for new code. The distributable Python package excludes the legacy implementation.

This tool is intended for research and decision support, not personalized investment advice.
