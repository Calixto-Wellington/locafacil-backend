import { Router } from 'express';
import { supabase } from '../config/supabase.js';

const router = Router();

// GET /api/loja/itens - Listar brindes ativos para resgate
router.get('/itens', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('loja_resgate')
            .select('*')
            .order('custo_coins', { ascending: true });

        if (error) throw error;
        return res.json(data);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/loja/itens - Adicionar novo brinde
router.post('/itens', async (req, res) => {
    try {
        const { titulo, custo_coins, ativo } = req.body;

        const { data, error } = await supabase
            .from('loja_resgate')
            .insert([{ titulo, custo_coins: parseInt(custo_coins) || 100, ativo: ativo ?? true }])
            .select();

        if (error) throw error;
        return res.status(201).json(data);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// DELETE /api/loja/itens/:id - Excluir brinde da loja
router.delete('/itens/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('loja_resgate').delete().eq('id', id);

        if (error) throw error;
        return res.json({ mensagem: 'Item removido da loja com sucesso.' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/loja/config-coins - Busca regra de moedas por Pix
router.get('/config-coins', async (req, res) => {
    try {
        const { data } = await supabase
            .from('configuracoes')
            .select('valor')
            .eq('chave', 'coins_por_pix')
            .maybeSingle();

        return res.json({ coins_por_pix: data ? parseInt(data.valor) || 10 : 10 });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/loja/config-coins - Altera regra de moedas por Pix
router.post('/config-coins', async (req, res) => {
    try {
        const { coins_por_pix } = req.body;

        const { data, error } = await supabase
            .from('configuracoes')
            .upsert({ chave: 'coins_por_pix', valor: (coins_por_pix || 10).toString() }, { onConflict: 'chave' })
            .select();

        if (error) throw error;
        return res.json({ mensagem: 'Regra de coins atualizada com sucesso!', data: data });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

export default router;