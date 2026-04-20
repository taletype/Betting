import { createPolymarketAdapter } from "@bet/integrations";

export const fetchPolymarketClob = async () => createPolymarketAdapter().listMarkets();
