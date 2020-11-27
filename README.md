# Amazon(dot)in Product Crawler

A demo utility script that crawls Amazon for given search query and dumps the results. Not for production use. See caveats.

## Usage

```bash
#git clone

yarn install
# or "npm install"

node index.js
```

Please follow the prompt for inputs parameters:

1. Search query for Amazon (eg. "phone" or "gaming mouse" )
2. Number of pages to scrape
3. Output format (json or xml)

## Code Structure

Please see index.js comments for details. Summary:

1. Takes user input
2. Launches a task for each page using async.js to make most of event loop
3. Parses markup using cheerio for each page
4. Dumps results to an output file for each page

## Caveats

1. Amazon may have thousands of results for a search query with hundreds of pages. Script makes a request for each page almost simultaneously. At some point Amazon will trigger captcha or timeout for IP. Not tested, please limit number of pages.\
<strong>Solution:</strong> Proxies/ip rotation.

2. Adding to 1, async will stop being useful after certain number of parrallel tasks.\
<strong>Solution:</strong>: Worker threads etc.

3. Markup parsing is not foolproof. For example, "Recommended article" section will club child products together.\
<strong>Solution:</strong>: Fix markup parsing/selectors :)
