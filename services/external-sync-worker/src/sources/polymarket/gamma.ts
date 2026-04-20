import { createPolymarketAdapter } from "@bet/integrations";

export const fetchPolymarketGamma = async () => createPolymarketAdapter().listMarkets();
