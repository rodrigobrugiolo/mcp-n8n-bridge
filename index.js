import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('X-Accel-Buffering', 'no');
  next();
});

const server = new Server({
  name: 'n8n-mcp-bridge',
  version: '1.0.0'
}, {
  capabilities: { tools: {} }
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [{
      name: 'buscar_drive',
      description: 'Busca arquivos e documentos no Google Drive da empresa.',
      inputSchema: {
        type: 'object',
        properties: {
          termo_busca: { 
            type: 'string', 
            description: 'Palavra-chave para buscar no nome do arquivo' 
          }
        },
        required: ['termo_busca']
      }
    }]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'buscar_drive') {
    const args = request.params.arguments;
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL; 
    
    try {
      const n8nResponse = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      
      const data = await n8nResponse.json();
      
      return { 
        content: [{ type: 'text', text: JSON.stringify(data) }] 
      };
      
    } catch (error) {
      return { 
        content: [{ type: 'text', text: `Erro na automação: ${error.message}` }],
        isError: true 
      };
    }
  }
  
  throw new Error('Ferramenta não encontrada');
});

let transport;

app.get('/sse', async (req, res) => {
  const authHeader = req.headers.authorization;
  const myToken = process.env.MCP_AUTH_TOKEN;
  
  if (authHeader !== `Bearer ${myToken}`) {
    return res.status(401).send('Acesso Negado. Token Invalido.');
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  transport = new SSEServerTransport('/messages', res);
  await server.connect(transport);
});

app.post('/messages', async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`MCP Bridge rodando na porta ${PORT}`);
});
