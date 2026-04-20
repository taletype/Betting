import { getPortfolioSnapshot } from "./repository";
import { DEMO_USER_ID } from "../shared/constants";

export const getPortfolio = async (userId?: string) => {
  return getPortfolioSnapshot(userId ?? DEMO_USER_ID);
};
