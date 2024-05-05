[![Streamlit App](https://static.streamlit.io/badges/streamlit_badge_black_white.svg)](https://markowitz.streamlit.app)

# Modern Portfolio Optimization Streamlit app
This Streamlit app calculates an optimal investment portfolio based on a user-defined minimum required return and selection of funds. The app uses historical returns since 2023 to calculate correlations and volatilities, then employs Markowitz portfolio optimization to calculate and display the optimal portfolio composition.  

The app provides visual insights through charts that showcase the risk-return profile, asset weights, historical performance, and projected expected returns and probabilities of negative returns for several horizons.  

Users can change underlying assumptions about expected returns, volatilities, and correlations between different funds in the "Data" tab.

## Features

- **User Input for Minimum Return**: Users can specify their desired minimum return.
- **Fund Selection**: Users can select from a pre-defined list of funds to include in the optimization process.
- **Visualization**: The app provides a risk-return scatter chart for all components and for the optimal portfolio. It shows portfolio composition, historical returns and projected expected return including probabilities of negative return for each time horizon.
- **Results**: The app displays the optimal allocation among the selected funds to achieve the desired return with minimum risk.

## How to run
[https://markowitz.streamlit.app/](https://markowitz.streamlit.app/)

