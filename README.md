# Terminal

An open-source terminal for investment research. The first module compares
your picks against simple benchmarks, all on one chart, in one currency,
from one start date:

- a **fixed annual return** (default 7%, or any rate you set)
- **gold** (COMEX futures)
- **holding a currency** (USD, IDR, …)
- any index, ETF, stock, FX pair or crypto

There is **no database and no account**. Your watchlist lives in your browser
and you keep it as a plain JSON file: export it, store it anywhere, import it
(or drag it onto the page) on any machine.

## Features

- Compare up to 8 series as percent change from a common start date
- Ranges from 1M to MAX; series that start later move everyone's start to
  the first date they all share, so nothing is compared over different periods
- Everything is converted into a base currency you pick (IDR, USD, EUR, …),
  so "S&P 500 in IDR" and "holding USD" are real comparisons
- Total return (dividends and splits included where the source has them),
  CAGR, annualized volatility and max drawdown per series
- Symbol search across exchanges, including IDX (`.JK`)
- Light and dark themes

## Getting started

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000. No API keys are needed.

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Unit tests (analytics, file format) |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |

## The watchlist file

Exported files look like this (see `examples/watchlist.example.json`):

```json
{
  "format": "finance-terminal/watchlist",
  "version": 1,
  "name": "My watchlist",
  "settings": { "baseCurrency": "IDR", "range": "1Y" },
  "watchlist": [
    { "kind": "ticker", "symbol": "BBCA.JK", "name": "Bank Central Asia", "selected": true }
  ],
  "benchmarks": [
    { "kind": "fixed", "rate": 7, "selected": true },
    { "kind": "ticker", "symbol": "GC=F", "name": "Gold", "selected": true },
    { "kind": "cash", "currency": "USD", "selected": true }
  ]
}
```

| Kind | Fields | Meaning |
| --- | --- | --- |
| `ticker` | `symbol`, optional `name` | Any symbol the data provider knows |
| `fixed` | `rate` (percent per year) | A steady line compounding at that rate |
| `cash` | `currency` (ISO code) | Holding that currency, valued in the base currency |

`selected` marks what is plotted. Hand-written files can be much shorter:
`["BBCA.JK", "TLKM.JK"]` is a valid file (benchmarks fall back to the defaults).

## Market data

Prices come from **Yahoo Finance's public chart endpoint**: free, no key, and
broad coverage (IDX stocks as `BBCA.JK`, the IDX Composite as `^JKSE`, FX as
`USDIDR=X`, gold as `GC=F`, crypto as `BTC-USD`). It is unofficial, so it can
change or rate-limit without notice. Responses are cached on the server for
an hour, and every request goes through a small provider interface so the
source can be swapped.

**Why not TradingView data?** TradingView has no public data API, and
scraping its feeds breaks its terms of use, which is a non-starter for an
open-source project. This project does use TradingView's open-source
[Lightweight Charts](https://github.com/tradingview/lightweight-charts)
library (Apache 2.0) for rendering.

Other free sources worth adding as providers:

| Source | Key | Good for | Limits |
| --- | --- | --- | --- |
| [Twelve Data](https://twelvedata.com) | Free key | Stocks, FX, crypto | ~800 requests/day |
| [Alpha Vantage](https://www.alphavantage.co) | Free key | Stocks, FX | 25 requests/day |
| [Financial Modeling Prep](https://site.financialmodelingprep.com) | Free key | Stocks, fundamentals | ~250 requests/day |
| [Tiingo](https://www.tiingo.com) | Free key | US end-of-day prices | US focus |
| [Frankfurter](https://frankfurter.dev) | None | ECB reference FX rates, includes IDR | Daily, major currencies |
| [FRED](https://fred.stlouisfed.org/docs/api/fred/) | Free key | Rates, inflation, macro series | Macro only |
| [CoinGecko](https://www.coingecko.com/en/api) | Free key | Crypto | Rate limited |

Stooq used to be a good keyless option but now puts its downloads behind a
browser check.

### Adding a provider

1. Implement `DataProvider` from `src/lib/providers/types.ts` (`history` and
   `search`), returning dates as `YYYY-MM-DD` in the exchange's timezone.
2. Register it in `src/lib/providers/index.ts`.
3. Select it with the `DATA_PROVIDER` environment variable.

## Project layout

```
src/
  app/api/history, app/api/search   Server routes that proxy and cache the provider
  lib/providers/                    Data sources (Yahoo today)
  lib/analytics/                    Currency conversion, alignment, metrics (pure, tested)
  lib/workspace/                    Watchlist state and the file format
  hooks/                            Data fetching and browser persistence
  components/dashboard/             The comparison dashboard
```

UI work follows `DESIGN.md` (monochrome shadcn/ui chrome, Geist type, color
only inside the data).

## How the numbers are computed

- **Currency:** each price is multiplied by that day's FX rate into the base
  currency (or the most recent earlier rate on FX holidays).
- **Start date:** the later of the range start and the first date every
  plotted series has data.
- **Fixed rate:** grows to exactly `(1 + rate)^years` over the period, spread
  evenly across trading days so it is a smooth line with zero volatility.
- **CAGR** is shown for periods of about a year or longer. **Volatility** is
  the annualized standard deviation of log returns. **Max drawdown** is the
  worst fall from a previous high.

## Disclaimer

For research and education. Not investment advice. Data may be delayed,
incomplete or wrong.

## License

MIT
