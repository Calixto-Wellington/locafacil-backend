import { Router } from 'express';
import { supabase } from '../config/supabase.js';

const router = Router();

// GET /api/locatarios - Lista todos os pilotos ativos na frota
router.get('/', async (req, res) => {
    try {
        const { busca } = req.query;

        let query = supabase
            .from('locatarios')
            .select('*')
            .order('created_at', { ascending: false });

        if (busca) {
            const termoLimpo = busca.replace(/\D/g, '');
            query = query.or(`placa.ilike.%${busca}%,nome.ilike.%${busca}%,cpf.ilike.%${busca}%,cpf.ilike.%${termoLimpo}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        return res.json(data);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/locatarios/buscar - Auto-login do piloto (por CPF, Placa ou E-mail)
router.get('/buscar', async (req, res) => {
    try {
        const { termo } = req.query;
        if (!termo) return res.status(400).json({ error: 'Informe um termo para busca.' });

        const termoLimpo = termo.replace(/[^a-zA-Z0-9]/g, '');

        const { data, error } = await supabase
            .from('locatarios')
            .select('*')
            .or(`email.ilike.%${termo}%,placa.ilike.%${termoLimpo}%,cpf.ilike.%${termoLimpo}%`)
            .limit(1);

        if (error) throw error;
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Locatário não encontrado.' });
        }

        return res.json(data);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/locatarios/:id/baixa-pix - Confirma o Pix semanal (+1 Semana e +Coins)
router.post('/:id/baixa-pix', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Busca dados atuais do piloto
        const { data: piloto, error: errPiloto } = await supabase
            .from('locatarios')
            .select('*')
            .eq('id', id)
            .single();

        if (errPiloto || !piloto) return res.status(404).json({ error: 'Piloto não encontrado.' });

        // 2. Busca a regra atual de ganho de coins
        const { data: config } = await supabase
            .from('configuracoes')
            .select('valor')
            .eq('chave', 'coins_por_pix')
            .maybeSingle();

        const incrementoCoins = config ? (parseInt(config.valor) || 10) : 10;

        const novasSemanas = (piloto.semanas_pagas || 0) + 1;
        const novosCoins = (piloto.locafacil_coins || 0) + incrementoCoins;

        // 3. Grava no banco
        const { data, error } = await supabase
            .from('locatarios')
            .update({
                semanas_pagas: novasSemanas,
                locafacil_coins: novosCoins
            })
            .eq('id', id)
            .select();

        if (error) throw error;

        return res.json({
            sucesso: true,
            semanas_pagas: novasSemanas,
            locafacil_coins: novosCoins,
            coins_creditados: incrementoCoins,
            piloto: data
        });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/locatarios/:id/telemetria - Registra medição semanal do rastreador GPS
router.post('/:id/telemetria', async (req, res) => {
    try {
        const { id } = req.params;
        const { semana, data_inicio, data_fim, km_rodados, observacao } = req.body;

        const { data: piloto } = await supabase
            .from('locatarios')
            .select('placa, km_atual')
            .eq('id', id)
            .single();

        if (!piloto) return res.status(404).json({ error: 'Piloto não encontrado.' });

        const kmRodadosNum = parseInt(km_rodados) || 0;
        const novoKmTotal = (piloto.km_atual || 0) + kmRodadosNum;

        // 1. Grava no histórico
        const { error: errHist } = await supabase
            .from('historico_km')
            .insert([{
                locatario_id: id,
                placa: piloto.placa,
                semana: parseInt(semana) || 1,
                data_inicio,
                data_fim,
                km_anterior: piloto.km_atual || 0,
                km_atual: novoKmTotal,
                km_rodados: kmRodadosNum,
                observacao: observacao || 'Telemetria / App Rastreador'
            }]);

        if (errHist) throw errHist;

        // 2. Atualiza KM do painel principal
        await supabase
            .from('locatarios')
            .update({ km_atual: novoKmTotal })
            .eq('id', id);

        return res.status(201).json({ mensagem: 'Rodagem do rastreador gravada com sucesso!' });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/locatarios/:id/historico-km - Lista o histórico de rodagem semanal
router.get('/:id/historico-km', async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('historico_km')
            .select('*')
            .eq('locatario_id', id)
            .order('semana', { ascending: false });

        if (error) throw error;
        return res.json(data);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// PATCH /api/locatarios/:id - Edição direta do card do piloto
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const payload = req.body;

        const { data, error } = await supabase
            .from('locatarios')
            .update(payload)
            .eq('id', id)
            .select();

        if (error) throw error;
        return res.json(data);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

export default router;