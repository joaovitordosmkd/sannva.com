// Instalar dependências
// npm install vue vue-router vue-flow axios

import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import VueFlow from '@braks/vue-flow';
import 'vue-flow/dist/style.css';
import EditorFluxo from './components/EditorFluxo.vue';

const routes = [
  { path: '/', component: EditorFluxo }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

const app = createApp({});
app.use(router);
app.use(VueFlow);
app.mount('#app');

// Criando o componente EditorFluxo.vue
export default {
  components: { VueFlow },
  data() {
    return {
      nodes: [
        { id: '1', label: 'Início', position: { x: 250, y: 5 }, type: 'input' }
      ],
      edges: [],
      selectedNode: null,
      evolutionCredentials: { instance: '', key: '' },
      qrCodeUrl: ''
    };
  },
  methods: {
    addNode(type = 'message') {
      const newNode = {
        id: (this.nodes.length + 1).toString(),
        label: type === 'message' ? 'Nova Mensagem' : 'Botão de Resposta',
        position: { x: Math.random() * 400, y: Math.random() * 400 },
        type
      };
      this.nodes.push(newNode);
    },
    addEdge(source, target) {
      this.edges.push({ id: `edge-${source}-${target}`, source, target });
    },
    selectNode(node) {
      this.selectedNode = node;
    },
    updateNodeLabel(newLabel) {
      if (this.selectedNode) {
        this.selectedNode.label = newLabel;
      }
    },
    saveFlow() {
      const flowData = {
        nodes: this.nodes,
        edges: this.edges
      };
      axios.post('/api/saveFlow.php', flowData)
        .then(response => {
          console.log('Fluxo salvo com sucesso!', response.data);
        })
        .catch(error => {
          console.error('Erro ao salvar fluxo:', error);
        });
    },
    loadFlow() {
      axios.get('/api/loadFlow.php')
        .then(response => {
          this.nodes = response.data.nodes;
          this.edges = response.data.edges;
        })
        .catch(error => {
          console.error('Erro ao carregar fluxo:', error);
        });
    },
    integrateOpenAI(message) {
      axios.post('/api/openai.php', { message })
        .then(response => {
          console.log('Resposta OpenAI:', response.data);
          if (this.selectedNode) {
            this.selectedNode.label = response.data;
          }
        })
        .catch(error => {
          console.error('Erro na integração com OpenAI:', error);
        });
    },
    connectEvolution() {
      axios.post('/api/evolutionConnect.php', this.evolutionCredentials)
        .then(response => {
          this.qrCodeUrl = response.data.qrCodeUrl;
          console.log('Conectado à Evolution API:', response.data);
        })
        .catch(error => {
          console.error('Erro na conexão com Evolution API:', error);
        });
    },
    sendMessageWhatsApp(number, message) {
      axios.post('/api/evolutionSendMessage.php', { number, message, credentials: this.evolutionCredentials })
        .then(response => {
          console.log('Mensagem enviada via WhatsApp:', response.data);
        })
        .catch(error => {
          console.error('Erro ao enviar mensagem no WhatsApp:', error);
        });
    }
  },
  mounted() {
    this.loadFlow();
  }
};
