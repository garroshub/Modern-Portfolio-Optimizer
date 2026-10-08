"""Configuration and explicit safety/input constraints for portfolio optimization."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RiskConfig:
    risk_budget: float = 0.12
    max_weight: float = 0.40
    risk_aversion: float = 4.0
    turnover_penalty: float = 0.01
    transaction_cost_bps: float = 10.0
    trading_days: int = 252
    long_window: int = 504
    short_window: int = 126
    return_window: int = 252
    ewma_half_life: float = 42.0
    covariance_diagonal_shrink: float = 0.10
    risk_calibration_quantile: float = 0.85
    calibration_min_months: int = 18
    calibration_window_months: int = 36
    max_risk_multiplier: float = 1.5
    cash_asset: str | None = None

    def __post_init__(self) -> None:
        if not 0 < self.risk_budget < 5:
            raise ValueError("risk_budget must be a positive annualized decimal.")
        if not 0 < self.max_weight <= 1:
            raise ValueError("max_weight must be in (0, 1].")
        if self.risk_aversion < 0 or self.turnover_penalty < 0 or self.transaction_cost_bps < 0:
            raise ValueError("risk_aversion, turnover_penalty, transaction_cost_bps must be >= 0.")
        if self.trading_days < 20 or self.short_window < 20 or self.return_window < 20:
            raise ValueError("Sample/trading-day windows are too short.")
        if self.long_window < self.short_window or self.long_window < self.return_window:
            raise ValueError("long_window must cover short_window and return_window.")
        if self.ewma_half_life <= 0 or not 0 <= self.covariance_diagonal_shrink <= 1:
            raise ValueError("Invalid EWMA half-life or covariance shrinkage.")
        if not 0 < self.risk_calibration_quantile < 1:
            raise ValueError("risk_calibration_quantile must be in (0, 1).")
        if self.calibration_min_months < 1 or self.calibration_window_months < self.calibration_min_months:
            raise ValueError("calibration_window_months must be >= calibration_min_months >= 1.")
        if self.max_risk_multiplier < 1:
            raise ValueError("max_risk_multiplier must be at least 1.")
