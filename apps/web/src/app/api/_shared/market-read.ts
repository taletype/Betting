import { createSupabaseAdminClient } from "@bet/supabase";
import {
  type MarketRow,
  type OutcomeRow,
  serializeMarketSnapshot,
  serializeOrderBookResponse,
  serializeTradesResponse,
} from "./market-serializers";

const MARKET_SELECT =
  "id, slug, title, description, status, collateral_currency, min_price, max_price, tick_size, close_time, resolve_time, created_at";
const OUTCOME_SELECT = "id, market_id, slug, title, outcome_index, created_at";
type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

const listMarketRows = async (supabase: SupabaseClient): Promise<MarketRow[]> => {
  const { data, error } = await supabase
    .from("markets")
    .select(MARKET_SELECT)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as MarketRow[];
};

const listOutcomeRowsByMarketIds = async (supabase: SupabaseClient, marketIds: string[]): Promise<OutcomeRow[]> => {
  if (marketIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("outcomes")
    .select(OUTCOME_SELECT)
    .in("market_id", marketIds)
    .order("market_id", { ascending: true })
    .order("outcome_index", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as OutcomeRow[];
};

const listOutcomeRowsByMarketId = async (supabase: SupabaseClient, marketId: string): Promise<OutcomeRow[]> => {
  const { data, error } = await supabase
    .from("outcomes")
    .select(OUTCOME_SELECT)
    .eq("market_id", marketId)
    .order("outcome_index", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as OutcomeRow[];
};

export const readMarkets = async (supabase: SupabaseClient) => {
  const marketRows = await listMarketRows(supabase);
  const outcomeRows = await listOutcomeRowsByMarketIds(
    supabase,
    marketRows.map((market) => market.id),
  );

  const outcomesByMarketId = new Map<string, OutcomeRow[]>();
  for (const row of outcomeRows) {
    const existing = outcomesByMarketId.get(row.market_id) ?? [];
    existing.push(row);
    outcomesByMarketId.set(row.market_id, existing);
  }

  return marketRows.map((marketRow) => serializeMarketSnapshot(marketRow, outcomesByMarketId.get(marketRow.id) ?? []));
};

export const readMarketById = async (supabase: SupabaseClient, marketId: string) => {
  const { data, error } = await supabase.from("markets").select(MARKET_SELECT).eq("id", marketId).maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const outcomes = await listOutcomeRowsByMarketId(supabase, marketId);
  return serializeMarketSnapshot(data as MarketRow, outcomes);
};

export const readMarketOrderBook = async (supabase: SupabaseClient, marketId: string) => {
  const { data, error } = await supabase.rpc("rpc_get_market_orderbook", {
    p_market_id: marketId,
  });

  if (error) {
    throw error;
  }

  return serializeOrderBookResponse(marketId, data);
};

export const readMarketTrades = async (supabase: SupabaseClient, marketId: string) => {
  const { data, error } = await supabase.rpc("rpc_get_recent_market_trades", {
    p_market_id: marketId,
  });

  if (error) {
    throw error;
  }

  return serializeTradesResponse(marketId, data);
};
