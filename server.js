const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'housing_sales',
});
db.connect((error) => {
    if (error) console.log('Database connection failed:', error.message);
    else console.log('Connected to MySQL');
});
const query = (sql, values = []) => new Promise((resolve, reject) => {
    db.query(sql, values, (error, rows) => error ? reject(error) : resolve(rows));
});

const idIsValid = (value) => /^\d+$/.test(String(value)) && Number(value) > 0;
const cleanText = (value, max = 120) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
const sendDatabaseError = (res, error) => {
    console.error('Database request failed:', error.code || error.message);
    let message = 'The request could not be completed. Check the server terminal for the database error.';
    if (['ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST', 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR'].includes(error.code)) {
        message = 'Cannot connect to MySQL. Start MySQL in XAMPP, then restart the website.';
    } else if (error.code === 'ER_BAD_DB_ERROR' || error.code === 'ER_NO_SUCH_TABLE') {
        message = 'The housing_sales database or its tables are missing. Import schema.sql using phpMyAdmin.';
    } else if (error.code === 'ER_BAD_FIELD_ERROR') {
        message = 'A required database column is missing. Run migrate_units.sql using phpMyAdmin.';
    }
    res.status(500).json({ error: message });
};

// --- Authentication: validate input and store bcrypt password hashes ---
app.post('/api/signup', async (req, res) => {
    const { username, password } = req.body;
    if (!cleanText(username, 40) || username.trim().length < 3 || !/^[A-Za-z0-9_.-]+$/.test(username.trim())) {
        return res.status(400).json({ error: 'Username must be 3-40 letters, numbers, dots, dashes or underscores.' });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
        return res.status(400).json({ error: 'Password must be 8-12 characters and include uppercase, lowercase, a number and a symbol.' });
    }
    try {
        const passwordHash = await bcrypt.hash(password, 12);
        const result = await query('INSERT INTO users (username, password) VALUES (?, ?)', [username.trim(), passwordHash]);
        res.status(201).json({ message: 'Account created.', id: result.insertId, username: username.trim() });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That username is already in use.' });
        sendDatabaseError(res, error);
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!cleanText(username, 40) || typeof password !== 'string' || password.length > 12) {
        return res.status(400).json({ error: 'Enter a valid username and password.' });
    }
    try {
        const rows = await query('SELECT id, username, password FROM users WHERE username = ?', [username.trim()]);
        if (!rows.length) return res.status(401).json({ error: 'Invalid username or password.' });
        const storedPassword = String(rows[0].password || '');
        const legacyPasswordMatch = !storedPassword.startsWith('$2') && password === storedPassword;
        if (!legacyPasswordMatch && !(await bcrypt.compare(password, storedPassword))) return res.status(401).json({ error: 'Invalid username or password.' });
        if (legacyPasswordMatch) await query('UPDATE users SET password=? WHERE id=?', [await bcrypt.hash(password, 12), rows[0].id]);
        res.json({ message: 'Login successful.', id: rows[0].id, username: rows[0].username });
    } catch (error) { sendDatabaseError(res, error); }
});

// --- Third-party API gateway: geocoding (Open-Meteo), weather (Open-Meteo), FX (Frankfurter) ---
app.get('/api/insights', async (req, res) => {
    const city = typeof req.query.city === 'string' ? req.query.city.trim().slice(0, 80) : '';
    if (!city) return res.status(400).json({ error: 'Enter a city name.' });
    try {
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
        const geoResponse = await fetch(geoUrl);
        const fxResponse = await fetch('https://api.frankfurter.app/latest?from=EUR&to=MYR');
        if (!geoResponse.ok || !fxResponse.ok) throw new Error('An external service is unavailable.');
        const geoData = await geoResponse.json();
        const fxData = await fxResponse.json();
        if (!geoData.results || !geoData.results.length) return res.status(404).json({ error: 'City not found. Try another name.' });
        const place = geoData.results[0];
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code&forecast_days=1`;
        const weatherResponse = await fetch(weatherUrl);
        if (!weatherResponse.ok) throw new Error('Weather service is unavailable.');
        const weatherData = await weatherResponse.json();
        const descriptions = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Light drizzle', 61: 'Rain', 71: 'Snow', 80: 'Showers', 95: 'Thunderstorm' };
        res.json({
            place: { name: place.name, country: place.country || 'Unknown country', latitude: place.latitude, longitude: place.longitude },
            weather: { temperature: weatherData.current.temperature_2m, description: descriptions[weatherData.current.weather_code] || 'Current conditions' },
            currency: { eurToMyr: Number(fxData.rates.MYR).toFixed(2), date: fxData.date }
        });
    } catch (error) {
        console.error('External API request failed:', error.message);
        res.status(502).json({ error: 'Live market data is temporarily unavailable.' });
    }
});

// --- Property units: complete CRUD; all SQL values use placeholders ---
app.get('/api/units', async (_req, res) => {
    try { res.json(await query('SELECT * FROM units ORDER BY id')); } catch (error) { sendDatabaseError(res, error); }
});
app.post('/api/units', async (req, res) => {
    const { name, type, location, status, price, image_data } = req.body;
    if (!cleanText(name, 100) || !cleanText(location, 120) || !Number.isFinite(Number(price)) || Number(price) <= 0 || !['Available', 'Sold'].includes(status)) return res.status(400).json({ error: 'Enter a name, location, positive price and valid status.' });
    try {
        const result = await query('INSERT INTO units (name,type,location,status,price,image_data) VALUES (?,?,?,?,?,?)', [name.trim(), type || 'Condo', location.trim(), status, Number(price), image_data || null]);
        res.status(201).json((await query('SELECT * FROM units WHERE id=?', [result.insertId]))[0]);
    } catch (error) { sendDatabaseError(res, error); }
});
app.put('/api/units/:id', async (req, res) => {
    if (!idIsValid(req.params.id)) return res.status(400).json({ error: 'Invalid unit id.' });
    const { name, type, location, status, price, image_data } = req.body;
    if (!cleanText(name, 100) || !cleanText(location, 120) || !Number.isFinite(Number(price)) || Number(price) <= 0 || !['Available', 'Sold'].includes(status)) return res.status(400).json({ error: 'Enter a name, location, positive price and valid status.' });
    try {
        const result = await query('UPDATE units SET name=?,type=?,location=?,status=?,price=?,image_data=? WHERE id=?', [name.trim(), type || 'Condo', location.trim(), status, Number(price), image_data || null, req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ error: 'Unit not found.' });
        res.json((await query('SELECT * FROM units WHERE id=?', [req.params.id]))[0]);
    } catch (error) { sendDatabaseError(res, error); }
});
app.delete('/api/units/:id', async (req, res) => {
    if (!idIsValid(req.params.id)) return res.status(400).json({ error: 'Invalid unit id.' });
    try { const result = await query('DELETE FROM units WHERE id=?', [req.params.id]); if (!result.affectedRows) return res.status(404).json({ error: 'Unit not found.' }); res.json({ message: 'Unit deleted.' }); } catch (error) { sendDatabaseError(res, error); }
});

// --- Buyers: complete CRUD ---
app.get('/api/buyers', async (_req, res) => {
    try { res.json(await query('SELECT * FROM buyers ORDER BY id')); } catch (error) { sendDatabaseError(res, error); }
});
app.post('/api/buyers', async (req, res) => {
    const { name, agent, viewing_date, viewing_time, unit, status } = req.body;
    if (!cleanText(name, 120) || !['Pending', 'Cancelled'].includes(status || 'Pending')) return res.status(400).json({ error: 'Enter a buyer name and valid status.' });
    try {
        const result = await query('INSERT INTO buyers (name,agent,viewing_date,viewing_time,unit,status) VALUES (?,?,?,?,?,?)', [name.trim(), agent || 'Unassigned', viewing_date || null, viewing_time || null, unit || null, status || 'Pending']);
        res.status(201).json((await query('SELECT * FROM buyers WHERE id=?', [result.insertId]))[0]);
    } catch (error) { sendDatabaseError(res, error); }
});
app.put('/api/buyers/:id', async (req, res) => {
    if (!idIsValid(req.params.id)) return res.status(400).json({ error: 'Invalid buyer id.' });
    const { name, agent, viewing_date, viewing_time, unit, status } = req.body;
    if (!cleanText(name, 120) || !['Pending', 'Sold', 'Cancelled'].includes(status)) return res.status(400).json({ error: 'Enter a buyer name and valid status.' });
    if (status === 'Sold') return completeSale(req, res);
    try {
        const result = await query('UPDATE buyers SET name=?,agent=?,viewing_date=?,viewing_time=?,unit=?,status=? WHERE id=?', [name.trim(), agent || 'Unassigned', viewing_date || null, viewing_time || null, unit || null, status, req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ error: 'Buyer not found.' });
        res.json((await query('SELECT * FROM buyers WHERE id=?', [req.params.id]))[0]);
    } catch (error) { sendDatabaseError(res, error); }
});
app.delete('/api/buyers/:id', async (req, res) => {
    if (!idIsValid(req.params.id)) return res.status(400).json({ error: 'Invalid buyer id.' });
    try { const result = await query('DELETE FROM buyers WHERE id=?', [req.params.id]); if (!result.affectedRows) return res.status(404).json({ error: 'Buyer not found.' }); res.json({ message: 'Buyer deleted.' }); } catch (error) { sendDatabaseError(res, error); }
});

// Complete a sale as one transaction so a unit cannot be sold twice.
async function completeSale(req, res) {
    const connection = db;
    try {
        await new Promise((resolve, reject) => connection.beginTransaction(error => error ? reject(error) : resolve()));
        const buyers = await query('SELECT * FROM buyers WHERE id=? FOR UPDATE', [req.params.id]);

        if (!buyers.length) throw Object.assign(new Error('Buyer not found.'), { status: 404 });
        const buyer = buyers[0];
        const unitName = req.body.unit || buyer.unit;
        if (!unitName) throw Object.assign(new Error('Assign a unit before completing a sale.'), { status: 400 });
        const units = await query('SELECT * FROM units WHERE name=? FOR UPDATE', [unitName]);

        if (!units.length) throw Object.assign(new Error('The selected unit no longer exists.'), { status: 400 });
        if (units[0].status === 'Sold' && buyer.status !== 'Sold') throw Object.assign(new Error('This unit has already been sold.'), { status: 409 });
        await query('UPDATE units SET status=? WHERE id=?', ['Sold', units[0].id]);
        await query('UPDATE buyers SET name=?,agent=?,viewing_date=?,viewing_time=?,unit=?,status=? WHERE id=?', [req.body.name || buyer.name, req.body.agent || buyer.agent || 'Unassigned', req.body.viewing_date || buyer.viewing_date, req.body.viewing_time || buyer.viewing_time, unitName, 'Sold', req.params.id]);
        await query('UPDATE buyers SET status=? WHERE unit=? AND status=? AND id<>?', ['Cancelled', unitName, 'Pending', req.params.id]);
        await new Promise((resolve, reject) => connection.commit(error => error ? reject(error) : resolve()));
        const rows = await query('SELECT * FROM buyers WHERE id=?', [req.params.id]);
        res.json(rows[0]);
    } catch (error) {
        await new Promise(resolve => connection.rollback(() => resolve()));
        if (error.status) return res.status(error.status).json({ error: error.message });
        sendDatabaseError(res, error);
    }
}

// --- New feature: buyer follow-ups, linked to buyers by a foreign key ---
app.get('/api/followups', async (_req, res) => {
    try { res.json(await query('SELECT f.*, b.name AS buyer_name FROM buyer_followups f JOIN buyers b ON b.id=f.buyer_id ORDER BY f.due_date, f.id')); } catch (error) { sendDatabaseError(res, error); }
});
app.post('/api/followups', async (req, res) => {
    const { buyer_id, note, due_date } = req.body;
    if (!idIsValid(buyer_id) || !cleanText(note, 500) || !/^\d{4}-\d{2}-\d{2}$/.test(due_date || '')) return res.status(400).json({ error: 'Choose a buyer, enter a short note and select a due date.' });
    try { const result = await query('INSERT INTO buyer_followups (buyer_id,note,due_date,status) VALUES (?,?,?,?)', [buyer_id, note.trim(), due_date, 'Open']); res.status(201).json((await query('SELECT * FROM buyer_followups WHERE id=?', [result.insertId]))[0]); } catch (error) { if (error.code === 'ER_NO_REFERENCED_ROW_2') return res.status(404).json({ error: 'Buyer not found.' }); sendDatabaseError(res, error); }
});
app.put('/api/followups/:id', async (req, res) => {
    const { note, due_date, status } = req.body;
    if (!idIsValid(req.params.id) || !cleanText(note, 500) || !/^\d{4}-\d{2}-\d{2}$/.test(due_date || '') || !['Open', 'Done'].includes(status)) return res.status(400).json({ error: 'Enter a valid note, due date and status.' });
    try { const result = await query('UPDATE buyer_followups SET note=?,due_date=?,status=? WHERE id=?', [note.trim(), due_date, status, req.params.id]); if (!result.affectedRows) return res.status(404).json({ error: 'Follow-up not found.' }); res.json((await query('SELECT * FROM buyer_followups WHERE id=?', [req.params.id]))[0]); } catch (error) { sendDatabaseError(res, error); }
});
app.delete('/api/followups/:id', async (req, res) => {
    if (!idIsValid(req.params.id)) return res.status(400).json({ error: 'Invalid follow-up id.' });
    try { const result = await query('DELETE FROM buyer_followups WHERE id=?', [req.params.id]); if (!result.affectedRows) return res.status(404).json({ error: 'Follow-up not found.' }); res.json({ message: 'Follow-up deleted.' }); } catch (error) { sendDatabaseError(res, error); }
});

// --- Announcements: complete CRUD ---
app.get('/api/announcements', async (_req, res) => { try { res.json(await query('SELECT * FROM announcements ORDER BY id')); } catch (error) { sendDatabaseError(res, error); } });
app.post('/api/announcements', async (req, res) => {
    const { text } = req.body;
    if (!cleanText(text, 500)) return res.status(400).json({ error: 'Announcement must be 1-500 characters.' });
    try { const result = await query('INSERT INTO announcements (text) VALUES (?)', [text.trim()]); res.status(201).json((await query('SELECT * FROM announcements WHERE id=?', [result.insertId]))[0]); } catch (error) { sendDatabaseError(res, error); }
});
app.put('/api/announcements/:id', async (req, res) => {
    const { text } = req.body;
    if (!idIsValid(req.params.id) || !cleanText(text, 500)) return res.status(400).json({ error: 'Enter a valid announcement.' });
    try { const result = await query('UPDATE announcements SET text=? WHERE id=?', [text.trim(), req.params.id]); if (!result.affectedRows) return res.status(404).json({ error: 'Announcement not found.' }); res.json((await query('SELECT * FROM announcements WHERE id=?', [req.params.id]))[0]); } catch (error) { sendDatabaseError(res, error); }
});
app.delete('/api/announcements/:id', async (req, res) => {
    if (!idIsValid(req.params.id)) return res.status(400).json({ error: 'Invalid announcement id.' });
    try { const result = await query('DELETE FROM announcements WHERE id=?', [req.params.id]); if (!result.affectedRows) return res.status(404).json({ error: 'Announcement not found.' }); res.json({ message: 'Announcement deleted.' }); } catch (error) { sendDatabaseError(res, error); }
});

app.get('/api/stats', async (_req, res) => {
    try {
        const rows = await query(`SELECT (SELECT COUNT(*) FROM units WHERE status='Available') AS available, (SELECT COUNT(*) FROM units WHERE status='Sold') AS sold, (SELECT COUNT(*) FROM buyers) AS buyers, (SELECT COUNT(*) FROM buyers WHERE viewing_date IS NOT NULL) AS viewings`);
        res.json(rows[0]);
    } catch (error) { sendDatabaseError(res, error); }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


















