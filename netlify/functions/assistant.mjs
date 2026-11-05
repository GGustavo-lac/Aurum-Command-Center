import { timingSafeEqual } from 'node:crypto';

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string' },
    action: {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['none','add_revenue','add_expense','create_task','update_followers','update_videos','update_views','create_project','add_stock','add_investment'] },
        projectName: { type: 'string' },
        amount: { type: 'number' },
        title: { type: 'string' },
        description: { type: 'string' },
        metricValue: { type: 'number' },
        date: { type: 'string' },
        unit: { type: 'string' }
      },
      required: ['type','projectName','amount','title','description','metricValue','date','unit']
    },
    track: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        artist: { type: 'string' },
        why: { type: 'string' },
        spotifyQuery: { type: 'string' },
        energy: { type: 'string' }
      },
      required: ['title','artist','why','spotifyQuery','energy']
    }
  },
  required: ['reply','action','track']
};

function response(statusCode, payload) {
  return { statusCode, headers: jsonHeaders, body: JSON.stringify(payload) };
}

function extractText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  const chunks = [];
  for (const item of data.output || []) {
    if (item.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) chunks.push(content.text);
    }
  }
  return chunks.join('\n');
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Método não permitido.' });
  if (!process.env.OPENAI_API_KEY) {
    return response(503, { error: 'A IA ainda não foi conectada. Configure OPENAI_API_KEY nas variáveis de ambiente da Netlify.' });
  }
  if (!process.env.AURUM_ACCESS_CODE) {
    return response(503, { error: 'Configure também AURUM_ACCESS_CODE na Netlify para proteger o acesso à IA.' });
  }

  let body;
  try {
    if ((event.body || '').length > 45000) return response(413, { error: 'Mensagem muito grande.' });
    body = JSON.parse(event.body || '{}');
  } catch {
    return response(400, { error: 'Corpo da requisição inválido.' });
  }

  const submittedCode = Buffer.from(String(body.accessCode || ''));
  const expectedCode = Buffer.from(process.env.AURUM_ACCESS_CODE);
  if (submittedCode.length !== expectedCode.length || !timingSafeEqual(submittedCode, expectedCode)) {
    return response(401, { error: 'Código de acesso da IA incorreto. Confira em Acesso IA.' });
  }

  const mode = body.mode === 'mood' ? 'mood' : 'chat';
  const message = String(body.message || '').slice(0, 5000);
  if (!message.trim()) return response(400, { error: 'Escreva uma mensagem.' });

  const context = body.context && typeof body.context === 'object' ? body.context : {};
  const safeContext = {
    projects: Array.isArray(context.projects) ? context.projects.slice(0, 30) : [],
    transactions: Array.isArray(context.transactions) ? context.transactions.slice(-30) : [],
    tasks: Array.isArray(context.tasks) ? context.tasks.slice(-30) : [],
    inventory: Array.isArray(context.inventory) ? context.inventory.slice(0, 40) : [],
    investments: Array.isArray(context.investments) ? context.investments.slice(0, 30) : []
  };
  const history = Array.isArray(body.history) ? body.history.slice(-10).map(item => ({
    role: item.role === 'assistant' ? 'assistant' : 'user',
    content: String(item.content || '').slice(0, 2500)
  })) : [];

  const instructions = `Você é a AURUM Intelligence, copiloto executivo de um jovem empreendedor brasileiro. Sempre chame a pessoa de "chefe", com naturalidade e respeito. Responda em português brasileiro, de forma clara, objetiva, inteligente e motivadora sem ser caricata.

Você recebe dados reais do painel local do usuário. Não invente faturamento, lucro, estoque, seguidores, prazos ou rentabilidade. Diferencie faturamento de lucro: receita menos despesas. Não trate dinheiro aplicado em investimentos como lucro operacional. Não diga que consultou bancos, corretoras, TikTok, fornecedores ou rastreamento externo.

Quando o usuário relatar claramente um fato ou pedir para registrar uma informação, proponha UMA ação estruturada e específica. Se faltarem dados essenciais ou houver ambiguidade de valor (por exemplo, "1000k" sem contexto), use action.type="none" e pergunte o que falta. Nunca transforme uma intenção hipotética em venda já realizada. Para receita use add_revenue; para despesa efetivamente paga use add_expense; para compromisso futuro use create_task; para atualizar seguidores use update_followers; para quantidade de vídeos publicados use update_videos; para visualizações já alcançadas use update_views; para novo negócio use create_project; para mercadoria/quantidade em estoque use add_stock; para dinheiro efetivamente aplicado use add_investment. Não crie uma ação só porque o usuário perguntou como fazer algo.

Ao preencher projectName, use exatamente um dos nomes recebidos no contexto, quando houver correspondência clara. Se não souber qual negócio é, deixe projectName vazio. amount é um número em reais sem símbolo. metricValue é um número. date deve ser YYYY-MM-DD apenas quando a data estiver explícita ou for inequívoca; caso contrário deixe vazio. Não invente preços, quantidades ou datas.

No modo mood, recomende uma música existente que combine com a situação e devolva title, artist, why, spotifyQuery e energy no objeto track. A faixa deve ser apropriada para um usuário adolescente; não recomende conteúdo explícito. No modo chat, deixe os campos de track vazios. A action deve ser none no modo mood.

Retorne somente o objeto que respeita o JSON Schema. `;

  const input = [
    ...history,
    { role: 'user', content: `CONTEXTO ATUAL DO PAINEL (dados fornecidos pelo navegador):\n${JSON.stringify(safeContext)}\n\nDATA LOCAL DO USUÁRIO: ${String(body.today || '').slice(0,10)}\nMODO: ${mode}\nMOOD SELECIONADO: ${String(body.mood || '').slice(0,40)}\n\nMENSAGEM ATUAL: ${message}` }
  ];

  try {
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
        instructions,
        input,
        text: { format: { type: 'json_schema', name: 'aurum_assistant_response', strict: true, schema } },
        max_output_tokens: 900
      })
    });
    const raw = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error('OpenAI API error', upstream.status, raw?.error?.message || 'unknown');
      return response(502, { error: 'A IA não conseguiu responder agora. Verifique a chave, os créditos e o modelo configurado.' });
    }
    const output = extractText(raw);
    let parsed;
    try { parsed = JSON.parse(output); }
    catch { return response(502, { error: 'A IA retornou uma resposta em formato inesperado.' }); }
    return response(200, parsed);
  } catch (error) {
    console.error('AURUM function error', error);
    return response(500, { error: 'Falha interna ao consultar a IA.' });
  }
};
