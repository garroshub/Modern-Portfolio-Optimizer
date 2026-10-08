"""Public high-level Python API: portfolio allocation and PM decision diagnostics."""
from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Mapping
import numpy as np
import pandas as pd

from .config import RiskConfig
from .risk import (
    _psd, forecast_covariances, optimize_allocation, portfolio_volatility,
    risk_contributions,
)
from .uncertainty import CalibrationReport, calibrate_risk_margin


def _clean_returns(returns: pd.DataFrame, config: RiskConfig) -> pd.DataFrame:
    if not isinstance(returns, pd.DataFrame):
        raise TypeError("returns must be a pandas DataFrame of DAILY DECIMAL simple returns.")
    if not 1 <= returns.shape[1] <= 200:
        raise ValueError("Expected 1 to 200 asset columns.")
    if len(returns) < config.long_window:
        raise ValueError(f"Need at least {config.long_window} daily return rows.")
    if returns.columns.has_duplicates or not all(isinstance(c, str) and c.strip()
                                                 for c in returns.columns):
        raise ValueError("Asset names must be unique nonempty strings.")
    if isinstance(returns.index, pd.DatetimeIndex):
        if returns.index.has_duplicates or not returns.index.is_monotonic_increasing:
            raise ValueError("DatetimeIndex must be unique and ascending.")
    try:
        df = returns.astype(float).copy()
    except (ValueError, TypeError) as e:
        raise ValueError("Returns must contain numeric daily decimals, not prices.") from e
    arr = df.to_numpy()
    if not np.isfinite(arr).all():
        raise ValueError("Missing/infinite observations. Clean data before analysis.")
    if np.min(arr) <= -1 or np.max(np.abs(arr)) > 1:
        raise ValueError("Returns must be DAILY DECIMAL simple returns, e.g. 0.01 for +1%.")
    return df


def _aligned_vector(arg: object, names: list[str], label: str) -> np.ndarray:
    if isinstance(arg, (pd.Series, Mapping)):
        series = pd.Series(arg)
        if set(series.index) != set(names) or len(series) != len(names):
            raise ValueError(f"{label} asset names do not match returns columns.")
        array = series.loc[names].to_numpy(dtype=float)
    else:
        array = np.asarray(arg, dtype=float)
    if array.shape != (len(names),) or not np.isfinite(array).all():
        raise ValueError(f"{label} must contain {len(names)} finite values.")
    return array


def _aligned_matrix(arg: object, names: list[str]) -> np.ndarray:
    if isinstance(arg, pd.DataFrame):
        if set(arg.columns) != set(names) or set(arg.index) != set(names):
            raise ValueError("Custom covariance labels must match returns columns.")
        cov = arg.loc[names, names].to_numpy(dtype=float)
    else:
        cov = np.asarray(arg, dtype=float)
    n = len(names)
    if cov.shape != (n, n) or not np.isfinite(cov).all():
        raise ValueError(f"Custom covariance must be a finite {n}x{n} matrix.")
    if not np.allclose(cov, cov.T, rtol=1e-6, atol=1e-8):
        raise ValueError("Custom covariance must be symmetric.")
    if np.linalg.eigvalsh(cov).min() < -1e-8:
        raise ValueError("Custom covariance is not positive semidefinite.")
    return _psd(cov)


@dataclass
class ComparisonResult:
    allocation_comparison: pd.DataFrame
    risk_budget_analysis: pd.DataFrame
    scenario_volatilities: pd.DataFrame
    risk_contributions: pd.DataFrame
    decision_report: dict

    def to_dict(self) -> dict:
        def rows(df: pd.DataFrame) -> dict:
            return {str(index): {str(col): float(val) for col, val in row.items()}
                    for index, row in df.iterrows()}
        return {
            "allocation_comparison": rows(self.allocation_comparison),
            "risk_budget_analysis": rows(self.risk_budget_analysis),
            "scenario_volatilities": rows(self.scenario_volatilities),
            "risk_contributions": rows(self.risk_contributions),
            "decision_report": self.decision_report,
        }


