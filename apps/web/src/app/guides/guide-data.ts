export type GuideSlug =
  | "how-polymarket-routing-works"
  | "invite-rewards"
  | "polygon-pusd-payouts"
  | "fees-and-builder-code";

export interface Guide {
  slug: GuideSlug;
  title: string;
  summary: string;
  sections: {
    heading: string;
    body: string[];
  }[];
}

export const guides: Guide[] = [
  {
    slug: "how-polymarket-routing-works",
    title: "Polymarket 路由如何運作",
    summary: "了解瀏覽、連接、用戶簽署、Builder Code 附加及非託管邊界。",
    sections: [
      {
        heading: "由瀏覽開始",
        body: [
          "用戶可在本平台瀏覽公開 Polymarket 市場資料。單純瀏覽市場不會產生 Builder 費用，亦不會改動任何內部結餘。",
          "交易功能目前保持停用，直至錢包、Polymarket 憑證、用戶簽署、提交器及營運 readiness 全部完成。",
        ],
      },
      {
        heading: "用戶自行簽署",
        body: [
          "當交易啟用後，用戶需要連接自己的錢包及 Polymarket 憑證，檢查訂單內容，並自行簽署訂單。",
          "用戶需要自行簽署訂單。本平台不會代用戶下注或交易，亦不託管用戶在 Polymarket 的資金。",
        ],
      },
      {
        heading: "Builder Code 歸因",
        body: [
          "在提交前，應用會把 POLY_BUILDER_CODE 附加到合資格訂單，讓 Polymarket 可按 Builder profile 歸因。",
          "如 Builder Code 缺失或訂單未成功成交，便不會產生本平台 Builder 費用歸因。",
        ],
      },
    ],
  },
  {
    slug: "invite-rewards",
    title: "推薦獎勵",
    summary: "直接推薦、首次有效歸因、獎勵分配及風險披露。",
    sections: [
      {
        heading: "推薦流程",
        body: [
          "朋友分享推薦連結後，新用戶透過帶有 ?ref=CODE 的網址開啟本平台。首次有效推薦歸因會被保留。",
          "自我推薦會被拒絕；已停用的推薦碼亦會被拒絕。既有歸因只可透過管理員覆核更正。",
        ],
      },
      {
        heading: "獎勵來源",
        body: [
          "當你直接推薦的用戶透過本平台完成合資格交易，並產生已確認的 Builder 費用收入後，你可獲得推薦獎勵。",
          "獎勵只按直接推薦計算，不設多層或遞迴推薦獎勵。沒有直接推薦人時，推薦人份額撥入平台份額。",
        ],
      },
      {
        heading: "分配比例",
        body: [
          "已確認 Builder 費用收入的分配為：平台 60%、直接推薦人 30%、交易者回贈 10%。",
          "本平台不收取參與費用，不設多層推薦獎勵，不保證盈利，亦不會代用戶下注或交易。",
        ],
      },
    ],
  },
  {
    slug: "polygon-pusd-payouts",
    title: "Polygon pUSD 支付流程",
    summary: "由 pending 到 payable，再到人手審批、鏈上支付及交易哈希記錄。",
    sections: [
      {
        heading: "狀態流程",
        body: [
          "獎勵最初會以 pending 形式記錄。當相關 Builder 費用收入經確認後，獎勵可被標記為 payable。",
          "支付申請可處於 requested、approved、paid、failed 或 cancelled 狀態。",
        ],
      },
      {
        heading: "人手審批",
        body: [
          "獎勵以人手審批方式處理。審批通過後，平台可透過 Polygon 上的 pUSD 向指定錢包支付獎勵。",
          "實際支付不會自動執行，必須由管理員審批及記錄交易哈希。",
          "請確認你的收款地址支援 Polygon 網絡。",
        ],
      },
      {
        heading: "沒有自動金庫轉帳",
        body: [
          "平台不會因支付申請而自動從金庫轉帳。管理員需要先審批，完成鏈上 Polygon pUSD 支付後，再把交易哈希記錄到後台。",
        ],
      },
    ],
  },
  {
    slug: "fees-and-builder-code",
    title: "費用與 Builder Code",
    summary: "目前待生效 Builder 費率、適用條件及瀏覽不收費的說明。",
    sections: [
      {
        heading: "待生效費率",
        body: [
          "待生效 Maker 費率：0.5%",
          "待生效 Taker 費率：1%",
          "這些數值是披露用途；實際 Builder 費用必須以 Polymarket Builder 設定及生效狀態為準。",
        ],
      },
      {
        heading: "何時適用",
        body: [
          "費率只適用於合資格並成功成交的 Polymarket 路由訂單。單純瀏覽市場不會產生 Builder 費用。",
          "Builder 費用只會在訂單附有本平台 builderCode 並成功 matching 時歸因；如 builderCode 缺失，便不會有 Builder 費用歸因。",
        ],
      },
      {
        heading: "額外費用",
        body: [
          "Builder 費用會疊加於 Polymarket 或平台本身收取的費用之上。用戶應在簽署任何訂單前自行核對所有費用。",
          "Builder 費用歸集至本平台 Builder profile 綁定的錢包；本平台只從已確認 Builder 費用收入計算獎勵。",
        ],
      },
    ],
  },
];

export const getGuide = (slug: GuideSlug): Guide => {
  const guide = guides.find((item) => item.slug === slug);
  if (!guide) throw new Error(`Unknown guide: ${slug}`);
  return guide;
};
