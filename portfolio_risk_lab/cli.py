"""Executable CLI for user-owned daily return CSV inputs and synthetic demos."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
import pandas as pd

from .analysis import PortfolioAnalyzer
from .config import RiskConfig
from .datasets import make_demo_returns


def read_returns_csv(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    if "date" in df.columns:
        dates = pd.to_datetime(df.pop("date"), errors="raise")
        df.index = pd.DatetimeIndex(dates)
    return df


def read_weights_csv(path: str) -> dict[str, float]:
    df = pd.read_csv(path)
    if not {"asset", "weight"}.issubset(df.columns):
        raise ValueError("Weights CSV needs columns asset,weight.")
    if df["asset"].duplicated().any():
        raise ValueError("Duplicate asset names in weights CSV.")
    return dict(zip(df["asset"], df["weight"].astype(float)))


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="portfolio-risk-lab",
                                   description="Portfolio rebalancing and scenario risk diagnostics.")
    subs = root.add_subparsers(dest="command", required=True)
    for cmd in ("compare", "demo"):
        p = subs.add_parser(cmd)
        if cmd == "compare":
            p.add_argument("--returns", required=True, help="CSV of daily decimal returns, optional date column.")
            p.add_argument("--weights", help="CSV with columns asset,weight.")
        else:
            p.add_argument("--seed", type=int, default=20261008)
        p.add_argument("--risk-budget", type=float, default=.12,
                       help="Annual volatility budget as decimal, e.g. 0.12")
        p.add_argument("--max-weight", type=float, default=.4)
        p.add_argument("--cash-asset", type=str, default=None)
        p.add_argument("--cost-bps", type=float, default=10.)
        p.add_argument("--calibration-quantile", type=float, default=.85)
        p.add_argument("--no-calibration", action="store_true")
        p.add_argument("--output", help="Save full JSON decision result to this file.")
    return root


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.command == "demo":
            returns = make_demo_returns(seed=args.seed)
            cash = args.cash_asset or "Cash_Proxy"
            current = None
        else:
            returns = read_returns_csv(args.returns)
            cash = args.cash_asset
            current = read_weights_csv(args.weights) if args.weights else None
        cfg = RiskConfig(
            risk_budget=args.risk_budget,
            max_weight=args.max_weight,
            cash_asset=cash,
            transaction_cost_bps=args.cost_bps,
            risk_calibration_quantile=args.calibration_quantile,
        )
        analyzer = PortfolioAnalyzer(returns=returns, current_weights=current, config=cfg)
        result = analyzer.compare(
            uncertainty="none" if args.no_calibration else "historical_calibration"
        )
        payload = result.to_dict()
        payload["input_source"] = "synthetic_demo" if args.command == "demo" else "user_csv"
        output = json.dumps(payload, indent=2, allow_nan=False)
        if args.output:
            output_path = Path(args.output)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(output + "\n", encoding="utf-8")
            print(f"Saved decision report to {output_path}")
        else:
            print(output)
        return 0
    except (ValueError, TypeError, FileNotFoundError, KeyError) as exc:
        print(f"Input/optimization error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
