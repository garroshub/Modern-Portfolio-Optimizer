# Portfolio Risk & Rebalancing Lab

**Uncertainty-aware portfolio optimization, risk budgeting, and PM decision support.**

The project provides a general-purpose Python package (NumPy, pandas, SciPy) and a pure static GitHub Pages website with a browser-only interactive portfolio demonstration. No Python application server, cloud API, accounts, brokers, or external JavaScript libraries are required.

**Website (after GitHub Pages deployment):** https://garroshub.github.io/Modern-Portfolio-Optimizer/

**Source:** https://github.com/garroshub/Modern-Portfolio-Optimizer

## Quick start — Python

Requires Python 3.10+:

```shell
python -m pip install -e .
portfolio-risk-lab demo --output demo_report.json
portfolio-risk-lab compare --returns daily_returns.csv --cash-asset Cash_Proxy --risk-budget 0.12 --output decision_report.json
```

Your CSV must contain **daily simple decimal returns**, not prices. A return of +1% is entered as 0.01; the default input history is at least 504 rows. For historical month-ahead risk calibration, use a unique ascending ISO date column.

```csv
date,Asset_A,Asset_B,Asset_C,Cash_Proxy
2024-01-02,0.004,-0.002,0.001,0.0001
2024-01-03,-0.003,0.001,0.002,0.0001
```

The rows above demonstrate the file format; a real analysis needs a sufficiently long daily series.

## Python API

```python
import pandas as pd
from portfolio_risk_lab import PortfolioAnalyzer, RiskConfig

returns = pd.read_csv("daily_returns.csv", parse_dates=["date"]).set_index("date")
model = PortfolioAnalyzer(
    returns=returns,
    current_weights=None,         # or mapping/Series/array aligned by asset
    config=RiskConfig(
        risk_budget=0.12,         # annualized decimal volatility
        max_weight=0.40,
        cash_asset="Cash_Proxy",  # optional real tradable asset, not risk-free
        transaction_cost_bps=10,
        risk_calibration_quantile=0.85,
    ),
)
report = model.compare(
    methods=["standard", "scenario_robust"],
    uncertainty="historical_calibration",  # or "none"
)
print(report.allocation_comparison)
print(report.risk_budget_analysis)
print(report.scenario_volatilities)
print(report.risk_contributions)
print(report.decision_report)
```

You can also supply asset-aligned **annualized** `expected_returns=` and `covariance=` values. An externally supplied covariance automatically disables historical error calibration because those covariance assumptions have not themselves been backtested. Model constraints are long-only, fully invested, with per-asset caps and optional 100% allocation to an explicitly named lower-risk *tradable* asset. Infeasible risk budgets raise errors.

## What the uncertainty feature provides

- **Model disagreement:** trailing 504-day covariance, trailing 126-day covariance, and 42-day half-life EWMA covariance.
- **Historical underforecast diagnostics:** a multiplier derived from completed months' realized/reference volatility ratios. A configurable quantile clips the multiplier to [1, 1.5] by default.
- **Scenario-robust optimization:** simultaneously respect each predicted risk covariance scenario.
- **Decision explanation:** portfolio changes, asset risk contributions, risk-budget utilization, one-way turnover, and illustrative expected-return opportunity cost.

**Evidence boundary:** Historical experiments showed that conservative risk margins can reduce monthly realized risk-limit breaches; they did **not** show consistently better economic utility than simpler risk-matched constraints. An empirical quantile on historical reference portfolios is *not* a formal confidence bound or a guarantee on the optimized portfolio. Results are decision support, not financial advice or automatically executable trades.

## GitHub Pages website

The static site is in `docs/` and can run directly in a web browser or from any static file server. Deployment is configured at `.github/workflows/pages.yml`.

It includes an interactive **illustrative browser optimizer** with synthetic asset returns, optional local CSV upload, sliders for risk budget, maximum position size, calibration quantile and transaction cost, and downloadable local JSON diagnostics. User CSV data are processed **in the browser only** and not sent to any server.

The site uses a feasible coordinate-search approximation implemented in JavaScript, with a final hard-risk constraint check. It is separate from the Python package's SciPy/SLSQP solver. Its generated synthetic sample is not historical ETF market data, and its outputs should not be expected to numerically match the full Python solver.

To preview locally:

```shell
python -m http.server 8765 --directory docs
```

Visit http://127.0.0.1:8765/. To publish on GitHub Pages, push `docs/` and `.github/workflows/pages.yml` to the repository's `main` branch and enable **GitHub Actions** as the Pages source in Settings → Pages. Page availability should be verified separately after deployment.

## Testing and building

```shell
python -m pytest -q -o addopts= tests_package
node --test tests_site/browser_engine.test.mjs
node --check docs/main.js
python -m build --no-isolation
```

Distribution packages include only the newly authored `portfolio_risk_lab` Python modules, excluding historical project data, local experiments and unused legacy scripts.

## Historical research and attribution

`experiments/` contains prior exploratory Uncertainty-Aware portfolio experiments. See `experiments/NESTED_SCENARIO_ROBUST_REVIEW_ZH.md` for historical calibration and risk-matched comparisons, including negative utility results.

The original Markowitz optimization and data-management code under `src/` was authored by **Marek Ozana (2024)** and remains credited in the source. Original data files have been retained locally for provenance and are excluded from new package distributions.

The package has not been published to PyPI. Before public release, review licensing rights, package name availability and public artifacts.
