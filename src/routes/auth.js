import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'locafacil_secret_key_2026';

// Middleware para verificar se o usuário está logado
export const autenticarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });

    jwt.verify(token, JWT_SECRET, (err, usuario) => {
        if (err) return res.status(403).json({ error: 'Token inválido ou expirado.' });
        req.usuario = usuario;
        next();
    });
};

// Middleware exclusivo para verificar se é ADMIN (apenas você)
export const apenasAdmin = (req, res, next) => {
    if (req.usuario?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem realizar esta ação.' });
    }
    next();
};

// 1. Rota de Login
router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        const { data: usuario, error } = await supabase
            .from('usuarios_admin')
            .select('*')
            .eq('email', email.toLowerCase().trim())
            .eq('ativo', true)
            .maybeSingle();

        if (error || !usuario) return res.status(400).json({ error: 'Usuário ou senha inválidos.' });

        const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
        if (!senhaValida) return res.status(400).json({ error: 'Usuário ou senha inválidos.' });

        // Gera o token JWT com validade de 7 dias
        const token = jwt.sign(
            { id: usuario.id, nome: usuario.nome, email: usuario.email, role: usuario.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ success: true, token, usuario: { nome: usuario.nome, role: usuario.role } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Rota de Gerenciamento de Usuários (Apenas ADMIN)
router.get('/usuarios', autenticarToken, apenasAdmin, async (req, res) => {
    const { data } = await supabase.from('usuarios_admin').select('id, nome, email, role, ativo, created_at');
    res.json(data);
});

router.post('/usuarios', autenticarToken, apenasAdmin, async (req, res) => {
    try {
        const { nome, email, senha, role } = req.body;
        const senha_hash = await bcrypt.hash(senha, 10);

        const { error } = await supabase.from('usuarios_admin').insert([{
            nome, email: email.toLowerCase().trim(), senha_hash, role: role || 'OPERADOR'
        }]);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/usuarios/:id', autenticarToken, apenasAdmin, async (req, res) => {
    await supabase.from('usuarios_admin').delete().eq('id', req.params.id);
    res.json({ success: true });
});

export default router;