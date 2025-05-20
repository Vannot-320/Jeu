const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const session = require('express-session');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL,
        methods: ["GET", "POST"],
        credentials: true
    }
});

const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 10;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.query(`
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOTCTED
    );
`)
.then(() => console.log('Table "users" prête (PostgreSQL).'))
.catch(err => console.error('Erreur lors de la création de la table users (PostgreSQL):', err.message));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));

app.use(session(
    {
        secret: process.env.SESSION_SECRET || 'votre_secret_secure_par_defaut_si_non_set',
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
        }
    }
));

function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ message: 'Non authentifié. Veuillez vous connecter.' });
    }
}

app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ message: 'Veuillez fournir un nom d\'utilisateur, un email et un mot de passe.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        const query = 'INSERT INTO users (username, email, password) VALUES ($1, $2, $3)';
        const values = [username, email, hashedPassword];

        await pool.query(query, values);
        res.status(201).json({ message: 'Inscription réussie!' });
    } catch (error) {
        if (error.code === '23505') {
            if (error.detail.includes('username')) {
                return res.status(409).json({ message: 'Le nom d\'utilisateur est déjà utilisé.' });
            }
            if (error.detail.includes('email')) {
                return res.status(409).json({ message: 'L\'adresse e-mail est déjà utilisée.' });
            }
        }
        console.error('Erreur lors de l\'insertion de l\'utilisateur (PostgreSQL):', error.message);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Veuillez fournir un nom d\'utilisateur et un mot de passe.' });
    }

    try {
        const query = 'SELECT * FROM users WHERE username = $1';
        const result = await pool.query(query, [username]);
        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ message: 'Nom d\'utilisateur ou mot de passe incorrect.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Nom d\'utilisateur ou mot de passe incorrect.' });
        }

        req.session.userId = user.id;
        req.session.username = user.username;
        res.status(200).json({ message: 'Connexion réussie!', username: user.username });
    } catch (error) {
        console.error('Erreur lors de la récupération de l\'utilisateur ou du hachage:', error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

app.use((req, res) => {
    res.status(404).json({ message: "Endpoint non trouvé." });
});

let waitingPlayer = null;
const rooms = {};

io.on('connection', (socket) => {
    console.log('Un joueur est connecté:', socket.id);

    socket.on('findOpponent', () => {
        if (waitingPlayer && waitingPlayer.id !== socket.id) {
            const player1 = waitingPlayer;
            const player2 = socket;
            waitingPlayer = null;

            const roomId = `room_${player1.id}_${player2.id}`;
            player1.join(roomId);
            player2.join(roomId);

            rooms[roomId] = {
                players: [player1.id, player2.id],
                sockets: { [player1.id]: player1, [player2.id]: player2 },
                choices: {},
                score: { [player1.id]: 0, [player2.id]: 0 },
                round: 1
            };

            player1.emit('opponentFound', { roomId: roomId, opponentId: player2.id });
            player2.emit('opponentFound', { roomId: roomId, opponentId: player1.id });
            console.log(`Partie créée: ${roomId} entre ${player1.id} et ${player2.id}`);
        } else {
            waitingPlayer = socket;
            socket.emit('waitingForOpponent');
            console.log('Joueur en attente:', socket.id);
        }
    });

    socket.on('playerChoice', ({ roomId, choice }) => {
        const room = rooms[roomId];
        if (room) {
            room.choices[socket.id] = choice;
            console.log(`Choix du joueur ${socket.id} dans la salle ${roomId}: ${choice}`);

            const otherPlayerId = room.players.find(id => id !== socket.id);
            if (room.choices[otherPlayerId]) {
                const player1Choice = room.choices[room.players[0]];
                const player2Choice = room.choices[room.players[1]];

                let winner = null;
                let draw = false;

                if (player1Choice === player2Choice) {
                    draw = true;
                } else if (
                    (player1Choice === 'rock' && player2Choice === 'scissors') ||
                    (player1Choice === 'paper' && player2Choice === 'rock') ||
                    (player1Choice === 'scissors' && player2Choice === 'paper')
                ) {
                    winner = room.players[0];
                    room.score[room.players[0]]++;
                } else {
                    winner = room.players[1];
                    room.score[room.players[1]]++;
                }

                io.to(roomId).emit('roundResult', {
                    player1Id: room.players[0],
                    player2Id: room.players[1],
                    player1Choice: player1Choice,
                    player2Choice: player2Choice,
                    winner: winner,
                    draw: draw,
                    scores: room.score
                });
                console.log(`Résultat du tour dans ${roomId}: Joueur 1: ${player1Choice}, Joueur 2: ${player2Choice}, Gagnant: ${winner ? winner : 'Égalité'}`);

                room.round++;
                if (room.round > 3) {
                    let finalWinner = null;
                    if (room.score[room.players[0]] > room.score[room.players[1]]) {
                        finalWinner = room.players[0];
                    } else if (room.score[room.players[1]] > room.score[room.players[0]]) {
                        finalWinner = room.players[1];
                    }

                    io.to(roomId).emit('gameOver', {
                        finalScores: room.score,
                        finalWinner: finalWinner
                    });
                    console.log(`Partie terminée dans ${roomId}. Scores finaux: ${JSON.stringify(room.score)}`);

                    delete rooms[roomId];
                    console.log(`Salle ${roomId} supprimée après la fin de partie.`);
                } else {
                    room.choices = {};
                    io.to(roomId).emit('nextRound', { round: room.round });
                    console.log(`Début du round ${room.round} dans la salle ${roomId}.`);
                }
            }
        }
    });

    socket.on('leaveRoom', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            const otherPlayerId = room.players.find(id => id !== socket.id);
            if (otherPlayerId && room.sockets[otherPlayerId]) {
                room.sockets[otherPlayerId].emit('opponentLeft');
                console.log(`Joueur ${socket.id} a quitté la salle ${roomId}. Notifié ${otherPlayerId}.`);
            }
            socket.leave(roomId);
            delete rooms[roomId];
            console.log(`Salle ${roomId} supprimée.`);
        }
    });

    socket.on('disconnect', () => {
        console.log('Joueur déconnecté:', socket.id);

        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
            console.log('Joueur en attente déconnecté. File d\'attente réinitialisée.');
        }

        Object.keys(rooms).forEach(roomId => {
            if (rooms[roomId].players.includes(socket.id)) {
                const otherPlayerId = rooms[roomId].players.find(id => id !== socket.id);
                if (otherPlayerId && rooms[roomId].sockets[otherPlayerId]) {
                    rooms[roomId].sockets[otherPlayerId].emit('opponentDisconnected');
                    console.log(`Joueur ${socket.id} déconnecté de la salle ${roomId}. Notifié ${otherPlayerId}.`);
                }
                delete rooms[roomId];
                console.log(`Salle ${roomId} supprimée suite à la déconnexion de ${socket.id}.`);
            }
        });
    });
});

server.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
    if (process.env.NODE_ENV === 'production') {
        console.log('Ce serveur est en mode production sur Render.com.');
        console.log(`Accès via : https://votre-nom-de-service.onrender.com (remplacez 'votre-nom-de-service')`);
    }
});