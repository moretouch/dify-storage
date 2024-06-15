require('dotenv').config();
const express = require('express');
const redis = require('redis');

const REDIS_CONNECTION_STRING = process.env.REDIS_CONNECTION_STRING;
const AUTH_API_KEY = process.env.AUTH_API_KEY;

const client = redis.createClient({
    url: REDIS_CONNECTION_STRING
});

const app = express();

client.connect().then(async (e) => {
    console.log('Connected to Redis');
    await e.set('test', 'test');
    console.log('Test key saved');
    const value = await e.get('test');
    console.log('Test key value:', value);
}).catch((e) => {
    console.error('Failed to connect to Redis:', e);
    process.exit(1);
})

AUTH_API_KEY && app.use((req, res, next) => {
    const apiKey = req.get('X-API-Key');
    if (apiKey !== AUTH_API_KEY) {
        res.status(401).send('Unauthorized');
    } else {
        next();
    }
});

app.get('/base/:key', async (req, res) => {
    const key = req.params.key;
    try {
        const value = await client.get(key);
        res.send(value);
    } catch (err) {
        res.status(500).send(err.message);
    }
});
// PUT 保存内容，如果key已经存在则返回409
app.put('/base/:key', async (req, res) => {
    const key = req.params.key;
    const value = req.query.value;
    const expires = req.query.expires;
    try {
        const result = expires === undefined ? await client.setnx(key, value) : await client.set(key, value, 'EX', expires);
        if (result === 0) {
            res.status(409).send('Key already exists');
        } else {
            res.send('1');
        }
    } catch (err) {
        res.status(500).send(err.message);
    }
});
// POST 保存内容，已经存在则覆盖
app.post('/base/:key', async (req, res) => {
    const key = req.params.key;
    const value = req.query.value;
    const expires = req.query.expires;
    try {
        let result;
        if (expires === undefined) {
            result = await client.set(key, value);
        } else {
            result = await client.set(key, value, 'EX', expires);
        }
        res.send(result === 'OK' ? '1' : '0');
    } catch (err) {
        res.status(500).send(err.message);
    }
});
// DELETE 删除内容
app.delete('/base/:key', async (req, res) => {
    const key = req.params.key;
    try {
        const result = await client.del(key);
        if (result === 0) {
            res.status(404).send('Key not found');
        } else {
            res.send('Key deleted successfully');
        }
    } catch (err) {
        res.status(500).send(err.message);
    }
});


const port = parseInt(process.env.PORT || '3000');

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});