require('dotenv').config();
const express = require('express');
const redis = require('redis');
const {MET} = require("bing-translate-api");

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
        res.contentType('text/plain').send(value);
    } catch (err) {
        res.status(500).contentType('text/plain').send(err.message);
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
            res.status(409).contentType('text/plain').send('Key already exists');
        } else {
            res.status(201).contentType('text/plain').send('1');
        }
    } catch (err) {
        res.status(500).contentType('text/plain').send(err.message);
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
        res.contentType('text/plain').send(result === 'OK' ? '1' : '0');
    } catch (err) {
        res.status(500).contentType('text/plain').send(err.message);
    }
});
// DELETE 删除内容
app.delete('/base/:key', async (req, res) => {
    const key = req.params.key;
    try {
        const result = await client.del(key);
        if (result === 0) {
            res.status(404).contentType('text/plain').send('Key not found');
        } else {
            res.contentType('text/plain').send('1');
        }
    } catch (err) {
        res.status(500).contentType('text/plain').send(err.message);
    }
});

// 必应翻译
const __translate = async (req, res) => {
    let text = req.query.text
    if (!text && req.body) {
        text = req.body;
    }
    let from = req.query.from;
    let to = req.query.to;
    let asHtml = req.query.asHtml;
    const isEnglish = /^[\x00-\xff]*$/.test(text);
    if (!from && !to) {
        from = isEnglish ? 'en' : null;
        to = isEnglish ? 'zh-Hans' : 'en';
    }
    MET.translate(text, from, to, {
        translateOptions: {
            textType: asHtml ? 'html' : 'plain',
        }
    }).then(result => {
        res.status(200).contentType('text/plain').send(result[0].translations[0].text);
    }).catch(err => {
        res.status(500).contentType('text/plain').send(err);
    });
};
app.post("/tools/bing-translate", __translate);
app.get("/tools/bing-translate", __translate);

app.get('/tools/bing-translate/languages', async (req, res) => {
    res.status(200).json(MET.lang.LANGS);
});


const port = parseInt(process.env.PORT || '3000');

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});