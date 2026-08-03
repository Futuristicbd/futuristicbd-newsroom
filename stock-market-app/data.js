// Sample data for DSE (Dhaka Stock Exchange) listed companies.
// Prices are in Bangladeshi Taka (BDT ৳). Values are illustrative sample data
// for a demo dashboard — they are NOT live market prices.

const DSE_STOCKS = [
  { symbol: "GP",         name: "Grameenphone Ltd.",              sector: "Telecommunication",           prevClose: 305.40 },
  { symbol: "ROBI",       name: "Robi Axiata Ltd.",               sector: "Telecommunication",           prevClose: 29.80 },
  { symbol: "BATBC",      name: "British American Tobacco BD",     sector: "Food & Allied",               prevClose: 512.10 },
  { symbol: "SQURPHARMA", name: "Square Pharmaceuticals Ltd.",     sector: "Pharmaceuticals & Chemicals", prevClose: 214.60 },
  { symbol: "RENATA",     name: "Renata Ltd.",                     sector: "Pharmaceuticals & Chemicals", prevClose: 704.30 },
  { symbol: "BXPHARMA",   name: "Beximco Pharmaceuticals Ltd.",    sector: "Pharmaceuticals & Chemicals", prevClose: 118.90 },
  { symbol: "BEXIMCO",    name: "Beximco Ltd.",                    sector: "Miscellaneous",               prevClose: 109.70 },
  { symbol: "WALTONHIL",  name: "Walton Hi-Tech Industries",       sector: "Engineering",                 prevClose: 912.50 },
  { symbol: "BRACBANK",   name: "BRAC Bank Ltd.",                  sector: "Bank",                        prevClose: 44.80 },
  { symbol: "CITYBANK",   name: "The City Bank Ltd.",              sector: "Bank",                        prevClose: 21.90 },
  { symbol: "ISLAMIBANK", name: "Islami Bank Bangladesh Ltd.",     sector: "Bank",                        prevClose: 33.20 },
  { symbol: "DUTCHBANGL", name: "Dutch-Bangla Bank Ltd.",          sector: "Bank",                        prevClose: 64.40 },
  { symbol: "UPGDCL",     name: "United Power Generation",         sector: "Fuel & Power",                prevClose: 201.30 },
  { symbol: "TITASGAS",   name: "Titas Gas T&D Co. Ltd.",          sector: "Fuel & Power",                prevClose: 37.60 },
  { symbol: "POWERGRID",  name: "Power Grid Co. of Bangladesh",    sector: "Fuel & Power",                prevClose: 44.10 },
  { symbol: "SUMITPOWER", name: "Summit Power Ltd.",               sector: "Fuel & Power",                prevClose: 37.90 },
  { symbol: "LHBL",       name: "LafargeHolcim Bangladesh",        sector: "Cement",                      prevClose: 64.70 },
  { symbol: "MJLBD",      name: "MJL Bangladesh Ltd.",             sector: "Fuel & Power",                prevClose: 89.60 },
  { symbol: "OLYMPIC",    name: "Olympic Industries Ltd.",         sector: "Food & Allied",               prevClose: 178.40 },
  { symbol: "BSRMLTD",    name: "BSRM Ltd.",                       sector: "Engineering",                 prevClose: 91.20 },
  { symbol: "ACI",        name: "ACI Ltd.",                        sector: "Pharmaceuticals & Chemicals", prevClose: 248.70 },
  { symbol: "MARICO",     name: "Marico Bangladesh Ltd.",          sector: "Pharmaceuticals & Chemicals", prevClose: 2295.00 },
  { symbol: "BERGERPBL",  name: "Berger Paints Bangladesh",        sector: "Miscellaneous",               prevClose: 1602.80 },
  { symbol: "IFIC",       name: "IFIC Bank Ltd.",                  sector: "Bank",                        prevClose: 12.30 },
];

// The three headline DSE indices with their previous closing values.
const DSE_INDICES = [
  { code: "DSEX",  name: "DSE Broad Index",     prevClose: 5218.44 },
  { code: "DS30",  name: "DSE 30 Index",        prevClose: 1902.11 },
  { code: "DSES",  name: "DSE Shariah Index",   prevClose: 1146.87 },
];
