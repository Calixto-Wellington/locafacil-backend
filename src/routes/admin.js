// ======================================================
// ROUTER ADMINISTRATIVO CENTRALIZADO — routes/admin.js
// ======================================================

import { Router } from 'express';
import { supabase } from '../config/supabase.js';

const router = Router();

// ======================================================
// 1. MESA DE APROVAÇÃO (LEADS & FICHAS)
// ======================================================

// GET /api/admin/leads — Listar fichas com filtro por status
// GET /api/admin/leads — Listar fichas de cadastro (Mesa de Aprovação)
router.get('/leads', async (req, res) => {
    try {
        const { status } = req.query;
        let query = supabase.from('cadastros_funil').select('*').order('created_at', { ascending: false });

        // Aplica o filtro apenas se for um status válido e diferente de 'TODOS' ou 'undefined'
        if (status && status !== 'TODOS' && status !== 'undefined' && status !== 'null') {
            query = query.ilike('status', status.trim());
        }

        const { data, error } = await query;
        if (error) {
            console.error('Erro Supabase na busca de leads:', error);
            throw error;
        }

        return res.json(data || []);
    } catch (err) {
        console.error('Erro na rota GET /leads:', err);
        return res.status(500).json({ error: err.message });
    }
});

// PATCH /api/admin/leads/:id/status — Atualizar status da ficha
router.patch('/leads/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, motivo_recusa } = req.body;

        const updateData = { status };
        if (motivo_recusa) updateData.motivo_recusa = motivo_recusa;

        const { data, error } = await supabase
            .from('cadastros_funil')
            .update(updateData)
            .eq('id', id)
            .select();

        if (error) throw error;
        return res.json({ success: true, data });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/leads/:id/efetivar — Entregar moto e criar locatário
router.post('/leads/:id/efetivar', async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, cpf, telefone, email, moto_interesse, placa, km_inicial } = req.body;
        const placaFormatada = (placa || '').toUpperCase().trim();

        // 1. Inserir novo piloto na tabela de locatários
        const { data: novoLocatario, error: errLoc } = await supabase
            .from('locatarios')
            .insert([{
                nome,
                cpf,
                telefone,
                email,
                placa: placaFormatada,
                modelo: moto_interesse || 'Honda CG 160 Start',
                semanas_pagas: 0,
                semanas_totais: 182,
                tipo_contrato: 'OPCAO_COMPRA',
                km_inicial: parseInt(km_inicial, 10) || 0,
                km_atual: parseInt(km_inicial, 10) || 0,
                status: 'ATIVO'
            }])
            .select()
            .single();

        if (errLoc) throw errLoc;

        // 2. Marcar lead como CONTRATADO
        await supabase.from('cadastros_funil').update({ status: 'CONTRATADO' }).eq('id', id);

        // 3. Marcar moto no pátio como ALUGADA
        await supabase
            .from('motos_frota')
            .update({ status: 'ALUGADA', km_atual: parseInt(km_inicial, 10) || 0, locatario_atual_id: novoLocatario.id })
            .eq('placa', placaFormatada);

        return res.json({ success: true, novoLocatario });
    } catch (err) {
        console.error('Erro ao efetivar contrato:', err);
        return res.status(500).json({ error: err.message });
    }
});

// ======================================================
// 2. LOCATÁRIOS, FROTA ATIVA E RASTREADOR
// ======================================================

