export interface MatchJob {
  marketId: string;
  replayFromSequence?: bigint;
}

export const runMatchJob = async (job: MatchJob): Promise<void> => {
  console.log("TODO: deterministic matching engine", job);
};
