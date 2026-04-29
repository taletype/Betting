import { getPortfolioSnapshot } from "./repository";

export const getPortfolio = async (userId?: string) => {
  if (!userId) {
    throw new Error("authentication required");
  }

  return getPortfolioSnapshot(userId);
};
