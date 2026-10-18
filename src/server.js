import express from 'express';
import cors from 'cors';
import 'dotenv/config';

// Importação das rotas
import rotasMotos from './routes/motos.js';
import rotasAgendamento from './routes/agendamento.js';

const app = express();

app.use(express.json());
app.use(cors({ origin: '*' }));

// Registro das rotas na API
app.use('/api/motos', rotasMotos);
app.use('/api/agendamento', rotasAgendamento);
app.use('/api/cadastro', rotasCadastro);

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