const http = require("http");
const { randomUUID } = require("crypto");

const PORT = process.env.PORT || 10000;

const RAKUTEN_APPLICATION_ID = process.env.RAKUTEN_APPLICATION_ID || "";
const RAKUTEN_ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY || "";
const RAKUTEN_AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID || "";

const RAKUTEN_ENDPOINT =
  "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);

  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });

  res.end(body);
}

function normalizeRakutenItem(item) {
  const destinationURL =
    RAKUTEN_AFFILIATE_ID && item.affiliateUrl
      ? item.affiliateUrl
      : item.itemUrl;

  return {
    id: item.itemCode || destinationURL || item.itemName || randomUUID(),
    name: item.itemName || "",
    price: item.itemPrice || 0,
    shopName: item.shopName || "",
    imageURL:
      Array.isArray(item.mediumImageUrls) && item.mediumImageUrls.length > 0
        ? item.mediumImageUrls[0]
        : null,
    destinationURL: destinationURL || null,
    usesAffiliateURL: Boolean(
      RAKUTEN_AFFILIATE_ID && item.affiliateUrl
    )
  };
}

async function searchRakuten(query) {
  if (!RAKUTEN_APPLICATION_ID || !RAKUTEN_ACCESS_KEY) {
    const error = new Error(
      "Rakuten API credentials are not configured on the server."
    );
    error.status = 500;
    throw error;
  }

  const url = new URL(RAKUTEN_ENDPOINT);

  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", RAKUTEN_APPLICATION_ID);
  url.searchParams.set("accessKey", RAKUTEN_ACCESS_KEY);
  url.searchParams.set("keyword", query);
  url.searchParams.set("hits", "12");
  url.searchParams.set("imageFlag", "1");
  url.searchParams.set("carrier", "2");
  url.searchParams.set("orFlag", "1");
  url.searchParams.set(
    "elements",
    [
      "itemName",
      "itemCode",
      "itemPrice",
      "itemUrl",
      "affiliateUrl",
      "mediumImageUrls",
      "shopName"
    ].join(",")
  );

  if (RAKUTEN_AFFILIATE_ID) {
    url.searchParams.set("affiliateId", RAKUTEN_AFFILIATE_ID);
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  const text = await response.text();

  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(
      data.error_description ||
        data.error ||
        `Rakuten API returned HTTP ${response.status}`
    );

    error.status = response.status;
    error.details = data;
    throw error;
  }

  const items = Array.isArray(data.items) ? data.items : [];
  return items.map(normalizeRakutenItem);
}

const server = http.createServer(async (req, res) => {
  try {
    const requestURL = new URL(
      req.url,
      `http://${req.headers.host || "localhost"}`
    );

    if (req.method === "GET" && requestURL.pathname === "/") {
      return sendJSON(res, 200, {
        ok: true,
        service: "WINE MARK Rakuten API"
      });
    }

    if (req.method === "GET" && requestURL.pathname === "/health") {
      return sendJSON(res, 200, {
        ok: true
      });
    }

    if (req.method === "GET" && requestURL.pathname === "/rakuten/search") {
      const query = (requestURL.searchParams.get("q") || "").trim();

      if (!query) {
        return sendJSON(res, 400, {
          ok: false,
          error: "Missing query parameter: q"
        });
      }

      const items = await searchRakuten(query);

      return sendJSON(res, 200, {
        ok: true,
        query,
        count: items.length,
        items
      });
    }

    return sendJSON(res, 404, {
      ok: false,
      error: "Not found"
    });
  } catch (error) {
    console.error(error);

    return sendJSON(
      res,
      Number.isInteger(error.status) ? error.status : 500,
      {
        ok: false,
        error: error.message || "Internal server error",
        details: error.details || undefined
      }
    );
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`WINE MARK Rakuten API listening on port ${PORT}`);
});
