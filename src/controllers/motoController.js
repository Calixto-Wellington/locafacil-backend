export const listarMotos = async (req, res) => {
    try {
        // Lista estática direta, sem consultas ao Supabase
        const motos = [
            {
                id: 1,
                nome: "HONDA CG 160 START",
                imagem_url: "https://xbjwhjwqwmllbrybpycd.supabase.co/storage/v1/object/public/frota/moto-honda.png",
                planos: [
                    {
                        titulo: "Plano Semestral",
                        valor_diaria: "55,71",
                        valor_semanal: "390,00",
                        valor_caucao: "650,00"
                    },
                    {
                        titulo: "Plano Anual",
                        valor_diaria: "54,29",
                        valor_semanal: "380,00",
                        valor_caucao: "650,00"
                    },
                    {
                        titulo: "Plano Minha Locafacil<br>(42 meses)",
                        valor_diaria: "50,00",
                        valor_semanal: "350,00",
                        valor_caucao: "650,00",
                        observacao: "Toda manutenção por conta do locatário"
                    }
                ]
            },
            {
                id: 2,
                nome: "YAMAHA FACTOR 150 DX",
                imagem_url: "https://xbjwhjwqwmllbrybpycd.supabase.co/storage/v1/object/public/frota/factor.jpeg",
                planos: [
                    {
                        titulo: "Plano Semestral",
                        valor_diaria: "55,71",
                        valor_semanal: "390,00",
                        valor_caucao: "650,00"
                    },
                    {
                        titulo: "Plano Anual",
                        valor_diaria: "54,29",
                        valor_semanal: "380,00",
                        valor_caucao: "650,00"
                    },
                    {
                        titulo: "Plano Minha Locafacil<br>(42 meses)",
                        valor_diaria: "50,00",
                        valor_semanal: "350,00",
                        valor_caucao: "650,00",
                        observacao: "Toda manutenção por conta do locatário"
                    }
                ]
            }
        ];

        return res.status(200).json(motos);
    } catch (error) {
        console.error('Erro ao listar motos:', error.message);
        return res.status(500).json({ error: 'Erro interno ao buscar motos.' });
    }
};