"""
Unit test on charts module
"""

import polars as pl
import altair as alt
import src.charts


def test_create_scatter_chart():
    # Mock data to test the function
    g_data = pl.DataFrame(
        {
            "name": ["A", "B"],
            "vols": [0.1, 0.2],
            "rets": [0.1, 0.2],
            "w_opt": [0.5, 0.5],
        }
    )

    # Generate the chart
    chart = src.charts.create_scatter_chart(g_data)

    # Check if the output is an Altair Chart
    assert isinstance(chart, alt.LayerChart)

    # Check the chart title
    assert chart.layer[0].title == "Risk vs Return Profile"

    # Check if x and y encodings are correctly set
    assert "vols" in chart.layer[0].encoding.x.shorthand
    assert "rets" in chart.layer[0].encoding.y.shorthand


def test_create_portf_weights_chart():
    g_data = pl.DataFrame(
        {
            "name": ["A", "B"],
            "vols": [0.1, 0.2],
            "rets": [0.1, 0.2],
            "w_opt": [0.5, 0.5],
        }
    )
    chart = src.charts.create_portf_weights_chart(g_data)
    # Generate the chart
    chart = src.charts.create_scatter_chart(g_data)

    # Check if the output is an Altair Chart
    assert isinstance(chart, alt.LayerChart)

    # Check the chart title
    assert chart.layer[0].title == "Risk vs Return Profile"

    # Check if x and y encodings are correctly set
    assert "vols" in chart.layer[0].encoding.x.shorthand
    assert "rets" in chart.layer[0].encoding.y.shorthand


def test_create_exp_ret_chart():
    p_fig = src.charts.create_prob_of_neg_chart(r_ann=0.05, vol_ann=0.08, n=12)
    assert isinstance(p_fig, alt.Chart)


def test_create_cum_ret_chart():
    r_cum = pl.read_parquet("tests/data/r_cum.parquet")
    fig = src.charts.create_cum_ret_chart(r_cum)
    assert isinstance(fig, alt.LayerChart)
    f_line, f_text = fig.layer
    assert isinstance(f_line, alt.Chart)
    assert f_line.title == "Cumulative Returns"
    assert f_line.mark == "line"
    assert isinstance(f_text, alt.Chart)


def test_create_cumul_ret_with_drawdown_chart():
    df = pl.read_parquet("tests/data/df_r_cum_with_dd.parquet")
    fig = src.charts.create_cumul_ret_with_drawdown_chart(df)
    assert isinstance(fig, alt.LayerChart)
    f_dd, f_ret = fig.layer
    assert isinstance(f_dd, alt.Chart)
    assert f_dd.mark.type == "area"
    assert isinstance(f_ret, alt.Chart)
    assert f_ret.mark == "line"


def test_create_exp_chart():
    df = pl.read_parquet("tests/data/df_chart_exp.parquet")
    fig = src.charts.create_exp_chart(df)
    assert isinstance(fig, alt.HConcatChart)
    f_rtg, f_ticker = fig.hconcat
    assert isinstance(f_rtg, alt.Chart)
    assert f_rtg.mark.type == "bar"
    assert isinstance(f_ticker, alt.Chart)
    assert f_ticker.mark == "bar"
    assert f_ticker.title == "Largest Ticker Exposures (as of 2024-03-27)"
    assert f_ticker.encoding.x.shorthand == "mv_pct:Q"
    assert f_ticker.encoding.y.shorthand == "ticker:N"
