import express from 'express';
import cors from 'cors';
import 'dotenv/config';

// Importação dos módulos de rotas
import rotasMotos from './routes/motos.js';
import rotasFichas from './routes/fichas.js';
import rotasLocatarios from './routes/locatarios.js';
import rotasLoja from './routes/loja.js';
import rotasCatalogo from './routes/catalogo.js';

const app = express();

app.use(express.json());
app.use(cors({ origin: '*' }));

// Registro dos Módulos de Rotas na API
app.use('/api/motos', rotasMotos);
app.use('/api/fichas', rotasFichas);
app.use('/api/locatarios', rotasLocatarios);
app.use('/api/loja', rotasLoja);
app.use('/api/catalogo', rotasCatalogo);

// Healthcheck
app.get('/health', (req, res) => {
    res.json({
        status: 'API LOCAFACILMOTOS Online 🚀',
        timestamp: new Date().toISOString()
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🔥 Servidor rodando na porta ${PORT}`);
});