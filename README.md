# Terminal

An open-source terminal for investment research, in three parts.

**Compare** puts your picks against simple benchmarks, all on one chart, in
one currency, from one start date:

- a **fixed annual return** (default 7%, or any rate you set)
- **gold** (COMEX futures)
- **holding a currency** (USD, IDR, …)
- any index, ETF, stock, FX pair or crypto

**Screener** lists every IDX stock with its valuation, so you can find ideas
by P/BV, ROE, P/E, dividend yield, size and liquidity, then add the ones you
like to the watchlist and compare them.

**Valuation** answers one question about a stock's P/BV or P/E: did it move
because of the price, or because of the book value or earnings under it? It
plots price, the per-share figure and the ratio as percent change from one
start date, or as values in the stock's currency with the ratio underneath,
and splits the move between the two.

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
- A screener over the whole IDX: min/max filters on nine metrics, sectors,
  sortable columns, and presets (below book, cheap & profitable, Graham,
  high yield) as starting points
- A P/BV and a P/E chart per stock (click either ratio in the screener):
  price, book value or earnings per share, and the ratio on one start date,
  with the share of the move that came from each. Earnings can be the
  trailing 12 months, full fiscal years only, or a 1-year or 3-year average
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

The optional `screener` section saves the screener's filters:

```json
"screener": {
  "sectors": ["Financial Services"],
  "filters": { "pbv": { "max": 1 }, "roe": { "min": 0.12 }, "valueTraded": { "min": 1000000000 } },
  "sort": { "key": "pbv", "dir": "asc" }
}
```

Filter keys are `pbv`, `roe`, `pe`, `forwardPe`, `dividendYield`,
`marketCap`, `valueTraded`, `change52w` and `fromHigh`. Percentages are
fractions (`0.12` is 12%) and amounts are in IDR. Keys an older version
doesn't know are ignored.

`selected` marks what is plotted. Any item can also carry `color` (1–8, a
position in the chart palette, used while plotted) and `line` (`solid`,
`dashed` or `dotted`); both are optional and set from the line key next to
each plotted item. Hand-written files can be much shorter:
`["BBCA.JK", "TLKM.JK"]` is a valid file (benchmarks fall back to the defaults).

## Market data

Prices come from **Yahoo Finance's public chart endpoint**: free, no key, and
broad coverage (IDX stocks as `BBCA.JK`, the IDX Composite as `^JKSE`, FX as
`USDIDR=X`, gold as `GC=F`, crypto as `BTC-USD`). It is unofficial, so it can
change or rate-limit without notice. Responses are cached on the server for
an hour, and every request goes through a small provider interface so the
source can be swapped.

The screener uses Yahoo's **screener endpoint**, which needs a session
cookie and a "crumb" token that the server fetches and reuses. It pulls the
IDX one sector at a time (about a dozen requests, cached for an hour) to
know each stock's sector. Yahoo reports book value in the company's
reporting currency but prices in IDR, so its own P/BV is wrong for companies
that report in USD; the screener converts their book value at the latest
USD/IDR rate and computes every ratio itself.

The valuation chart uses Yahoo's **fundamentals endpoint** for balance
sheets: equity and shares outstanding at about four year-ends and the latest
five quarters (a quarter is sometimes missing), cached for a day. Book value
per share is equity over shares, held flat from one balance-sheet date to
the next; share counts arrive restated for splits, so it lines up with
split-adjusted prices. Unlike Compare, this chart uses closes without
dividends, since P/BV is about the price a share trades at. Book value in
another currency is converted at each day's rate.

For P/E the same endpoint gives net income: the year to each of about four
year-ends, and the trailing 12 months to the latest quarter-end and the one
a year before. Earnings per share is that income over the shares outstanding
at the time, the same restated counts book value uses, so it can sit a
little off the diluted EPS a company reports. For the other quarter-ends of
the last three years Yahoo has only EPS and the average share count behind
it. EPS alone is not usable: it is often left on the share count of its day
(ten times too high before a 10-for-1 split) and is sometimes rounded to a
cent or plain wrong. Multiplied by its share count it gives net income
again, and those quarters are used only for companies where that product
matches the reported net income, within 5%, on every date that has both.
Other companies keep the year-ends and the two quarter-ends. The chart
starts after the last 12 months that ended in a loss.

Those trailing figures are the default. The chart can also keep full fiscal
years only, average each figure with the others reported in the year before
it, or average three fiscal years in a row (which leaves about two points of
the four years the source has). P/E is the price over whichever is picked.

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
   `screen` is optional; without it the screener page reports that the
   source has no screener. So are `bookValue` and `earnings`, which the
   valuation chart needs for P/BV and P/E.
2. Register it in `src/lib/providers/index.ts`.
3. Select it with the `DATA_PROVIDER` environment variable.

## Project layout

```
src/
  app/api/history, search, screener Server routes that proxy and cache the provider
  lib/providers/                    Data sources (Yahoo today)
  lib/analytics/                    Currency conversion, alignment, metrics, screener math (pure, tested)
  lib/workspace/                    Watchlist state and the file format
  hooks/                            Data fetching and browser persistence
  components/dashboard/             The comparison dashboard
  components/screener/              The screener
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
- **Screener ratios** come from per-share figures: P/BV is price over book
  value per share, P/E is price over trailing 12-month EPS, and ROE is that
  EPS over book value. A ratio over zero or negative book value or earnings is
  left empty rather than shown negative, so "P/BV ≤ 1" never matches a company
  with negative equity. **Div yield** is Yahoo's expected annual dividend over
  price (the latest payment annualized). **Value/day** is the 3-month average
  volume times price.

## Disclaimer

For research and education. Not investment advice. Data may be delayed,
incomplete or wrong.

## License

MIT
