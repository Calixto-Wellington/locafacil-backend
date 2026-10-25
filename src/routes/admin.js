import { Router } from 'express';
import { supabase } from '../config/supabase.js';

const router = Router();

// --- 1. MESA DE APROVAÇÃO (LEADS) ---
router.get('/leads', async (req, res) => {
    try {
        const { status } = req.query;
        let query = supabase.from('cadastros_funil').select('*').order('created_at', { ascending: false });
        if (status && status !== 'TODOS') query = query.eq('status', status);
        const { data, error } = await query;
        if (error) throw error;
        res.json(data);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/leads/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, motivo_recusa } = req.body;
        const updateData = { status };
        if (motivo_recusa) updateData.motivo_recusa = motivo_recusa;
        const { data, error } = await supabase.from('cadastros_funil').update(updateData).eq('id', id).select();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/leads/:id/efetivar', async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, cpf, telefone, email, moto_interesse, placa, km_inicial } = req.body;
        const { data: novoLocatario, error: errLoc } = await supabase.from('locatarios').insert([{
            nome, cpf, telefone, email, placa: placa.toUpperCase(), modelo: moto_interesse || 'Honda CG 160 Start',
            semanas_pagas: 0, km_inicial: km_inicial || 0, km_atual: km_inicial || 0, locafacil_coins: 0
        }]).select().single();
        if (errLoc) throw errLoc;

        await supabase.from('cadastros_funil').update({ status: 'CONTRATADO' }).eq('id', id);
        await supabase.from('motos_frota').update({ status: 'ALUGADA', km_atual: km_inicial || 0, locatario_atual_id: novoLocatario.id }).eq('placa', placa.toUpperCase());
        res.json({ success: true, novoLocatario });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- 2. GESTÃO DE FROTA & PILOTAGEM ---
router.get('/locatarios', async (req, res) => {
    try {
        const { data, error } = await supabase.from('locatarios').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/locatarios/:id/pagar-semana', async (req, res) => {
    try {
        const { id } = req.params;
        const { semanas_pagas, locafacil_coins } = req.body;
        const { data, error } = await supabase.from('locatarios').update({ semanas_pagas, locafacil_coins }).eq('id', id).select().single();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/locatarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase.from('locatarios').update(req.body).eq('id', id).select().single();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/rastreador', async (req, res) => {
    try {
        const { locatario_id, placa, semana, data_inicio, data_fim, km_anterior, km_atual, km_rodados, observacao } = req.body;
        await supabase.from('historico_km').insert([{ locatario_id, placa, semana, data_inicio, data_fim, km_anterior, km_atual, km_rodados, observacao }]);
        await supabase.from('locatarios').update({ km_atual }).eq('id', locatario_id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- 3. PÁTIO DE MOTOS ---
router.get('/motos', async (req, res) => {
    try {
        const { data, error } = await supabase.from('motos_frota').select('*, modelos_catalogo(imagem_url, nome_modelo)').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/motos', async (req, res) => {
    try {
        const { marca, modelo, cor, ano, placa, km_atual, status, imagem } = req.body;
        let { data: modExistente } = await supabase.from('modelos_catalogo').select('id').ilike('marca', marca).ilike('modelo', modelo).maybeSingle();
        let modeloId = modExistente ? modExistente.id : null;
        if (!modeloId) {
            const { data: novoMod, error: errMod } = await supabase.from('modelos_catalogo').insert([{ nome_modelo: `${marca} ${modelo}`, marca, modelo, categoria: 'Urbana / Delivery', imagem_url: imagem || null, ativo_vitrine: true }]).select().single();
            if (errMod) throw errMod;
            modeloId = novoMod.id;
        }
        const { error: errMoto } = await supabase.from('motos_frota').insert([{ modelo_id: modeloId, marca, modelo, cor, ano, placa: placa.toUpperCase(), km_atual, status }]);
        if (errMoto) throw errMoto;
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/motos/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const { error } = await supabase.from('motos_frota').update({ status }).eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/motos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('motos_frota').update(req.body).eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/motos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('motos_frota').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- 4. LOJA & CONFIGURAÇÕES ---
router.get('/config/:chave', async (req, res) => {
    try {
        const { data } = await supabase.from('configuracoes').select('valor').eq('chave', req.params.chave).maybeSingle();
        res.json({ valor: data ? data.valor : '10' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/config', async (req, res) => {
    try {
        const { chave, valor } = req.body;
        const { error } = await supabase.from('configuracoes').upsert({ chave, valor }, { onConflict: 'chave' });
        if (error) throw error;
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/loja', async (req, res) => {
    try {
        const { data, error } = await supabase.from('loja_resgate').select('*').order('custo_coins', { ascending: true });
        if (error) throw error;
        res.json(data);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/loja', async (req, res) => {
    try {
        const { titulo, custo_coins } = req.body;
        const { error } = await supabase.from('loja_resgate').insert([{ titulo, custo_coins, ativo: true }]);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/loja/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { custo_coins } = req.body;
        const { error } = await supabase.from('loja_resgate').update({ custo_coins }).eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/loja/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('loja_resgate').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- 5. GESTÃO DE PLANOS & PREÇOS ---

// Rota Pública: Retorna os planos ativos de um modelo específico
router.get('/agendamento/planos/:modelo', async (req, res) => {
    try {
        const { modelo } = req.params;
        const { data, error } = await supabase
            .from('planos')
            .select('*')
            .eq('modelo_nome', decodeURIComponent(modelo))
            .eq('ativo', true);

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Rotas Administrativas: (CORRIGIDO PARA /planos para evitar duplicidade)
// --- 5. GESTÃO DE PLANOS & PREÇOS ---

// Rota Nova (Busca flexível que encontra 'Start' dentro de 'Honda CG 160 Start')
router.get('/agendamento/planos/:modelo', async (req, res) => {
    try {
        const { modelo } = req.params;
        const modeloTexto = decodeURIComponent(modelo).trim();

        // Tenta buscar com busca parcial ilike
        const { data, error } = await supabase
            .from('planos')
            .select('*')
            .ilike('modelo_nome', `%${modeloTexto}%`)
            .eq('ativo', true);

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Rotas Administrativas de Planos
router.get('/planos', async (req, res) => {
    try {
        const { data, error } = await supabase.from('planos').select('*').order('modelo_nome');
        if (error) throw error;
        res.json(data);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/planos', async (req, res) => {
    try {
        const { modelo_nome, nome_plano, valor_semanal, valor_caucao, is_recomendado } = req.body;
        const { error } = await supabase.from('planos').insert([{
            modelo_nome, nome_plano, valor_semanal, valor_caucao: valor_caucao || 1099.00, is_recomendado: is_recomendado || false, ativo: true
        }]);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/planos/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('planos').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Atualizar um plano existente
router.put('/planos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { modelo_nome, nome_plano, valor_semanal, valor_caucao, is_recomendado } = req.body;
        
        const { data, error } = await supabase
            .from('planos')
            .update({ modelo_nome, nome_plano, valor_semanal, valor_caucao, is_recomendado })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// --- REGISTRAR NOVA TRANSAÇÃO FINANCEIRA ---
router.post('/financeiro/transacoes', async (req, res) => {
    try {
        const { data_transacao, tipo, categoria, descricao, valor } = req.body;

        if (!tipo || !categoria || !valor) {
            return res.status(400).json({ error: 'Tipo, categoria e valor são obrigatórios.' });
        }

        const { data, error } = await supabase
            .from('transacoes_financeiras')
            .insert([{
                data_transacao: data_transacao || new Date().toISOString().split('T')[0],
                tipo,
                categoria,
                descricao: descricao || null,
                valor: parseFloat(valor)
            }])
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, message: 'Lançamento registrado com sucesso!', data });
    } catch (err) {
        console.error('Erro ao salvar transação:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- RESUMO DA DRE EM TEMPO REAL ---
router.get('/financeiro/resumo-dre', async (req, res) => {
    try {
        // Pega o primeiro e último dia do mês atual
        const agora = new Date();
        const primeiroDiaMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString().split('T')[0];
        const ultimoDiaMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).toISOString().split('T')[0];

        // Busca todas as transações do mês
        const { data: transacoes, error } = await supabase
            .from('transacoes_financeiras')
            .select('*')
            .gte('data_transacao', primeiroDiaMes)
            .lte('data_transacao', ultimoDiaMes);

        if (error) throw error;

        // Calculadores de Totais
        let faturamentoBruto = 0;
        let opexTotal = 0;
        let dividasCapital = 0;
        let proLabore = 0;

        (transacoes || []).forEach(t => {
            const val = parseFloat(t.valor) || 0;
            if (t.tipo === 'ENTRADA') {
                faturamentoBruto += val;
            } else if (t.tipo === 'SAIDA') {
                if (t.categoria.includes('Pró-Labore')) {
                    proLabore += val;
                } else if (t.categoria.includes('Financiamento') || t.categoria.includes('Empréstimo') || t.categoria.includes('Dívida')) {
                    dividasCapital += val;
                } else {
                    opexTotal += val;
                }
            }
        });

        // Saldo da Reserva PJ (Entradas - Saídas)
        const totalSaidas = opexTotal + dividasCapital + proLabore;
        const reservaLiquidaPJ = faturamentoBruto - totalSaidas;

        res.json({
            success: true,
            faturamentoBruto,
            opexTotal,
            dividasCapital,
            proLabore,
            reservaLiquidaPJ,
            totalLancamentos: (transacoes || []).length
        });

    } catch (err) {
        console.error('Erro ao calcular DRE:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;