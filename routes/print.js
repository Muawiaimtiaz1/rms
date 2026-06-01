const express = require("express");
const db = require("../db/knex");
const salesService = require("../services/SalesService");
const { renderSaleReceiptPage } = require("../services/ReceiptPrintService");

const router = express.Router();
const FORMATS = new Set(["kitchen", "customer", "unpaid"]);

function getRequestBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function getPrintShopId(req) {
  const queryShopId = req.query.shop_id ? Number(req.query.shop_id) : null;
  if (req.session?.user?.shop_id) return req.session.user.shop_id;
  if (req.session?.user?.role === "superadmin" && queryShopId) return queryShopId;
  return queryShopId;
}

function stationForCategory(categoryName, stationMap) {
  if (!categoryName) return "NONE";
  return stationMap[categoryName] || "NONE";
}

function parsePrintJobContent(value) {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return null;
  }
}

async function filterKitchenItemsByStation(details, shopId, requestedStationParam) {
  if (!requestedStationParam) return details;
  const requestedStation = Array.isArray(requestedStationParam)
    ? requestedStationParam[0]
    : String(requestedStationParam);

  const { printers, resolvePrinterRoute } = await salesService.getPrinterRouting(db, shopId);
  if (!printers.length) return { ...details, items: [] };

  const [categoryRouteMap, kitchenRoute] = await Promise.all([
    salesService.getCategoryPrintRouteMap(db, shopId, resolvePrinterRoute),
    salesService.resolveKitchenRoute(db, details.sale, shopId, resolvePrinterRoute)
  ]);

  return {
    ...details,
    items: details.items.filter((item) => {
      const itemRoute = salesService.getItemPrintRoute(item, categoryRouteMap, kitchenRoute);
      return itemRoute.station !== "NONE"
        && (itemRoute.key === requestedStation || itemRoute.station === requestedStation);
    }),
  };
}

router.get("/jobs/:id", async (req, res) => {
  const shopId = getPrintShopId(req);
  if (!shopId) {
    return res.status(401).send("Unauthorized print request");
  }

  const job = await db("print_queue")
    .where({ id: req.params.id, shop_id: shopId })
    .first();
  if (!job) return res.status(404).send("Print job not found");

  const content = parsePrintJobContent(job.content_json);
  if (!content?.sale_id) return res.status(400).send("Invalid print job content");

  const format = ["kitchen", "customer", "unpaid"].includes(content.format)
    ? content.format
    : "kitchen";

  const details = await salesService.getBill(content.sale_id, shopId);
  if (!details) return res.status(404).send("Sale not found");

  if (format === "kitchen" && Array.isArray(content.items)) {
    details.items = content.items;
  }

  const html = renderSaleReceiptPage(details, {
    format,
    baseUrl: getRequestBaseUrl(req),
    autoPrint: req.query.autoprint !== "0",
  });

  res.type("html").send(html);
});

router.get("/sales/:id", async (req, res) => {
  const format = String(req.query.format || "customer").toLowerCase();
  if (!FORMATS.has(format)) {
    return res.status(400).send("Unsupported print format");
  }

  const shopId = getPrintShopId(req);
  if (!shopId) {
    return res.status(401).send("Unauthorized print request");
  }

  let details = await salesService.getBill(req.params.id, shopId);
  if (!details) return res.status(404).send("Sale not found");

  if (format === "kitchen") {
    details = await filterKitchenItemsByStation(details, shopId, req.query.station);
  }

  const html = renderSaleReceiptPage(details, {
    format,
    baseUrl: getRequestBaseUrl(req),
    autoPrint: req.query.autoprint !== "0",
  });

  res.type("html").send(html);
});

module.exports = router;
