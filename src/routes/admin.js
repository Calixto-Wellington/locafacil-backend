// ======================================================
// ROUTER ADMINISTRATIVO CENTRALIZADO - admin.js
// ======================================================

import { Router } from 'express';
import { supabase } from '../config/supabase.js';

const router = Router();

// ======================================================
// 1. MESA DE APROVAÇÃO (LEADS & CADASTROS)
// ======================================================

// Listar fichas/leads com filtro por status
router.get('/leads', async (req, res) => {
    try {
        const { status } = req.query;
        let query = supabase.from('cadastros_funil').select('*').order('created_at', { ascending: false });
        if (status && status !== 'TODOS') query = query.eq('status', status);

        const { data, error } = await query;
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Atualizar status da ficha (APROVADO, REJEITADO, etc.)
router.patch('/leads/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, motivo_recusa } = req.body;
        const updateData = { status };
        if (motivo_recusa) updateData.motivo_recusa = motivo_recusa;

        const { data, error } = await supabase.from('cadastros_funil').update(updateData).eq('id', id).select();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Efetivar contrato: Passa lead para CONTRATADO, cria locatário e vincula moto
router.post('/leads/:id/efetivar', async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, cpf, telefone, email, moto_interesse, placa, km_inicial } = req.body;

        const { data: novoLocatario, error: errLoc } = await supabase
            .from('locatarios')
            .insert([{
                nome,
                cpf,
                telefone,
                email,
                placa: placa.toUpperCase(),
                modelo: moto_interesse || 'Honda CG 160 Start',
                semanas_pagas: 0,
                km_inicial: km_inicial || 0,
                km_atual: km_inicial || 0,
                locafacil_coins: 0
            }])
            .select()
            .single();

        if (errLoc) throw errLoc;

        await supabase.from('cadastros_funil').update({ status: 'CONTRATADO' }).eq('id', id);
        await supabase.from('motos_frota').update({ 
            status: 'ALUGADA', 
            km_atual: km_inicial || 0, 
            locatario_atual_id: novoLocatario.id 
        }).eq('placa', placa.toUpperCase());

        res.json({ success: true, novoLocatario });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ======================================================
// 2. GESTÃO DE FROTA & LOCATÁRIOS
// ======================================================

// Listar todos os locatários da frota com os dados de manutenção atualizados
router.get('/locatarios', async (req, res) => {
    try {
        const { data: locatarios, error: errLoc } = await supabase
            .from('locatarios')
            .select('*')
            .order('created_at', { ascending: false });

        if (errLoc) throw errLoc;

        // 1. Busca histórico de manutenção de peças salvo no Supabase
        const { data: manutencoes } = await supabase
            .from('manutencoes_componentes')
            .select('*');

        // 2. Anexa as peças gravadas em cada moto correspondente pela placa
        const listaComComponentes = (locatarios || []).map(loc => {
            const placaNorm = (loc.placa || '').toUpperCase().trim();
            const pecasDaMoto = (manutencoes || []).filter(m => (m.placa || '').toUpperCase().trim() === placaNorm);
            return {
                ...loc,
                componentes: pecasDaMoto
            };
        });

        res.json(listaComComponentes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Baixa de Pix: Incrementa semana paga e soma moedas
router.post('/locatarios/:id/pagar-semana', async (req, res) => {
    try {
        const { id } = req.params;
        const { semanas_pagas, locafacil_coins } = req.body;
        const { data, error } = await supabase
            .from('locatarios')
            .update({ semanas_pagas, locafacil_coins })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Atualização de dados do piloto / locatário
router.put('/locatarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase.from('locatarios').update(req.body).eq('id', id).select().single();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Registro de telemetria / histórico de rodagem
router.post('/rastreador', async (req, res) => {
    try {
        const { locatario_id, placa, semana, data_inicio, data_fim, km_anterior, km_atual, km_rodados, observacao } = req.body;
        
        await supabase.from('historico_km').insert([{ 
            locatario_id, placa, semana, data_inicio, data_fim, km_anterior, km_atual, km_rodados, observacao 
        }]);
        
        await supabase.from('locatarios').update({ km_atual }).eq('id', locatario_id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ======================================================
// 3. TELEMETRIA E MANUTENÇÃO DE PEÇAS (COMPONENTES)
// ======================================================

// Registrar ou atualizar troca de componente (Óleo, Pneus, Relação)
router.post('/manutencao-componentes', async (req, res) => {
    try {
        const { placa, componente_id, km_troca, limite_km } = req.body;

        if (!placa || !componente_id || km_troca === undefined) {
            return res.status(400).json({ error: 'Placa, componente_id e km_troca são obrigatórios.' });
        }

        const { data, error } = await supabase
            .from('manutencoes_componentes')
            .upsert([
                { 
                    placa: placa.toUpperCase(), 
                    componente_id, 
                    km_troca: parseInt(km_troca, 10), 
                    limite_km: limite_km || 8000 
                }
            ], { onConflict: 'placa,componente_id' });

        if (error) throw error;
        res.json({ success: true, message: 'Troca de peça registrada com sucesso!', data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Consultar histórico de manutenção das peças
router.get('/manutencao-componentes', async (req, res) => {
    try {
        const { placa } = req.query;
        let query = supabase.from('manutencoes_componentes').select('*');
        
        if (placa) {
            query = query.eq('placa', placa.toUpperCase());
        }

        const { data, error } = await query;
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ======================================================
// 4. PÁTIO DE MOTOS
// ======================================================

// Listar todas as motos do pátio
router.get('/motos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('motos_frota')
            .select('*, modelos_catalogo(imagem_url, nome_modelo)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cadastrar nova moto no pátio
router.post('/motos', async (req, res) => {
    try {
        const { marca, modelo, cor, ano, placa, km_atual, status, imagem } = req.body;
        let { data: modExistente } = await supabase.from('modelos_catalogo').select('id').ilike('marca', marca).ilike('modelo', modelo).maybeSingle();
        let modeloId = modExistente ? modExistente.id : null;

        if (!modeloId) {
            const { data: novoMod, error: errMod } = await supabase
                .from('modelos_catalogo')
                .insert([{ nome_modelo: `${marca} ${modelo}`, marca, modelo, categoria: 'Urbana / Delivery', imagem_url: imagem || null, ativo_vitrine: true }])
                .select()
                .single();
            if (errMod) throw errMod;
            modeloId = novoMod.id;
        }

        const { error: errMoto } = await supabase
            .from('motos_frota')
            .insert([{ modelo_id: modeloId, marca, modelo, cor, ano, placa: placa.toUpperCase(), km_atual: km_atual || 0, status: status || 'DISPONIVEL' }]);

        if (errMoto) throw errMoto;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Alterar status da moto (DISPONIVEL, ALUGADA, MANUTENCAO)
router.patch('/motos/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const { error } = await supabase.from('motos_frota').update({ status }).eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Atualizar dados de uma moto
router.put('/motos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('motos_frota').update(req.body).eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Excluir moto do pátio
router.delete('/motos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('motos_frota').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ======================================================
// 5. GESTÃO DE PLANOS & PREÇOS
// ======================================================

// Busca flexível de planos por modelo para o site de agendamento
router.get('/agendamento/planos/:modelo', async (req, res) => {
    try {
        const { modelo } = req.params;
        const modeloTexto = decodeURIComponent(modelo).trim();

        const { data, error } = await supabase
            .from('planos')
            .select('*')
            .ilike('modelo_nome', `%${modeloTexto}%`)
            .eq('ativo', true);

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Listar todos os planos no Backoffice
router.get('/planos', async (req, res) => {
    try {
        const { data, error } = await supabase.from('planos').select('*').order('modelo_nome');
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cadastrar novo plano
router.post('/planos', async (req, res) => {
    try {
        const { modelo_nome, nome_plano, valor_semanal, valor_caucao, is_recomendado } = req.body;
        const { error } = await supabase.from('planos').insert([{
            modelo_nome,
            nome_plano,
            valor_semanal,
            valor_caucao: valor_caucao || 650.00,
            is_recomendado: is_recomendado || false,
            ativo: true
        }]);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Editar plano existente
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

// Excluir plano
router.delete('/planos/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('planos').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ======================================================
// 6. FINANCEIRO & DRE
// ======================================================

// Inserir transação financeira (Receita ou Despesa)
router.post('/financeiro/transacoes', async (req, res) => {
    try {
        const { descricao, categoria, tipo, valor, data_transacao, status, conta_bancaria } = req.body;
        const { data, error } = await supabase
            .from('transacoes_financeiras')
            .insert([{ descricao, categoria, tipo, valor, data_transacao, status, conta_bancaria }]);

        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Resumo DRE para o Backoffice
router.get('/financeiro/resumo-dre', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('transacoes_financeiras')
            .select('*')
            .order('data_transacao', { ascending: false });

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ======================================================
// 7. LOJA DE RECOMPENSAS & CONFIGURAÇÕES
// ======================================================

router.get('/config/:chave', async (req, res) => {
    try {
        const { chave } = req.params;
        const { data } = await supabase.from('configuracoes').select('valor').eq('chave', chave).maybeSingle();
        res.json({ valor: data ? data.valor : '10' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/config', async (req, res) => {
    try {
        const { chave, valor } = req.body;
        const { error } = await supabase.from('configuracoes').upsert({ chave, valor }, { onConflict: 'chave' });
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/loja', async (req, res) => {
    try {
        const { data, error } = await supabase.from('loja_resgate').select('*').order('custo_coins', { ascending: true });
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/loja', async (req, res) => {
    try {
        const { titulo, custo_coins } = req.body;
        const { error } = await supabase.from('loja_resgate').insert([{ titulo, custo_coins, ativo: true }]);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/loja/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('loja_resgate').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;