class PortfolioAnalyzer:
    """Generic, self-contained portfolio optimization and risk decision API.

    All input returns are DAILY, SIMPLE DECIMAL returns. Annualized expected
    returns and covariance can be supplied as explicit optional overrides.
    The engine never downloads data, touches credentials, or executes trades.
    """

    def __init__(
        self,
        returns: pd.DataFrame,
        current_weights: Mapping[str, float] | pd.Series | np.ndarray | None = None,
        config: RiskConfig | None = None,
        expected_returns: Mapping[str, float] | pd.Series | np.ndarray | None = None,
        covariance: pd.DataFrame | np.ndarray | None = None,
        **config_overrides,
    ):
        self.config = replace(config or RiskConfig(), **config_overrides)
        self.returns = _clean_returns(returns, self.config)
        self.assets = list(self.returns.columns)
        self.upper_bounds = np.full(len(self.assets), self.config.max_weight)
        if self.config.cash_asset is not None:
            if self.config.cash_asset not in self.assets:
                raise ValueError("cash_asset must be a column of returns.")
            self.upper_bounds[self.assets.index(self.config.cash_asset)] = 1.
        if self.upper_bounds.sum() < 1 - 1e-10:
            raise ValueError("Asset weight caps cannot sum to a fully invested portfolio.")
        if current_weights is None:
            self.current = np.full(len(self.assets), 1 / len(self.assets))
        else:
            self.current = _aligned_vector(current_weights, self.assets, "current_weights")
        if (self.current < -1e-10).any() or abs(self.current.sum() - 1) > 1e-5:
            raise ValueError("current_weights must be nonnegative and sum to 1.")
        self.current = self.current.copy()
        if expected_returns is not None:
            self.custom_mu = _aligned_vector(expected_returns, self.assets, "expected_returns")
        else:
            self.custom_mu = None
        self.custom_cov = _aligned_matrix(covariance, self.assets) if covariance is not None else None

    def compare(
        self,
        methods: tuple[str, ...] | list[str] = ("standard", "scenario_robust"),
        uncertainty: str = "historical_calibration",
    ) -> ComparisonResult:
        allowed = {"standard", "scenario_robust"}
        if not methods or not set(methods).issubset(allowed) or len(set(methods)) != len(methods):
            raise ValueError("methods may contain each of 'standard', 'scenario_robust' once.")
        if uncertainty not in {"historical_calibration", "none"}:
            raise ValueError("uncertainty must be 'historical_calibration' or 'none'.")
        config = self.config
        x = self.returns.to_numpy()
        mu = (x[-config.return_window:].mean(axis=0) * config.trading_days
              if self.custom_mu is None else self.custom_mu)
        scenarios = forecast_covariances(x, config)
        if self.custom_cov is not None:
            scenarios["long"] = self.custom_cov
        objective = scenarios["long"] if "standard" in methods and len(methods) == 1 else (
            (scenarios["long"] + scenarios["short"]) / 2
        )
        report: CalibrationReport | None = None
        if "scenario_robust" in methods and uncertainty == "historical_calibration":
            report = calibrate_risk_margin(self.returns, config, self.upper_bounds)
        if report is None:
            report = CalibrationReport(
                multiplier=1., effective_risk_limit=config.risk_budget,
                target_quantile=config.risk_calibration_quantile,
                observed_months=0, observations_used=0, empirical_coverage=None,
                clipped=False, status="disabled",
            )
        # A custom annual covariance is honored by the standard and robust
        # long-horizon risk constraint; historical calibration still uses the
        # historical input returns and therefore cannot calibrate custom cov.
        calibration_valid = self.custom_cov is None
        if self.custom_cov is not None and uncertainty == "historical_calibration":
            report = CalibrationReport(
                multiplier=1., effective_risk_limit=config.risk_budget,
                target_quantile=config.risk_calibration_quantile,
                observed_months=0, observations_used=0, empirical_coverage=None,
                clipped=False, status="disabled_for_custom_covariance",
            )
        weights: dict[str, np.ndarray] = {"Current": self.current}
        if "standard" in methods:
            weights["Standard"] = optimize_allocation(
                mu, scenarios["long"], [scenarios["long"]], self.current,
                config.risk_budget, self.upper_bounds, config
            )
        if "scenario_robust" in methods:
            weights["Scenario Robust"] = optimize_allocation(
                mu, (scenarios["long"] + scenarios["short"]) / 2,
                list(scenarios.values()), self.current,
                report.effective_risk_limit, self.upper_bounds, config
            )
        allocation = pd.DataFrame(weights, index=self.assets)
        scenario_df = pd.DataFrame(
            {name: {scenario: portfolio_volatility(w, C)
                    for scenario, C in scenarios.items()}
             for name, w in weights.items()}
        )
        summary: dict[str, dict[str, float]] = {}
        contributions: dict[str, np.ndarray] = {}
        for name, w in weights.items():
            volatilities = {k: portfolio_volatility(w, C) for k, C in scenarios.items()}
            worst_scenario = max(volatilities, key=volatilities.get)
            changes = abs(w - self.current)
            one_way_turnover = float(changes.sum() / 2)
            cost = config.transaction_cost_bps / 10000 * float(changes.sum())
            summary[name] = {
                "annual_expected_return": float(mu @ w),
                "annual_model_volatility": volatilities["long"],
                "annual_worst_scenario_volatility": max(volatilities.values()),
                "annual_risk_budget": config.risk_budget,
                "effective_risk_limit": report.effective_risk_limit if name == "Scenario Robust" else config.risk_budget,
                "one_way_turnover": one_way_turnover,
                "one_time_transaction_cost_fraction": cost,
                "expected_return_less_one_time_trade_cost": float(mu @ w - cost),
            }
            contributions[name] = risk_contributions(w, scenarios[worst_scenario])
        risk_summary = pd.DataFrame(summary).T
        risk_parts = pd.DataFrame(contributions, index=self.assets)
        risks = scenario_df.max(axis=0)
        warnings = [
            "Model expected returns, risk levels and transaction costs are estimates, not realized performance.",
            "Historical error quantiles describe reference portfolio directions, not a formal confidence or future violation guarantee.",
            "SHY or any cash_asset remains a risky tradable asset with observed returns, not a risk-free instrument.",
        ]
        if report.status == "insufficient_history":
            warnings.append("Insufficient completed calendar months for historical error calibration; no margin applied.")
        if report.clipped:
            warnings.append("Risk calibration multiplier was clipped; target historical coverage may be missed.")
        if report.status == "disabled_for_custom_covariance":
            warnings.append("Custom covariance cannot be historically calibrated using the supplied unmodified return estimates; margin disabled.")
        if not isinstance(self.returns.index, pd.DatetimeIndex):
            warnings.append("Historical calibration requires an ascending DatetimeIndex; margin disabled.")
        decision_report = {
            "asset_count": len(self.assets),
            "input_daily_observations": len(self.returns),
            "method": list(methods),
            "risk_budget": config.risk_budget,
            "calibration": report.to_dict(),
            "largest_risk_model_disagreement": float(risks.max() - risks.min()) if len(risks) else 0.,
            "scenario_names": list(scenarios),
            "asset_names": self.assets,
            "data_type": "daily_simple_returns",
            "value_type": "model_estimates_not_recommendations",
            "warnings": warnings,
        }
        return ComparisonResult(
            allocation_comparison=allocation,
            risk_budget_analysis=risk_summary,
            scenario_volatilities=scenario_df,
            risk_contributions=risk_parts,
            decision_report=decision_report,
        )
