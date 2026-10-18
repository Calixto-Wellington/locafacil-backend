import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import rotasMotos from './routes/motos.js';

const app = express();

app.use(express.json());

// Libera CORS para o frontend na Cloudflare e para desenvolvimento local
app.use(cors({
    origin: '*' // Depois você pode restringir para o domínio exato da Cloudflare
}));

// Rotas da API
app.use('/api/motos', rotasMotos);

// Healthcheck
app.get('/health', (req, res) => {
    res.json({ status: 'API LOCAFACILMOTOS Online 🚀' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🔥 Servidor rodando na porta ${PORT}`);
});