"""Transparent annualized covariance estimators and constrained optimizer."""
from __future__ import annotations

import numpy as np
from scipy.optimize import minimize

from .config import RiskConfig


def _psd(cov: np.ndarray) -> np.ndarray:
    cov = (cov + cov.T) / 2
    evals, eigenvec = np.linalg.eigh(cov)
    return (eigenvec * np.maximum(evals, 1e-12)) @ eigenvec.T


def _cov(x: np.ndarray, config: RiskConfig) -> np.ndarray:
    covariance = np.cov(x, rowvar=False) * config.trading_days
    if np.ndim(covariance) == 0:
        covariance = np.array([[float(covariance)]])
    diag = np.diag(np.diag(covariance))
    return _psd((1 - config.covariance_diagonal_shrink) * covariance
                + config.covariance_diagonal_shrink * diag)


def forecast_covariances(values: np.ndarray, config: RiskConfig) -> dict[str, np.ndarray]:
    """Annual covariance forecasts from strictly historical daily returns."""
    if len(values) < config.long_window:
        raise ValueError(f"At least {config.long_window} daily observations are required.")
    long_cov = _cov(values[-config.long_window:], config)
    short_cov = _cov(values[-config.short_window:], config)
    x = values[-config.short_window:]
    ages = np.arange(len(x) - 1, -1, -1)
    weights = np.exp(-np.log(2) * ages / config.ewma_half_life)
    weights /= weights.sum()
    centered = x - (weights @ x)
    denom = max(1e-10, 1.0 - np.sum(weights**2))
    ew = (centered * weights[:, None]).T @ centered / denom * config.trading_days
    ewma = _psd((1 - config.covariance_diagonal_shrink) * ew
                + config.covariance_diagonal_shrink * np.diag(np.diag(ew)))
    return {"long": long_cov, "short": short_cov, "ewma": ewma}


def portfolio_volatility(weights: np.ndarray, covariance: np.ndarray) -> float:
    return float(np.sqrt(max(0., weights @ covariance @ weights)))


def risk_contributions(weights: np.ndarray, covariance: np.ndarray) -> np.ndarray:
    """Annualized volatility contributions, summing to total volatility."""
    sigma = portfolio_volatility(weights, covariance)
    if sigma <= 1e-12:
        return np.zeros_like(weights)
    return weights * (covariance @ weights) / sigma


def optimize_allocation(
    mu: np.ndarray,
    objective_cov: np.ndarray,
    risk_covariances: list[np.ndarray],
    current: np.ndarray,
    risk_limit: float,
    upper_bounds: np.ndarray,
    config: RiskConfig,
) -> np.ndarray:
    """Long-only, sum-to-one mean/variance objective with multiple hard risk caps.

    Does not return an infeasible SLSQP iterate; infeasible budgets raise.
    Transaction costs are reported separately; the objective uses an ex-ante
    smooth turnover penalty for allocation stability.
    """
    n = len(mu)
    if risk_limit <= 0:
        raise ValueError("risk_limit must be strictly positive.")
    if sum(upper_bounds) < 1 - 1e-10:
        raise ValueError("Infeasible single-asset max_weight bounds for full investment.")
    if not risk_covariances:
        raise ValueError("At least one covariance risk scenario is required.")
    if not (np.isfinite(mu).all() and np.isfinite(objective_cov).all()
            and all(np.isfinite(x).all() for x in risk_covariances)):
        raise ValueError("Non-finite forecast inputs.")
    def objective(w: np.ndarray) -> float:
        turnover = np.sqrt((w - current) ** 2 + 1e-8).sum()
        return float(-mu @ w + config.risk_aversion / 2 * (w @ objective_cov @ w)
                     + config.turnover_penalty * turnover)

    constraints: list[dict] = [{"type": "eq", "fun": lambda w: float(w.sum() - 1)}]
    for covariance in risk_covariances:
        constraints.append({
            "type": "ineq",
            "fun": lambda w, c=covariance: float(risk_limit**2 - w @ c @ w),
        })
    bounds = [(0., float(x)) for x in upper_bounds]
    x0 = current.copy()
    # If current portfolio is invalid under new per-asset bounds, use feasible
    # upper-cap-normalized fallback. Candidate solutions must still pass checks.
    if np.any(x0 > upper_bounds + 1e-9):
        x0 = upper_bounds / upper_bounds.sum()
    candidates = [x0, upper_bounds / upper_bounds.sum()]
    if config.cash_asset is not None:
        cash_indices = np.where(upper_bounds >= 1 - 1e-10)[0]
        for idx in cash_indices:
            w = np.zeros(n)
            w[idx] = 1.
            candidates.insert(0, w)
    for start in candidates:
        result = minimize(objective, start, method="SLSQP", bounds=bounds,
                          constraints=constraints,
                          options={"ftol": 1e-10, "maxiter": 500})
        if not result.success:
            continue
        w = np.clip(result.x, 0, upper_bounds)
        if abs(w.sum() - 1) > 2e-5:
            continue
        if any(portfolio_volatility(w, c) > risk_limit + 1e-6
               for c in risk_covariances):
            continue
        return w
    raise ValueError(
        "No feasible optimal allocation under the risk budget and weight bounds. "
        "Try a higher risk_budget, a liquid low-risk asset, or more flexible caps."
    )
