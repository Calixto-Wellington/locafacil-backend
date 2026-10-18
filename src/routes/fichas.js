import { Router } from 'express';
import { supabase } from '../config/supabase.js';

const router = Router();

// POST /api/fichas - Recebe o formulário de cadastro do site (index.html)
router.post('/', async (req, res) => {
    try {
        const {
            nome, cpf, data_nascimento, email, telefone,
            endereco, moto_interesse, plano_interesse,
            cnh_url, comprovante_url, possui_caucao
        } = req.body;

        if (!nome || !cpf || !telefone) {
            return res.status(400).json({ error: 'Nome, CPF e WhatsApp são obrigatórios.' });
        }

        const { data, error } = await supabase
            .from('cadastros_funil')
            .insert([{
                nome,
                cpf,
                data_nascimento,
                email,
                telefone,
                endereco,
                moto_interesse,
                plano_interesse,
                cnh_url,
                comprovante_url,
                possui_caucao: possui_caucao ?? true,
                status: 'PENDENTE'
            }])
            .select();

        if (error) throw error;
        return res.status(201).json(data);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/fichas - Busca fichas para a Mesa de Aprovação (com suporte a filtros e busca)
router.get('/', async (req, res) => {
    try {
        const { status, busca } = req.query;

        let query = supabase
            .from('cadastros_funil')
            .select('*')
            .order('created_at', { ascending: false });

        if (status && status !== 'TODOS') {
            query = query.eq('status', status);
        }

        if (busca) {
            const termoLimpo = busca.replace(/\D/g, '');
            query = query.or(`cpf.ilike.%${busca}%,cpf.ilike.%${termoLimpo}%,telefone.ilike.%${busca}%,telefone.ilike.%${termoLimpo}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        return res.json(data);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// PATCH /api/fichas/:id/status - Atualiza o status da ficha (APROVADO / REJEITADO)
router.patch('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, motivo_recusa } = req.body;

        const payload = { status };
        if (motivo_recusa) payload.motivo_recusa = motivo_recusa;

        const { data, error } = await supabase
            .from('cadastros_funil')
            .update(payload)
            .eq('id', id)
            .select();

        if (error) throw error;
        return res.json(data);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/fichas/:id/efetivar - Entrega a moto, cria o locatário na frota e marca como CONTRATADO
router.post('/:id/efetivar', async (req, res) => {
    try {
        const { id } = req.params;
        const { placa, km_inicial } = req.body;

        if (!placa) {
            return res.status(400).json({ error: 'A placa da moto é obrigatória para efetivar a entrega.' });
        }

        // 1. Busca os dados da ficha aprovada
        const { data: ficha, error: errFicha } = await supabase
            .from('cadastros_funil')
            .select('*')
            .eq('id', id)
            .single();

        if (errFicha || !ficha) return res.status(444).json({ error: 'Ficha não encontrada.' });

        const placaFormatada = placa.trim().toUpperCase();
        const kmInicialNum = parseInt(km_inicial) || 0;

        // 2. Insere na tabela 'locatarios'
        const { data: novoLocatario, error: errLocatario } = await supabase
            .from('locatarios')
            .insert([{
                nome: ficha.nome,
                cpf: ficha.cpf,
                telefone: ficha.telefone,
                email: ficha.email,
                placa: placaFormatada,
                modelo: ficha.moto_interesse || 'Honda CG 160 Start',
                semanas_pagas: 0,
                km_inicial: kmInicialNum,
                km_atual: kmInicialNum,
                locafacil_coins: 0
            }])
            .select();

        if (errLocatario) throw errLocatario;

        // 3. Atualiza status no funil para CONTRATADO
        await supabase
            .from('cadastros_funil')
            .update({ status: 'CONTRATADO' })
            .eq('id', id);

        return res.status(201).json({
            mensagem: 'Locatário efetivado e moto entregue com sucesso!',
            locatario: novoLocatario
        });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

export default router;