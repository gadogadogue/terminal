import type { DataProvider } from "./types"
import { yahooProvider } from "./yahoo"

export * from "./types"
export { SYMBOL_PATTERN } from "@/lib/instruments"
export { REGISTER_FOLDER, currentRegisterVersion, loadRegisters, shareholders } from "./register"
export { marketHistory } from "./market-history"

const providers: Record<string, DataProvider> = {
  [yahooProvider.id]: yahooProvider,
}

/**
 * The active provider. Self-hosters can switch with the DATA_PROVIDER env var
 * once more providers are registered above.
 */
export function getProvider(): DataProvider {
  return providers[process.env.DATA_PROVIDER ?? "yahoo"] ?? yahooProvider
}
