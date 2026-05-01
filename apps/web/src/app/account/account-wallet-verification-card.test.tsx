import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AccountWalletVerificationCard } from "./account-wallet-verification-card";

test("wallet verification card explains connected wallet is not server verification", () => {
  const markup = renderToStaticMarkup(<AccountWalletVerificationCard />);

  assert.match(markup, /錢包驗證/);
  assert.match(markup, /目前連接錢包/);
  assert.match(markup, /已驗證錢包/);
  assert.match(markup, /瀏覽器錢包連接只代表你可使用該錢包/);
  assert.doesNotMatch(markup, /signature|authorization|SUPABASE_SERVICE_ROLE_KEY/i);
});
