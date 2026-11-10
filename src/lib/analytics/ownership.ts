import type { Holder, HolderKind, Ownership } from "@/lib/providers/types"

/**
 * Stakes under this share of a company are left out. Lists of insiders
 * reach down to directors with a few thousand shares, who are no one's idea
 * of a major shareholder.
 */
export const MIN_STAKE = 0.001

export interface NetworkOptions {
  /** The kinds of holder to keep. */
  kinds: readonly HolderKind[]
  /** Keep only holders that own two or more of the stocks. */
  sharedOnly: boolean
  /** Add the other stocks the holders own, as far as their source lists them. */
  elsewhere?: boolean
}

/** A company in the network, identified by its symbol. */
export interface StockNode {
  symbol: string
  name: string
  /** Fractions of the company held by all insiders and all institutions, named or not. */
  insiders: number | null
  institutions: number | null
  /**
   * Set for a stock that was not asked for and is here because a holder in
   * the network also owns it. Its own holders are not known: only the ones
   * that led to it are linked.
   */
  outside?: true
}

/** One owner, however many of the stocks it holds. */
export interface HolderNode {
  id: string
  name: string
  kind: HolderKind
  family?: string
  /** Its largest stake in any of the stocks asked for, as a fraction of that company. */
  stake: number
  /** How many of the stocks asked for it holds. */
  stocks: number
}

/** A holder's stake in one stock. */
export interface Stake {
  holder: string
  symbol: string
  holding: Holder
}

export interface OwnershipNetwork {
  /** The stocks asked for, then the ones from outside. */
  stocks: StockNode[]
  /** Holders of the most stocks first, then the largest stakes. */
  holders: HolderNode[]
  stakes: Stake[]
}

/**
 * The same holder appears under each stock it owns, spelled alike, so the
 * name is its identity. A manager and a fund can share a name but not a
 * stake, and symbols never contain a colon.
 */
const holderId = ({ kind, family, name }: Holder) =>
  ["holder", kind, family ?? "", name].map((part) => part.trim().replace(/\s+/g, " ").toLowerCase()).join(":")

/**
 * Links every stock to its named holders; a holder of several stocks is one
 * node that ties them together. With `elsewhere`, each holder is also linked
 * to whatever other stocks it owns.
 */
export function buildNetwork(ownerships: Ownership[], { kinds, sharedOnly, elsewhere }: NetworkOptions): OwnershipNetwork {
  const stocks: StockNode[] = []
  const nodes = new Map<string, HolderNode>()
  const stakes = new Map<string, Stake>()
  for (const { symbol, name, insiders, institutions, holders } of ownerships) {
    if (stocks.some((stock) => stock.symbol === symbol)) continue
    stocks.push({ symbol, name, insiders, institutions })
    for (const holding of holders) {
      if (!kinds.includes(holding.kind) || holding.percent < MIN_STAKE) continue
      const id = holderId(holding)
      // A holder listed twice for one stock keeps its larger stake.
      const key = `${id}\n${symbol}`
      const listed = stakes.get(key)
      if (listed && listed.holding.percent >= holding.percent) continue
      stakes.set(key, { holder: id, symbol, holding })
      if (!nodes.has(id)) {
        const { name, kind, family } = holding
        nodes.set(id, { id, name, kind, ...(family && { family }), stake: 0, stocks: 0 })
      }
    }
  }
  for (const { holder, holding } of stakes.values()) {
    const node = nodes.get(holder)!
    node.stocks += 1
    node.stake = Math.max(node.stake, holding.percent)
  }

  const kept = new Set([...nodes.values()].flatMap((node) => (!sharedOnly || node.stocks > 1 ? [node.id] : [])))
  const asked = [...stakes.values()].filter((stake) => kept.has(stake.holder))

  const outside = new Map<string, StockNode>()
  const further = new Map<string, Stake>()
  for (const { holder, holding } of elsewhere ? asked : []) {
    for (const other of holding.elsewhere ?? []) {
      const key = `${holder}\n${other.symbol}`
      if (other.percent < MIN_STAKE || further.has(key) || stocks.some((stock) => stock.symbol === other.symbol)) continue
      if (!outside.has(other.symbol)) {
        outside.set(other.symbol, { symbol: other.symbol, name: other.name, insiders: null, institutions: null, outside: true })
      }
      // The same holder, with what is known of this stake: its size, and neither its value nor how it moved.
      const { name, kind, family, type, foreign, reported } = holding
      const stake = { percent: other.percent, shares: other.shares, value: null, change: null, reported }
      further.set(key, {
        holder,
        symbol: other.symbol,
        holding: { name, kind, ...(family && { family }), ...(type && { type }), ...(foreign != null && { foreign }), ...stake },
      })
    }
  }

  const holders = [...nodes.values()]
    .filter((node) => kept.has(node.id))
    .sort((a, b) => b.stocks - a.stocks || b.stake - a.stake || a.id.localeCompare(b.id))
  return { stocks: [...stocks, ...outside.values()], holders, stakes: [...asked, ...further.values()] }
}

/** A stock's holder in the network, with the other stocks that holder owns. */
export interface HolderRow {
  holder: HolderNode
  holding: Holder
  /** Symbols of the other stocks in the network it holds, in the network's order. */
  alsoHolds: string[]
}

/** The network's holders of one stock, largest stake first: the table behind its links. */
export function holdersOf(network: OwnershipNetwork, symbol: string): HolderRow[] {
  const nodes = new Map(network.holders.map((node) => [node.id, node]))
  const order = new Map(network.stocks.map((stock, i) => [stock.symbol, i]))
  return network.stakes
    .filter((stake) => stake.symbol === symbol)
    .map(({ holder, holding }) => ({
      holder: nodes.get(holder)!,
      holding,
      alsoHolds: network.stakes
        .filter((other) => other.holder === holder && other.symbol !== symbol)
        .map((other) => other.symbol)
        .sort((a, b) => order.get(a)! - order.get(b)!),
    }))
    .sort((a, b) => b.holding.percent - a.holding.percent)
}

/**
 * Who holds a company, as three shares that add up to one. Insiders and
 * institutions come from the provider's totals; the rest is everyone it
 * doesn't count as either, mostly the public. Totals from different filing
 * dates can pass 100%, so institutions give way to keep the whole at one.
 */
export interface Split {
  insiders: number
  institutions: number
  others: number
}

export function ownershipSplit(stock: Pick<StockNode, "insiders" | "institutions">): Split | null {
  if (stock.insiders == null && stock.institutions == null) return null
  const insiders = Math.min(Math.max(stock.insiders ?? 0, 0), 1)
  const institutions = Math.min(Math.max(stock.institutions ?? 0, 0), 1 - insiders)
  return { insiders, institutions, others: Math.max(1 - insiders - institutions, 0) }
}
