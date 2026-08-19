require('dotenv').config(); // Carga las variables de entorno desde el archivo .env
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Servir archivos estáticos desde la carpeta public
app.use(express.static(path.join(__dirname, '../public')));

// Configuración de la base de datos PostgreSQL utilizando la URL del archivo .env
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// ==========================================
// RUTAS DE ORGANIZACIONES Y CLUBS
// ==========================================

// Registrar una nueva organización / club (Panel Super Admin)
app.post('/api/organizations', async (req, res) => {
    try {
        const { name, email, subdomain } = req.body;
        const result = await pool.query(
            'INSERT INTO organizations (name, email, subdomain) VALUES ($1, $2, $3) RETURNING *',
            [name, email, subdomain]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Buscar organización y sus eventos activos por correo electrónico
app.get('/api/organizations/email/:email', async (req, res) => {
    try {
        const orgQuery = await pool.query('SELECT * FROM organizations WHERE email = $1', [req.params.email]);
        if (orgQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Organización no encontrada' });
        }
        const organization = orgQuery.rows[0];

        // Solo listar eventos que NO estén eliminados (borrado lógico)
        const eventsQuery = await pool.query(
            "SELECT * FROM events WHERE organization_id = $1 AND status != 'deleted' ORDER BY start_time DESC", 
            [organization.id]
        );

        res.json({ organization, events: eventsQuery.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ==========================================
// RUTAS DE EVENTOS
// ==========================================

// Crear un nuevo evento
app.post('/api/events', async (req, res) => {
    try {
        const { organization_id, title, total_cards, price_per_card, start_time } = req.body;
        const result = await pool.query(
            'INSERT INTO events (organization_id, title, total_cards, price_per_card, start_time, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [organization_id, title, total_cards, price_per_card, start_time, 'active']
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Borrado lógico de un evento (cambia estado a 'deleted')
app.delete('/api/events/:id', async (req, res) => {
    try {
        const result = await pool.query(
            "UPDATE events SET status = 'deleted' WHERE id = $1 RETURNING *", 
            [req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Evento no encontrado' });
        }
        res.json({ message: 'Evento archivado / eliminado correctamente', event: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar el alias de pago de la organización para un evento
app.put('/api/events/:id/payment-alias', async (req, res) => {
    try {
        const { org_payment_alias } = req.body;
        const result = await pool.query(
            'UPDATE events SET org_payment_alias = $1 WHERE id = $2 RETURNING *', 
            [org_payment_alias, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar el enlace de transmisión (YouTube) del evento
app.put('/api/events/:id/stream', async (req, res) => {
    try {
        const { stream_url } = req.body;
        const result = await pool.query(
            'UPDATE events SET stream_url = $1 WHERE id = $2 RETURNING *', 
            [stream_url, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});


// ==========================================
// GESTIÓN DE CARTONES Y COMPRAS (Y VENTA MANUAL)
// ==========================================

// Generar cartones aleatorios para un evento
app.post('/api/events/:id/generate-cards', async (req, res) => {
    try {
        const eventId = req.params.id;
        const eventQuery = await pool.query('SELECT total_cards FROM events WHERE id = $1', [eventId]);
        if (eventQuery.rows.length === 0) return res.status(404).json({ error: 'Evento no encontrado' });

        const totalCards = eventQuery.rows[0].total_cards;

        for (let i = 1; i <= totalCards; i++) {
            let numbers = [];
            while(numbers.length < 15) {
                let r = Math.floor(Math.random() * 90) + 1;
                if(!numbers.includes(r)) numbers.push(r);
            }
            numbers.sort((a,b) => a - b);

            await pool.query(
                'INSERT INTO bingo_cards (event_id, card_number, card_data, status) VALUES ($1, $2, $3, $4)',
                [eventId, i, JSON.stringify(numbers), 'available']
            );
        }

        res.json({ message: `${totalCards} cartones generados con éxito.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener todos los cartones de un evento
app.get('/api/events/:id/cards', async (req, res) => {
    try {
        const cards = await pool.query(
            'SELECT * FROM bingo_cards WHERE event_id = $1 ORDER BY card_number ASC', 
            [req.params.id]
        );
        res.json({ cards: cards.rows });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// Registrar compra de cartón (Portal jugador o Venta manual)
app.post('/api/cards/buy', async (req, res) => {
    try {
        const { card_id, buyer_name, buyer_email, buyer_dni, buyer_alias, payment_proof } = req.body;
        const result = await pool.query(
            `UPDATE bingo_cards 
             SET status = 'pending', buyer_name = $1, buyer_email = $2, buyer_dni = $3, buyer_alias = $4, payment_proof = $5 
             WHERE id = $6 AND status = 'available' RETURNING *`,
            [buyer_name, buyer_email, buyer_dni, buyer_alias, payment_proof, card_id]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'El cartón no está disponible o ya fue reservado.' });
        }

        res.json({ message: 'Compra registrada con éxito.', card: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Validar pago de cartón por parte del organizador (Pasa de pending a sold)
app.put('/api/events/validate-payment/:cardId', async (req, res) => {
    try {
        const result = await pool.query(
            "UPDATE bingo_cards SET status = 'sold' WHERE id = $1 RETURNING *", 
            [req.params.cardId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Cartón no encontrado' });
        res.json({ message: 'Pago validado con éxito', card: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ==========================================
// SORTEO Y BOLILLERO EN VIVO
// ==========================================

// Registrar número salido (Bolillero)
app.post('/api/events/:id/draw-number', async (req, res) => {
    try {
        const eventId = req.params.id;
        const { number_called } = req.body;

        await pool.query(
            'INSERT INTO drawn_numbers (event_id, number_called) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [eventId, number_called]
        );

        res.json({ message: `Número ${number_called} cantado con éxito` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener números ya cantados en un evento
app.get('/api/events/:id/drawn-numbers', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT number_called FROM drawn_numbers WHERE event_id = $1 ORDER BY drawn_at ASC',
            [req.params.id]
        );
        const drawnNumbers = result.rows.map(row => row.number_called);
        res.json({ drawnNumbers });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Detectar ganadores de Bingo
app.get('/api/events/:id/winners', async (req, res) => {
    try {
        const eventId = req.params.id;
        
        const drawnRes = await pool.query('SELECT number_called FROM drawn_numbers WHERE event_id = $1', [eventId]);
        const drawnNumbers = drawnRes.rows.map(r => r.number_called);

        const cardsRes = await pool.query("SELECT * FROM bingo_cards WHERE event_id = $1 AND status IN ('sold', 'bingo')", [eventId]);
        
        let winners = [];
        for (let card of cardsRes.rows) {
            let cardNumbers = card.card_data; 
            let hasWon = cardNumbers.every(num => drawnNumbers.includes(num));
            if (hasWon) {
                winners.push(card);
                await pool.query("UPDATE bingo_cards SET status = 'bingo' WHERE id = $1", [card.id]);
            }
        }

        res.json({ winners });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Iniciar servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});