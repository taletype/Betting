import { getPortfolioSnapshot } from "./repository";
import { DEMO_USER_ID } from "../shared/constants";

export const getPortfolio = async () => {
  return getPortfolioSnapshot(DEMO_USER_ID);
};
