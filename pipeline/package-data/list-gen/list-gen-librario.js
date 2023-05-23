const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const key = '8ecd4939deda648bd0f3c7d7e0704bb4';
const url = new URL('https://libraries.io/api/search');
url.searchParams.append('platforms', 'npm');
url.searchParams.append('sort', 'dependents_count');
url.searchParams.append('order', 'desc');
url.searchParams.append('per_page', '100');
url.searchParams.append('api_key', key);

async function fetchData() {
    let page = 100;
    while (page <= 100) {
        let responseText;
        try {
            console.log('Page ' + page)
            url.searchParams.set('page', page.toString());

            const response = await fetch(url.toString())
            responseText = await response.text();
            fs.writeFileSync(path.resolve(`libraries-io-${page}.json`), responseText, {encoding: 'utf8'});

            page++;
        } catch (e) {
            console.log(e);
            console.log(responseText);
        }
    }
}

fetchData().then(() => console.log('done'));