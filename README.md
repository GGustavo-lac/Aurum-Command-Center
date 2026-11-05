# AURUM — Command Center

Painel web para centralizar empreendimentos, receitas, despesas, lucro operacional, tarefas, estoque, aplicações, fotos e acompanhamento de metas. Inclui copiloto de IA via Netlify Function e trilha musical do mood do dia.

## O que já está incluído

- **Visão geral:** faturamento, despesas, lucro operacional, margem, capital aplicado, gráfico de seis meses, portfólio, metas e últimas movimentações.
- **Empreendimentos:** múltiplos nichos independentes, edição de metas (incluindo 1.000 seguidores), fotos e visão financeira por projeto. O painel inicia com TikTok Shop e Importação de celulares, sem faturamento fictício.
- **Financeiro:** livro-caixa com receitas e despesas, vínculo por empreendimento, comprovante em foto e exportação CSV.
- **Estoque:** produtos, quantidade, custo de compra, frete/logística, impostos/taxas por unidade, custo posto estimado, preço de venda, status logístico e margem potencial estimada.
- **Tarefas:** prioridades, prazos e acompanhamento de conclusão.
- **Aplicações:** registro manual de principal e valor atual, rendimento informado separado da operação.
- **Mood do dia:** seis estados de humor e recomendação de música com link de busca no Spotify.
- **Copiloto IA:** conversa em português; pode propor lançamentos, tarefas, atualização de seguidores/vídeos/visualizações, produtos, aplicações e novos negócios. As sugestões precisam ser confirmadas antes de gravar.
- **Persistência:** modo local por padrão; ao configurar Supabase, login por e-mail/senha e sincronização do workspace JSON na nuvem. Mantém cópia local e backup JSON.

## Configurar banco de dados Supabase

1. Crie um projeto em [Supabase](https://supabase.com/).
2. Abra **SQL Editor** e execute os scripts `supabase/migrations/001_aurum_workspaces.sql` e `supabase/migrations/002_aurum_workspace_sync.sql` (o segundo cria a tabela usada pela sincronização do painel).
3. Em **Project Settings → API**, copie a **Project URL** e a chave **publishable** (ou `anon` legada).
4. Confira `public/supabase-config.js`: ele já está preenchido com o Project URL e a publishable key fornecidos para este projeto.
5. Publique novamente na Netlify. Na primeira abertura, crie sua conta com e-mail e senha. Se a confirmação de e-mail estiver habilitada, confirme o e-mail antes de entrar.

A tabela `public.aurum_workspaces` armazena um documento JSON por usuário. Row Level Security (RLS) está habilitada e as políticas limitam SELECT/INSERT/UPDATE ao `auth.uid()` do usuário autenticado. A chave publishable/anon pode ficar no frontend **somente porque RLS está ativa**. Nunca coloque a chave `service_role` no navegador ou no Git.

No primeiro login sem workspace remoto, os dados locais atuais são enviados para a nuvem. Em logins seguintes, o workspace remoto passa a ser a fonte de dados e é carregado no painel. As alterações são sincronizadas automaticamente após uma pequena pausa.

## Rodar localmente

Para desenvolvimento local, use Node.js 22+ e uma conta Netlify para testar a Function com IA.

```bash
npm run dev
```

O comando usa `netlify-cli` via `npx`; ele pode solicitar autorização/login para recursos locais da Netlify. Sem `OPENAI_API_KEY` e `AURUM_ACCESS_CODE`, o painel funciona com um assistente local simplificado; a IA completa só responde após as duas variáveis serem configuradas.

## Publicar na Netlify

1. Envie a pasta deste projeto para um repositório Git (GitHub, GitLab ou Bitbucket).
2. Na Netlify, escolha **Add new site → Import an existing project** e conecte o repositório.
3. Configure:
   - **Build command:** deixe vazio (site estático, sem etapa de compilação).
   - **Publish directory:** `public`
   - **Functions directory:** `netlify/functions` (também definido em `netlify.toml`).
4. Em **Site configuration → Environment variables**, adicione:
   - `OPENAI_API_KEY` = sua chave secreta da API OpenAI.
   - `OPENAI_MODEL` = `gpt-5.4-mini` (opcional; pode manter o padrão do código).
   - `AURUM_ACCESS_CODE` = crie um código privado longo para proteger o endpoint da IA.
5. Faça o deploy. Depois de alterar variáveis de ambiente, faça um novo deploy para que a Function receba os valores. Garanta que o escopo da variável inclua **Functions**. No chat, clique em **Acesso IA** e informe o mesmo `AURUM_ACCESS_CODE`.

**Importante:** crie a chave em sua conta da API e mantenha-a somente nas variáveis de ambiente da Netlify. Nunca coloque a chave em `app.js`, `index.html`, em variáveis `VITE_*` ou em qualquer arquivo público. O endpoint também exige `AURUM_ACCESS_CODE` para reduzir chamadas não autorizadas; esse código é digitado no botão **Acesso IA**, e não substitui a chave OpenAI. O navegador chama `/api/assistant`; a Netlify encaminha para a Function no servidor.

## Dados e privacidade

- Sem configurar Supabase, os registros ficam somente no armazenamento local do navegador. Com Supabase configurado, o acesso exige conta autenticada e os dados são sincronizados na nuvem com RLS. O código `AURUM_ACCESS_CODE` protege somente o endpoint de IA; ele não substitui o login.
- Quando você usa o copiloto com IA ativada, um resumo dos seus empreendimentos, lançamentos recentes, tarefas, estoque e aplicações é enviado à API da OpenAI para contextualizar a resposta. Use apenas dados que você esteja confortável em processar dessa forma.
- Exporte o backup JSON regularmente. Limpar os dados do navegador ou trocar de aparelho pode apagar os registros locais.
- Fotos são redimensionadas e comprimidas antes de serem guardadas no navegador; ainda assim, muitas imagens podem consumir o limite de armazenamento local. Faça backups.
- Os valores de aplicações são digitados por você. O sistema não se conecta à corretora, não calcula impostos e não é recomendação de investimento.

## Limitações da primeira versão

- A sincronização atual salva o workspace completo como JSON por usuário; não é ainda um modelo relacional separado por tabela nem oferece colaboração multiusuário no mesmo empreendimento.
- TikTok Shop, fornecedores, rastreamento internacional, bancos e corretoras não são conectados automaticamente.
- O lucro operacional mostrado é **receitas registradas menos despesas registradas**; não substitui contabilidade, impostos, taxas da plataforma, câmbio, frete ou tributos de importação que ainda não tenham sido lançados.
- O custo posto e a margem do estoque são estimativas baseadas nos campos que você preencher (compra + logística + impostos/taxas por unidade).