// GET /api/admin/locatarios — Listar locatários + peças vinculadas
router.get('/locatarios', async (req, res) => {
    try {
        const { status = 'ATIVO', busca } = req.query;
        let query = supabase.from('locatarios').select('*').order('created_at', { ascending: false });

        if (busca && busca.trim().length > 0) {
            const termo = busca.trim();
            query = query.or(`placa.ilike.%${termo}%,nome.ilike.%${termo}%,cpf.ilike.%${termo}%`);
        } else if (status && status !== 'TODOS') {
            query = query.eq('status', status);
        }

        const { data: locatarios, error: errLoc } = await query;
        if (errLoc) throw errLoc;

        const placas = (locatarios || []).map(l => l.placa).filter(Boolean);
        let manutencoes = [];

        if (placas.length > 0) {
            const { data: manData } = await supabase
                .from('manutencoes_componentes')
                .select('*')
                .in('placa', placas);
            manutencoes = manData || [];
        }

        const resultado = (locatarios || []).map(loc => ({
            ...loc,
            componentes: manutencoes.filter(m => m.placa === loc.placa)
        }));

        return res.json(resultado);
    } catch (err) {
        console.error('Erro na rota GET /locatarios:', err);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/locatarios/:id/pagamento — Baixa de Pix (+1 semana)
router.post('/locatarios/:id/pagamento', async (req, res) => {
    try {
        const { id } = req.params;
        const { semanas = 1 } = req.body;

        const { data: locatario, error: errBusca } = await supabase
            .from('locatarios')
            .select('semanas_pagas')
            .eq('id', id)
            .single();

        if (errBusca || !locatario) {
            return res.status(404).json({ error: 'Locatário não encontrado.' });
        }

        const novasSemanas = (locatario.semanas_pagas || 0) + parseInt(semanas, 10);

        const { data, error } = await supabase
            .from('locatarios')
            .update({ semanas_pagas: novasSemanas })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return res.json({ success: true, semanas_pagas: novasSemanas, data });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// PUT /api/admin/locatarios/:id — Editar card do piloto/contrato
router.put('/locatarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, placa, modelo, telefone, cpf, semanas_pagas, semanas_totais, km_atual, tipo_contrato } = req.body;

        const payload = {};
        if (nome !== undefined) payload.nome = nome;
        if (placa !== undefined) payload.placa = placa.toUpperCase().trim();
        if (modelo !== undefined) payload.modelo = modelo;
        if (telefone !== undefined) payload.telefone = telefone;
        if (cpf !== undefined) payload.cpf = cpf;
        if (semanas_pagas !== undefined) payload.semanas_pagas = parseInt(semanas_pagas, 10);
        if (semanas_totais !== undefined) payload.semanas_totais = parseInt(semanas_totais, 10);
        if (km_atual !== undefined) payload.km_atual = parseInt(km_atual, 10);
        if (tipo_contrato !== undefined) payload.tipo_contrato = tipo_contrato;

        const { data, error } = await supabase
            .from('locatarios')
            .update(payload)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return res.json({ success: true, data });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// PATCH /api/admin/locatarios/:id/arquivar — Arquivar contrato e liberar moto no pátio
router.patch('/locatarios/:id/arquivar', async (req, res) => {
    try {
        const { id } = req.params;
        const { motivo } = req.body;

        const { data: piloto, error: errBusca } = await supabase
            .from('locatarios')
            .select('placa')
            .eq('id', id)
            .single();

        if (errBusca) throw errBusca;

        const { error: errUpdateLoc } = await supabase
            .from('locatarios')
            .update({ status: 'ARQUIVADO', motivo_arquivamento: motivo || 'Encerramento de contrato' })
            .eq('id', id);

        if (errUpdateLoc) throw errUpdateLoc;

        if (piloto && piloto.placa) {
            await supabase
                .from('motos_frota')
                .update({ status: 'DISPONIVEL', locatario_atual_id: null })
                .eq('placa', piloto.placa.toUpperCase());
        }

        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// PATCH /api/admin/locatarios/:id/reativar — Reativar contrato arquivado
router.patch('/locatarios/:id/reativar', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('locatarios')
            .update({ status: 'ATIVO', motivo_arquivamento: null })
            .eq('id', id);

        if (error) throw error;
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/rastreador — Salvar histórico de telemetria / CSV Mobiltracker
router.post('/rastreador', async (req, res) => {
    try {
        const { locatario_id, placa, semana, data_inicio, data_fim, km_anterior, km_atual, km_rodados, observacao } = req.body;

        await supabase.from('historico_km').insert([{
            locatario_id,
            placa: (placa || '').toUpperCase(),
            semana: parseInt(semana, 10) || 0,
            data_inicio,
            data_fim,
            km_anterior: parseInt(km_anterior, 10) || 0,
            km_atual: parseInt(km_atual, 10) || 0,
            km_rodados: parseInt(km_rodados, 10) || 0,
            observacao: observacao || 'Telemetria / Mobiltracker'
        }]);

        await supabase.from('locatarios').update({ km_atual: parseInt(km_atual, 10) || 0 }).eq('id', locatario_id);

        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ======================================================
// 3. OFICINA & PEÇAS DE MANUTENÇÃO
// ======================================================

// GET /api/admin/manutencao-componentes — Listar peças
router.get('/manutencao-componentes', async (req, res) => {
    try {
        const { placa } = req.query;
        let query = supabase.from('manutencoes_componentes').select('*');
        if (placa) query = query.eq('placa', placa.toUpperCase().trim());

        const { data, error } = await query;
        if (error) throw error;
        return res.json(data || []);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/manutencao-componentes — Cadastrar ou Atualizar via Upsert
router.post('/manutencao-componentes', async (req, res) => {
    try {
        const { id, placa, nome, componente_id, km_troca, limite_km, data_troca } = req.body;

        const payload = {
            placa: (placa || '').toUpperCase().trim(),
            nome: nome || componente_id,
            componente_id: componente_id || (nome ? nome.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'peca'),
            km_troca: parseInt(km_troca, 10) || 0,
            limite_km: parseInt(limite_km, 10) || 5000,
            data_troca: data_troca || new Date().toISOString().split('T')
        };

        if (id) payload.id = id;

        const { data, error } = await supabase
            .from('manutencoes_componentes')
            .upsert([payload])
            .select();

        if (error) throw error;
        return res.json({ success: true, data });
    } catch (err) {
        console.error('Erro ao salvar componente:', err);
        return res.status(500).json({ error: err.message });
    }
});

// PUT /api/admin/manutencao-componentes/:id — Editar peça existente por ID
router.put('/manutencao-componentes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { placa, nome, componente_id, km_troca, limite_km, data_troca } = req.body;

        const payload = {
            placa: (placa || '').toUpperCase().trim(),
            nome: nome || componente_id,
            componente_id: componente_id || (nome ? nome.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'peca'),
            km_troca: parseInt(km_troca, 10) || 0,
            limite_km: parseInt(limite_km, 10) || 5000,
            data_troca: data_troca || new Date().toISOString().split('T')
        };

        const { data, error } = await supabase
            .from('manutencoes_componentes')
            .update(payload)
            .eq('id', id)
            .select();

        if (error) throw error;
        return res.json({ success: true, data });
    } catch (err) {
        console.error('Erro ao atualizar componente:', err);
        return res.status(500).json({ error: err.message });
    }
});

// DELETE /api/admin/manutencao-componentes/:id — Excluir peça por ID
router.delete('/manutencao-componentes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ error: 'ID do componente é obrigatório.' });

        const { error } = await supabase
            .from('manutencoes_componentes')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return res.json({ success: true });
    } catch (err) {
        console.error('Erro ao excluir componente:', err);
        return res.status(500).json({ error: err.message });
    }
});

// PATCH /api/admin/manutencao-componentes/:id/reset — Zerar contador da peça
router.patch('/manutencao-componentes/:id/reset', async (req, res) => {
    try {
        const { id } = req.params;
        const { km_troca, data_troca } = req.body;

        const { error } = await supabase
            .from('manutencoes_componentes')
            .update({
                km_troca: parseInt(km_troca, 10) || 0,
                data_troca: data_troca || new Date().toISOString().split('T')
            })
            .eq('id', id);

        if (error) throw error;
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ======================================================
// 4. PÁTIO DE MOTOS & INVENTÁRIO
// ======================================================

// GET /api/admin/motos — Listar todas as motos do pátio
router.get('/motos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('motos_frota')
            .select('*, modelos_catalogo(imagem_url, nome_modelo)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return res.json(data || []);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/motos — Cadastrar nova moto
router.post('/motos', async (req, res) => {
    try {
        const { marca, modelo, cor, ano, placa, km_atual, status, imagem } = req.body;

        let { data: modExistente } = await supabase
            .from('modelos_catalogo')
            .select('id')
            .ilike('marca', marca)
            .ilike('modelo', modelo)
            .maybeSingle();

        let modeloId = modExistente ? modExistente.id : null;

        if (!modeloId) {
            const { data: novoMod, error: errMod } = await supabase
                .from('modelos_catalogo')
                .insert([{
                    nome_modelo: `${marca} ${modelo}`,
                    marca,
                    modelo,
                    categoria: 'Urbana / Delivery',
                    imagem_url: imagem || null,
                    ativo_vitrine: true
                }])
                .select()
                .single();

            if (errMod) throw errMod;
            modeloId = novoMod.id;
        }

        const { error: errMoto } = await supabase
            .from('motos_frota')
            .insert([{
                modelo_id: modeloId,
                marca,
                modelo,
                cor,
                ano: parseInt(ano, 10) || 2025,
                placa: (placa || '').toUpperCase().trim(),
                km_atual: parseInt(km_atual, 10) || 0,
                status: status || 'DISPONIVEL'
            }]);

        if (errMoto) throw errMoto;
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// PATCH /api/admin/motos/:id/status — Alterar status da moto
router.patch('/motos/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const { error } = await supabase
            .from('motos_frota')
            .update({ status })
            .eq('id', id);

        if (error) throw error;
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// PUT /api/admin/motos/:id — Editar moto
router.put('/motos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('motos_frota').update(req.body).eq('id', id);

        if (error) throw error;
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// DELETE /api/admin/motos/:id — Excluir moto do pátio
router.delete('/motos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('motos_frota').delete().eq('id', id);

        if (error) throw error;
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ======================================================
// 5. GESTÃO DE PLANOS & VALORES
// ======================================================

// GET /api/admin/planos — Listar todos os planos de aluguel
router.get('/planos', async (req, res) => {
    try {
        const { data, error } = await supabase.from('planos').select('*');
        if (error) throw error;
        return res.json(data || []);
    } catch (err) {
        console.error('Erro na rota GET /planos:', err);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/planos — Criar plano
router.post('/planos', async (req, res) => {
    try {
        const { modelo_nome, nome_plano, valor_semanal, valor_caucao, is_recomendado } = req.body;

        const { error } = await supabase.from('planos').insert([{
            modelo_nome,
            nome_plano,
            valor_semanal: parseFloat(valor_semanal) || 0,
            valor_caucao: parseFloat(valor_caucao) || 1099.00,
            is_recomendado: is_recomendado || false,
            ativo: true
        }]);

        if (error) throw error;
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// PUT /api/admin/planos/:id — Editar plano
router.put('/planos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { modelo_nome, nome_plano, valor_semanal, valor_caucao, is_recomendado } = req.body;

        const { data, error } = await supabase
            .from('planos')
            .update({
                modelo_nome,
                nome_plano,
                valor_semanal: parseFloat(valor_semanal) || 0,
                valor_caucao: parseFloat(valor_caucao) || 1099.00,
                is_recomendado: is_recomendado || false
            })
            .eq('id', id)
            .select();

        if (error) throw error;
        return res.json({ success: true, data });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// DELETE /api/admin/planos/:id — Excluir plano
router.delete('/planos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('planos').delete().eq('id', id);
        if (error) throw error;
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ======================================================
// 6. LOJA COINS & CONFIGURAÇÕES
// ======================================================

// GET /api/admin/config/:chave — Obter configuração por chave
router.get('/config/:chave', async (req, res) => {
    try {
        const { chave } = req.params;
        const { data } = await supabase.from('configuracoes').select('valor').eq('chave', chave).maybeSingle();
        return res.json({ valor: data ? data.valor : '10' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/config — Salvar/atualizar configuração
router.post('/config', async (req, res) => {
    try {
        const { chave, valor } = req.body;
        const { error } = await supabase.from('configuracoes').upsert({ chave, valor }, { onConflict: 'chave' });
        if (error) throw error;
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/loja — Listar itens do catálogo da loja
router.get('/loja', async (req, res) => {
    try {
        const { data, error } = await supabase.from('loja_resgate').select('*');
        if (error) throw error;
        return res.json(data || []);
    } catch (err) {
        console.error('Erro na rota GET /loja:', err);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/loja — Adicionar item na loja
router.post('/loja', async (req, res) => {
    try {
        const { titulo, custo_coins } = req.body;
        const { error } = await supabase.from('loja_resgate').insert([{ titulo, custo_coins, ativo: true }]);
        if (error) throw error;
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// DELETE /api/admin/loja/:id — Remover item da loja
router.delete('/loja/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('loja_resgate').delete().eq('id', id);
        if (error) throw error;
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ======================================================
// 7. GESTÃO FINANCEIRA & RESUMO DRE
// ======================================================

// GET /api/admin/financeiro/transacoes — Listar lançamentos financeiros
router.get('/financeiro/transacoes', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('transacoes_financeiras')
            .select('*')
            .order('data_transacao', { ascending: false });

        if (error) throw error;
        return res.json(data || []);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/financeiro/transacoes — Registrar entrada/saída
router.post('/financeiro/transacoes', async (req, res) => {
    try {
        const { tipo, categoria, descricao, valor, data_transacao } = req.body;

        const { data, error } = await supabase
            .from('transacoes_financeiras')
            .insert([{
                tipo,
                categoria,
                descricao,
                valor: parseFloat(valor) || 0,
                data_transacao: data_transacao || new Date().toISOString().split('T')
            }])
            .select();

        if (error) throw error;
        return res.json({ success: true, data });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/financeiro/resumo-dre — Resumo DRE em tempo real
router.get('/financeiro/resumo-dre', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('transacoes_financeiras')
            .select('*');

        if (error) throw error;

        let faturamentoBruto = 0;
        let opexTotal = 0;
        let proLabore = 0;
        let dividas = 0;

        (data || []).forEach(item => {
            const val = parseFloat(item.valor) || 0;
            const cat = (item.categoria || '').toUpperCase();
            if (item.tipo === 'ENTRADA') {
                faturamentoBruto += val;
            } else if (item.tipo === 'SAIDA') {
                if (cat.includes('PRÓ-LABORE') || cat.includes('PRO-LABORE')) {
                    proLabore += val;
                } else if (cat.includes('PASSIVO') || cat.includes('DIVIDA') || cat.includes('EMPRÉSTIMO')) {
                    dividas += val;
                } else {
                    opexTotal += val;
                }
            }
        });

        const sobraLiquida = faturamentoBruto - (opexTotal + proLabore + dividas);
        const reservaLiquidaPJ = sobraLiquida;

        return res.json({
            faturamentoBruto,
            opexTotal,
            proLabore,
            dividas,
            sobraLiquida,
            reservaLiquidaPJ
        });
    } catch (err) {
        console.error('Erro no resumo DRE:', err);
        return res.status(500).json({ error: err.message });
    }
});

export default router;