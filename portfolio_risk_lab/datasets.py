"""Deterministic synthetic demonstration data. Never label this market data."""
from __future__ import annotations

import numpy as np
import pandas as pd


DEMO_ASSETS = ["Equity_US", "Equity_Global", "Bonds", "Gold", "Credit", "Cash_Proxy"]


def make_demo_returns(n_days: int = 1300, seed: int = 20261008) -> pd.DataFrame:
    """Simulated daily returns with regime changes; not actual traded ETF data."""
    if n_days < 100 or n_days > 20000:
        raise ValueError("n_days must be between 100 and 20,000.")
    rng = np.random.default_rng(seed)
    exposures = np.array([
        [0.85, 0.32, 0.05], [0.70, 0.60, 0.09], [-0.25, 0.02, 0.75],
        [0.04, 0.40, -0.30], [0.37, 0.12, 0.42], [0.005, 0.00, 0.025],
    ])
    factor = rng.normal(0, 0.010, size=(n_days, 3))
    idiosyncratic = rng.normal(0, 0.0020, size=(n_days, len(DEMO_ASSETS)))
    regimes = np.ones(n_days)
    regimes[int(n_days * .45):int(n_days * .56)] = 2.4
    regimes[int(n_days * .78):int(n_days * .88)] = 1.6
    means = np.array([.07, .06, .035, .045, .047, .025]) / 252
    values = means + (factor @ exposures.T + idiosyncratic) * regimes[:, None]
    dates = pd.bdate_range(end=pd.Timestamp.today().normalize(), periods=n_days)
    return pd.DataFrame(values, index=dates, columns=DEMO_ASSETS)
