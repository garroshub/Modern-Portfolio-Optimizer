# Third-party materials and licensing scope

The MIT grant in [LICENSE](./LICENSE) covers the newly authored **Portfolio Risk & Rebalancing Lab** software, website, tests, and project documentation.

## Legacy Markowitz implementation

The retained legacy modules under `src/`, including `src/optimization.py` and `src/data_manager.py`, explicitly credit **Marek Ozana (2024)**. The original legacy test and data directories (`tests/` and `data/`) are retained as historical materials.

We have not verified an original license grant authorizing redistribution or relicensing of these legacy items. They are **not included** in the MIT grant for newly authored work. Their original copyright and other rights, where applicable, remain with their respective rightsholders.

The installable `portfolio_risk_lab` package is a separate implementation. Its wheel/sdist manifest excludes the legacy `src/`, `tests/` and `data/` directories.

If you want to reuse or distribute the historical source outside this repository, establish the original licensing permissions first.

Third-party Python dependencies (NumPy, pandas, SciPy, and optional external services) retain their own license terms.
