const {MongoClient} = require('mongodb');
const connectionURI = 'mongodb://127.0.0.1:27017/';

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

function closeConnection() {
    conn?.close();
}

module.exports = {getDb, closeConnection};