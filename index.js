const puppeteer = require("puppeteer"); // Loading pages
const cheerio = require("cheerio"); // Parsing markup.
const prompt = require("prompt"); // User input
const async = require("async"); // Parallel jobs flow control
const convert = require("xml-js"); // json to xml

const path = require("path");
const { promisify } = require("util");
const fs = require("fs");
const writeFileAsync = promisify(fs.writeFile); // Use fs api with async/await

const BASE_URL = {
  amazon: "https://www.amazon.in/s?k=",
  flipkart: "", //TODO. Selectors and url format will change
};

let TOTAL_RESULT_COUNT = 0;

// Selector expressions for amazon
const PRODUCT_LIST_SELECTOR =
  "#search > div.s-desktop-width-max.s-desktop-content.sg-row > div.sg-col-20-of-24.sg-col-28-of-32.sg-col-16-of-20.sg-col.sg-col-32-of-36.sg-col-8-of-12.sg-col-12-of-16.sg-col-24-of-28 > div > span:nth-child(4) > div.s-main-slot.s-result-list.s-search-results.sg-row > div";
const RESULT_COUNT_SELECTOR =
  ".a-section.a-spacing-small.a-spacing-top-small > span:nth-of-type(1)";
const PRODUCT_SELECTORS = {
  name: "div > span > div > div > div  h2 > a > span",
  url: "div > span > div > div > div  h2 > a",
  img: "div > span > div > div  span > a > div > img",
  offerPrice: "div > span > div > div span.a-price-whole",
  originalPrice:
    "div > span > div > div span.a-price.a-text-price .a-offscreen",
  rating: "div > span > div > div a > i",
};

// Parse each product from the product list markup with appropriate selectors
const parseProduct = (_product) => {
  const product = {
    name: _product.find(PRODUCT_SELECTORS.name).text(),
    url: _product.find(PRODUCT_SELECTORS.url).attr("href"),
    img: _product.find(PRODUCT_SELECTORS.img).attr("src"),
    rating: _product.find(PRODUCT_SELECTORS.rating).text(),
  };

  // No price received => product unavailable. Good for text output but ofc will change if results were to go to db
  const offerPrice = _product.find(PRODUCT_SELECTORS.offerPrice).text();
  if (offerPrice) {
    product.offerPrice = offerPrice;
    product.originalPrice = _product
      .find(PRODUCT_SELECTORS.originalPrice)
      .text()
      .replace("₹", "");
  } else {
    product.offerPrice = "[NOT AVAILABLE]";
  }

  return product;
};

//  Logic meat that for each result page for given keyword:
//      1. Launches puppeteer
//      2. Parses the markup
//      3. Writes results to a file
//  Async handles calling this function for each page from main() below
const fetchProducts = async (
  source, // amazon or flipkart. amazon for this demo
  keyword, // search keyword
  format, // output file format
  outputFoler, // output folder
  pageNumber // which page?
) => {
  // Setup puppetteer
  const url = BASE_URL[source] + keyword + "&page=" + pageNumber;
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Wait for page load
  await page.goto(url, { waitUntil: "load", timeout: 10000 });
  const content = await page.content();

  // Setup cheerio
  const $ = cheerio.load(content);

  // How many results did we find? Report user once.
  if (pageNumber == 1) {
    const resultCountExp = $(RESULT_COUNT_SELECTOR).html();

    // This will produce an error if query was too outlandish and Amazon couldn't find any results.
    TOTAL_RESULT_COUNT = resultCountExp.slice(
      resultCountExp.indexOf("over"),
      resultCountExp.indexOf(" for")
    );
  }

  // Start parsing
  console.log("Starting scraping products for page " + pageNumber);

  // The top level product list markup for this page
  const productList = $(PRODUCT_LIST_SELECTOR);

  // Parse products
  const products = [];
  productList.each((i, _product) => {
    // Delegate parsing of individual product
    const product = parseProduct($(_product));

    // Was valid product markup?
    if (product.name !== "") products.push(product);
  });

  // Finally write the results to disk

  // Target file
  const outputTarget = path.join(
    outputFoler,
    keyword + "-" + pageNumber.toString()
  );

  // json or xml?
  if (format === "json") {
    await writeFileAsync(outputTarget + ".json", JSON.stringify(products));
  } else if (format === "xml") {
    var options = { compact: true, ignoreComment: true, spaces: 4 };
    var xmlProducts =
      '<?xml version="1.0" encoding="utf-8"?>\n' +
      convert.json2xml(products, options);
    await writeFileAsync(outputTarget + ".xml", xmlProducts);
  }

  // Done for this page, cleanup.
  await browser.close();

  console.log("Finished page " + pageNumber);
};

// Entry point
const main = () => {
  // Get user input
  prompt.start();
  prompt.get(
    [
      {
        name: "keyword",
        message: "Keyword to scrape results for",
        required: true,
        default: "phone",
      },
      {
        name: "pageCount",
        message: "Number of pages to scrape",
        required: true,
        default: 5,
      },
      {
        name: "format",
        message: "Output format (json, xml)",
        required: true,
        default: "json",
      },
    ],
    (err, params) => {
      // Something went wrong at input?
      if (err) {
        console.log("\n" + err.message);
        return;
      }

      // Report start.
      console.log(
        '\nWill be collecting amazon results for "' +
          params.keyword +
          '" for upto ' +
          params.pageCount +
          " pages. \n\n"
      );

      // Create output dir
      const outputFoler =
        params.keyword + "-" + params.format + "-" + Date.now();
      if (!fs.existsSync(outputFoler)) {
        fs.mkdirSync(outputFoler);
      }

      // Generate iteratee for async based on page count
      const pages = Array.from(Array(parseInt(params.pageCount)).keys()).map(
        (pageNo) => ++pageNo
      );

      // Let async handle fetch job for each page, hopefully optimally parallel.
      // For considerable number of pages, will be practical to use child_process and proxies/IP rotation to not trigger amazon
      async.each(
        pages,
        fetchProducts.bind(
          this,
          "amazon",
          params.keyword,
          params.format,
          outputFoler
        ),
        function (err) {
          if (err) console.log("Encountered an error: " + err.message);
          else {
            // All done. Inform user of output location.
            console.log(
              "\n\nFetched all requested product details successfully. Results are here: " +
                outputFoler
            );
            // So many results were found.
            console.log(
              "\nAmazon reported they found " +
                TOTAL_RESULT_COUNT +
                " for " +
                params.keyword +
                ".\n"
            );
          }
        }
      );
    }
  );
};

main();
