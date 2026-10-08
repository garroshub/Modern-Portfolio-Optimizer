"""Portfolio Risk & Rebalancing Lab.

All percentages accepted by the public API are decimal fractions; returns
must be daily *simple returns*, not price levels or percentage-point values.
"""
from .analysis import PortfolioAnalyzer, ComparisonResult
from .config import RiskConfig
from .uncertainty import CalibrationReport, calibrate_risk_margin

__version__ = "0.1.0"
__all__ = ["PortfolioAnalyzer", "ComparisonResult", "RiskConfig",
           "CalibrationReport", "calibrate_risk_margin"]
