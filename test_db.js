require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const url = process.env.DATABASE_URL;
console.log("Testing connection string starting with:", url.substring(0, 30) + '...');

const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false }
});

client.connect()
    .then(() => {
        console.log("SUCCESS: Connected to Neon DB!");
        return client.query("SELECT NOW();");
    })
    .then(res => {
        console.log("Query result:", res.rows);
        client.end();
    })
    .catch(err => {
        console.error("FAILED to connect:", err.message);
        client.end();
    });
