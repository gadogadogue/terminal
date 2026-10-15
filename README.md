# Terminal

An open-source terminal for investment research, in four parts.

**Compare** puts your picks against simple benchmarks, all on one chart, in
one currency, from one start date:

- a **fixed annual return** (default 7%, or any rate you set)
- **gold** (COMEX futures)
- **holding a currency** (USD, IDR, …)
- any index, ETF, stock, FX pair or crypto

**Screener** lists every IDX stock with its valuation, so you can find ideas
by P/BV, ROE, P/E, dividend yield, size and liquidity, then add the ones you
like to the watchlist and compare them. Its **P/BV fall** screen finds the
stocks whose P/BV just fell through a mark, such as 1× book, and says
whether the price dropping or book value growing pushed it there.

**Valuation** answers one question about a stock's P/BV or P/E: did it move
because of the price, or because of the book value or earnings under it? It
plots price, the per-share figure and the ratio as percent change from one
start date, or as values in the stock's currency with the ratio underneath,
and splits the move between the two.

**Ownership** draws who holds the stocks in your watchlist as a network: each
stock, the companies, individuals, institutions and funds named as its
holders, and a line for every stake. A holder that owns several of your
stocks is one node, so what your stocks have in common shows as the nodes in
the middle. A ring around each stock shows how much of it insiders and
institutions hold. The picture handles like Obsidian's graph view: drag a
node and what it is tied to comes along, drag the background to move the
view, and zoom in to read more names. For IDX stocks it reads the lists of
shareholders above 1% that KSEI publishes each month, once you save them in
a folder: they name the real owners, and from one month to the next they
show which large holders bought and sold. Those lists cover every IDX
company, so the network also draws the other stocks your stocks' holders
own, as smaller grey dots. Click one and it loads with its own holders, and
with what they own in turn, so you can follow ownership across the market.

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
- A P/BV fall screen: stocks whose P/BV was above a mark in the past month,
  3 or 6 months or year and is at or below it now, by at least a given fall
  from the period's high. Each shows when it crossed and how much of the fall
  came from the price and how much from book value, can be filtered by that
  cause, and opens its P/BV chart from the high
- A P/BV and a P/E chart per stock (click either ratio in the screener):
  price, book value or earnings per share, and the ratio on one start date,
  with the share of the move that came from each. Earnings can be the
  trailing 12 months, full fiscal years only, or a 1-year or 3-year average
- A shareholder network over the watchlist: named holders by kind, the ones
  your stocks share, the other IDX stocks they own, and a table of each
  stock's holders with their stake, share count, value and latest change
- Insider activity for IDX stocks: what each holder of 1% and more bought or
  sold between KSEI's monthly lists, and who joined or left them
- Light and dark themes

## Getting started

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000. No API keys are needed.

To see who owns IDX stocks by name, save KSEI's monthly shareholder lists in
`data/ksei/` (see [Shareholder lists](#shareholder-lists) below). Everything
else works without them.

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

The screener section can also hold the P/BV fall screen, all of it optional:

```json
"fall": { "on": true, "period": "3M", "mark": 1, "minFall": 0.1, "cause": "any", "sort": { "key": "crossed", "dir": "desc" } }
```

`period` is `1M`, `3M`, `6M` or `1Y`; `mark` is the P/BV multiple; `minFall`
is the least fall from the period's high as a fraction; `cause` is `any`,
`price`, `book` or `both`. A period, cause or sort key an older version
doesn't know falls back to its default.

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

The P/BV fall screen needs the balance sheets for the whole market at once:
a year of daily closes and every balance sheet of each IDX stock, two
requests per stock, eight stocks at a time. It takes about ten seconds the
first time and is cached for hours. Yahoo has no balance sheets at all for
about a quarter of IDX stocks, so the screen leaves those out and says how
many. Each day's P/BV is the close over the book value of the latest balance
sheet by then. A fall runs from the period's highest P/BV to the last close
and is split between price and book value as on the valuation chart; one of
them is named the cause when it gave at least 80% of the fall, otherwise
both are.

The ownership network uses Yahoo's **company summary endpoint**, with the
same session as the screener, one request per stock, cached for a day. It
gives two totals, the share of a company held by insiders and by
institutions, and three lists of at most ten names each: institutions and
funds from the portfolios they publish (mostly US filings, so mostly global
asset managers), and directors and officers where they report their own
shares. A person's stake is their share count over the shares outstanding.
An institution's stake includes the funds it runs, so the lists overlap and
are not added up, and stakes under 0.1% are left out.

What it does not give is the names behind the insider total: a founder's
holding company, a parent, the state. For most IDX stocks those are the
largest owners, and Yahoo has no insider transactions for them either. The
shareholder lists below fill that in.

### Shareholder lists

Since March 2026 KSEI, Indonesia's securities depository, lists every holder
of more than 1% of each IDX company once a month, and IDX publishes the list
as a PDF: about 7,200 holders in 950 companies, each with its share count,
its percentage, whether it is local or foreign, and what sort of investor it
is. The IDX site turns away requests from servers, so the app cannot fetch
the list. You download it and the app reads it:

1. Open the [IDX announcements](https://www.idx.co.id/id/berita/pengumuman)
   and search for **Pemegang Saham di atas 1% (KSEI)**.
2. Save the month's PDF in `data/ksei/`. Any file name works.
3. Open the Ownership page. It lists the months it found.

The latest list names each IDX stock's holders from 1% up, and Yahoo's
smaller funds are kept below them. It also says what else each of those
holders owns 1% or more of, which is where the network's grey dots come
from. Every earlier month you save adds a row of insider activity per
holder whose share count changed: bought, sold, joined the list or left
it. A holder that joins or leaves usually crossed
1%, but not always: the first lists left some holdings out that later ones
count, so the page says "not listed" and does not guess. A holder whose name
is spelled differently from one month to the next is matched by its words
with "PT" and "Tbk" set aside, and failing that by an identical share count.

The table is read from the text of the PDF by what each line says, since the
page size, type size and column positions have all changed between months.
Each file is parsed once and the result kept in `data/ksei/.cache/`, which
is git-ignored and rebuilt from the PDFs. The PDFs themselves are kept in
git, at about 7 MB a month. KSEI's words for an investor
("Corporate", "Private Bank", "Mutual Funds", more than thirty by now) are
kept as they are and sorted into four kinds for the diagram: companies,
individuals, institutions and funds.

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
   valuation chart needs for P/BV and P/E, and `ownership`, which the
   shareholder network needs. Saved shareholder lists are merged into
   whatever the provider returns for IDX stocks.
2. Register it in `src/lib/providers/index.ts`.
3. Select it with the `DATA_PROVIDER` environment variable.

## Project layout

```
src/
  app/api/history, search, screener Server routes that proxy and cache the provider
  lib/providers/                    Data sources (Yahoo today)
  lib/analytics/                    Currency conversion, alignment, metrics, screener math, P/BV falls, network layout (pure, tested)
  lib/workspace/                    Watchlist state and the file format
  hooks/                            Data fetching and browser persistence
  components/dashboard/             The comparison dashboard
  components/screener/              The screener
  components/valuation/             The valuation chart
  components/ownership/             The shareholder network
data/ksei/                          KSEI shareholder lists you save (PDF)
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
