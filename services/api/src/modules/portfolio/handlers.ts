import { getPortfolioSnapshot } from "./repository";
import { DEMO_USER_ID } from "../shared/constants";

export const getPortfolio = async () => {
  const portfolio = await getPortfolioSnapshot(DEMO_USER_ID);

  return {
    balances: portfolio.balances,
    openOrders: portfolio.openOrders,
    positions: [],
    claims: [],
  };
};
