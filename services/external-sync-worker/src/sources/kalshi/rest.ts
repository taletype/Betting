import { createKalshiAdapter } from "@bet/integrations";

export const fetchKalshiMarkets = async () => createKalshiAdapter().listMarkets();
