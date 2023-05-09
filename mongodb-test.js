const {MongoClient} = require('mongodb');
const fs = require('fs');
const path = require('path');
const connectionURI = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')).mongoURI;

const client = new MongoClient(connectionURI);

let conn = null;

async function getDb() {
    if (conn === null) {
        try {
            conn = await client.connect();
        } catch (e) {
            // ToDo - proper error handling ;)
            console.error(e);
        }
    }

    return conn.db('analysis_results_v3')
}

async function main() {
  const db = await getDb();
  const resultsColl = await db.collection('results');
  const resultId = (await resultsColl.insertOne({aaa: "TEST"})).insertedId;

  const i = 1;
}

main();

