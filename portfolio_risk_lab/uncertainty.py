"""Retrospective scenario uncertainty diagnostics; not formal coverage guarantees."""
from __future__ import annotations

from dataclasses import dataclass
import numpy as np
import pandas as pd

from .config import RiskConfig
from .risk import forecast_covariances, portfolio_volatility


@dataclass(frozen=True)
class CalibrationReport:
    multiplier: float
    effective_risk_limit: float
    target_quantile: float
    observed_months: int
    observations_used: int
    empirical_coverage: float | None
    clipped: bool
    status: str
    """empirical_coverage is descriptive in-sample historical anchor coverage."""

    def to_dict(self) -> dict:
        return {
            "multiplier": self.multiplier,
            "effective_risk_limit": self.effective_risk_limit,
            "target_quantile": self.target_quantile,
            "observed_months": self.observed_months,
            "observations_used": self.observations_used,
            "empirical_anchor_coverage": self.empirical_coverage,
            "clipped": self.clipped,
            "status": self.status,
            "coverage_guarantee": False,
        }


def reference_weights(n: int, upper_bounds: np.ndarray) -> list[np.ndarray]:
    """Fixed ex-ante reference directions for prospective monthly vol errors."""
    eq = np.full(n, 1 / n)
    anchors = [eq]
    if n < 2:
        return anchors
    for k in range(min(n, 7)):
        w = np.full(n, (1. - upper_bounds[k]) / (n - 1))
        w[k] = upper_bounds[k]
        if np.all(w <= upper_bounds + 1e-10):
            anchors.append(w)
    return anchors


def month_ahead_error_ratios(
    returns: pd.DataFrame, config: RiskConfig, upper_bounds: np.ndarray
) -> list[float]:
    """Compute only fully matured calendar-month vol underforecasting ratios.

    A month is considered complete only when a subsequent month is already
    observed. This excludes the most recent partial calendar month.
    """
    if not isinstance(returns.index, pd.DatetimeIndex):
        return []
    values = returns.to_numpy(float)
    dates = returns.index
    starts = [i for i in range(1, len(dates))
              if (dates[i].year, dates[i].month) !=
              (dates[i - 1].year, dates[i - 1].month)]
    ratios = []
    anchors = reference_weights(len(returns.columns), upper_bounds)
    for idx, origin in enumerate(starts[:-1]):
        nxt = starts[idx + 1]
        if origin < config.long_window or nxt - origin < 15:
            continue
        models = forecast_covariances(values[:origin], config)
        realized_month = values[origin:nxt]
        worst_ratio = 0.
        for w in anchors:
            expected = max(portfolio_volatility(w, cov) for cov in models.values())
            realized = float(np.std(realized_month @ w, ddof=1)
                             * np.sqrt(config.trading_days))
            if expected > 1e-10:
                worst_ratio = max(worst_ratio, realized / expected)
        ratios.append(float(worst_ratio))
    return ratios


def calibrate_risk_margin(
    returns: pd.DataFrame, config: RiskConfig, upper_bounds: np.ndarray
) -> CalibrationReport:
    """Historical inflation for a scenario risk budget, computed without look-ahead.

    This is empirical ratio calibration of fixed reference directions. It is
    NOT conformal conditional coverage nor a probability bound on positions
    chosen by the allocator. 'Quantile' is user-controlled and clipped.
    """
    ratios = month_ahead_error_ratios(returns, config, upper_bounds)
    sample = ratios[-config.calibration_window_months:]
    count = len(sample)
    if count < config.calibration_min_months:
        return CalibrationReport(
            multiplier=1.,
            effective_risk_limit=config.risk_budget,
            target_quantile=config.risk_calibration_quantile,
            observed_months=len(ratios),
            observations_used=count,
            empirical_coverage=None,
            clipped=False,
            status="insufficient_history",
        )
    unbounded = max(1., float(np.quantile(sample, config.risk_calibration_quantile)))
    multiplier = min(config.max_risk_multiplier, unbounded)
    coverage = float(np.mean(np.asarray(sample) <= multiplier))
    return CalibrationReport(
        multiplier=multiplier,
        effective_risk_limit=config.risk_budget / multiplier,
        target_quantile=config.risk_calibration_quantile,
        observed_months=len(ratios),
        observations_used=count,
        empirical_coverage=coverage,
        clipped=unbounded > config.max_risk_multiplier,
        status="historical_estimate",
    )
