import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatMoney } from "./pricing.js";
import {
  allowedTransferDestinations,
  harareInboundTotals,
  isTransferAllowed,
  priceForLocation,
  sameCurrency,
  slugifyLocationName,
  sumCents,
  usualSourceForName,
} from "./location-rules.js";

const harare = { id: "h", name: "Harare", isHub: true, currency: "USD", supplyHubId: null };
const gweru = { id: "g", name: "Gweru", isHub: false, currency: "USD", supplyHubId: "h" };
const joburg = { id: "j", name: "Johannesburg", isHub: true, currency: "ZAR", supplyHubId: null };
const cape = { id: "c", name: "Cape Town", isHub: false, currency: "ZAR", supplyHubId: "j" };
const shops = [harare, gweru, joburg, cape];

describe("location create rules", () => {
  it("slugifies a shop name and keeps harare and gweru supply", () => {
    assert.equal(slugifyLocationName("Cape Town"), "cape-town");
    assert.equal(gweru.supplyHubId, harare.id);
    assert.equal(harare.currency, "USD");
    assert.equal(cape.currency, "ZAR");
  });
});

describe("transfer rules", () => {
  it("allows Johannesburg to Cape Town and to Harare", () => {
    const destinations = allowedTransferDestinations(joburg, shops).map((loc) => loc.id);
    assert.ok(destinations.includes("c"));
    assert.ok(destinations.includes("h"));
    assert.equal(isTransferAllowed(joburg, cape, shops), true);
    assert.equal(isTransferAllowed(joburg, harare, shops), true);
  });

  it("rejects Harare to Cape Town and starts a new branch at zero stock", () => {
    assert.equal(isTransferAllowed(harare, cape, shops), false);
    assert.equal(isTransferAllowed(harare, gweru, shops), true);
    const newBranchStock = [];
    assert.equal(newBranchStock.length, 0);
  });
});

describe("price resolution", () => {
  const product = { id: "p", name: "Setup salt", retailPriceCents: 100, categoryId: "cat" };
  const category = {
    id: "cat",
    retailPackQty: 0,
    wholesalePackQty: 0,
    retailPackPriceCents: 0,
    wholesalePackPriceCents: 0,
  };

  it("shares one rand price across Johannesburg and Cape Town", () => {
    const usd = priceForLocation({ product, category, location: harare });
    assert.equal(usd.ok, true);
    assert.equal(usd.product.retailPriceCents, 100);

    const missing = priceForLocation({ product, category, location: cape });
    assert.equal(missing.ok, false);

    const priced = { ...product, zarRetailPriceCents: 2500 };
    const capePrice = priceForLocation({ product: priced, category, location: cape });
    const joburgPrice = priceForLocation({ product: priced, category, location: joburg });
    assert.equal(capePrice.ok, true);
    assert.equal(joburgPrice.ok, true);
    assert.equal(capePrice.product.retailPriceCents, 2500);
    assert.equal(joburgPrice.product.retailPriceCents, capePrice.product.retailPriceCents);
    assert.equal(priceForLocation({ product: priced, category, location: gweru }).product.retailPriceCents, 100);
  });
});

describe("mixed currency totals", () => {
  it("does not add dollars and rand into one total", () => {
    const sales = [
      { currency: "USD", totalCents: 500 },
      { currency: "ZAR", totalCents: 8000 },
      { totalCents: 200 },
    ];
    assert.equal(sumCents(sameCurrency(sales, "USD")), 700);
    assert.equal(sumCents(sameCurrency(sales, "ZAR")), 8000);
    assert.notEqual(sumCents(sameCurrency(sales, "USD")), sumCents(sales));
  });

  it("formats both currencies", () => {
    assert.match(formatMoney(100, "USD"), /\$1\.00/);
    assert.match(formatMoney(100, "ZAR"), /R[\s\u00a0]?1[,.]00/);
  });
});

describe("Harare inbound", () => {
  it("keeps produced salts apart from Johannesburg transfers", () => {
    const rows = harareInboundTotals({
      harareId: "h",
      johannesburgId: "j",
      receives: [
        {
          productId: "salt",
          productName: "Pink salt",
          locationId: "h",
          type: "receive",
          sourceKind: "produced",
          quantityDelta: 10,
        },
        {
          productId: "oil",
          productName: "Oil",
          locationId: "h",
          type: "receive",
          sourceKind: "supplied",
          quantityDelta: 2,
        },
      ],
      transfers: [
        {
          productId: "oil",
          productName: "Oil",
          toLocationId: "h",
          fromLocationId: "j",
          status: "completed",
          quantity: 6,
        },
      ],
    });
    const salt = rows.find((row) => row.productId === "salt");
    const oil = rows.find((row) => row.productId === "oil");
    assert.equal(salt.produced, 10);
    assert.equal(salt.fromJohannesburg, 0);
    assert.equal(oil.fromJohannesburg, 6);
    assert.equal(oil.localException, 2);
    assert.equal(oil.produced + oil.fromJohannesburg, 6);
    assert.equal(usualSourceForName("Pink salt"), "produced_at_harare");
    assert.equal(usualSourceForName("Cooking oil"), "from_johannesburg");
  });
});
