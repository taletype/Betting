import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@bet/supabase";
import { readMarkets } from "./market-read";

export const getMarketsResponse = async (supabase = createSupabaseAdminClient()) => {
  return NextResponse.json(await readMarkets(supabase));
};
