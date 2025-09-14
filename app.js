// Restaurant Chatbot - Versione indipendente
// Basato sulla struttura Voiceflow esportata

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// =========== CONFIGURAZIONE RISTORANTE ===========
const RESTAURANT_CONFIG = {
  name: "NOME_RISTORANTE",
  address: "INDIRIZZO",
  hours: "ORARI",
  menuCategories: ["Antipasti", "Primi", "Secondi", "Dolci"],
  deliveryCost: 3.50,
  minimumOrder: 15.00,
  phone: "123456789"
};

// =========== GESTIONE SESSIONI ===========
const sessions = new Map();

class ChatSession {
  constructor(userId) {
    this.userId = userId;
    this.currentAgent = 'greeting';
    this.data = {
      name: null,
      email: null,
      phone: null,
      orderType: null,
      orderItems: [],
      deliveryAddress: null,
      reservationDetails: null,
      total: 0
    };
    this.conversationHistory = [];
  }
}

// =========== AGENTI AI (basati su Voiceflow) ===========

const agents = {
  // Agent 1: Scelta richiesta principale
  greeting: {
    async process(session, userMessage) {
      const intent = await detectIntent(userMessage);
      
      if (intent.includes('ordine') || intent.includes('ordinare')) {
        session.currentAgent = 'orderSelection';
        return `Ciao! Benvenuto da ${RESTAURANT_CONFIG.name}! 
                Vedo che vuoi fare un ordine. Preferisci:
                - Consegna a domicilio
                - Ritiro al locale  
                - Asporto rapido`;
      }
      
      if (intent.includes('prenotazione') || intent.includes('tavolo')) {
        session.currentAgent = 'reservation';
        return `Perfetto! Ti aiuto con la prenotazione del tavolo.
                Per quante persone e per quando?`;
      }
      
      if (intent.includes('informazioni') || intent.includes('orari')) {
        session.currentAgent = 'info';
        return `Ti fornisco volentieri le informazioni su ${RESTAURANT_CONFIG.name}!
                Cosa vorresti sapere? Orari, menu, contatti o altro?`;
      }
      
      session.currentAgent = 'clarification';
      return `Ciao! Sono l'assistente di ${RESTAURANT_CONFIG.name}. 
              Come posso aiutarti oggi? Vuoi:
              • Ordinare cibo
              • Prenotare un tavolo  
              • Ricevere informazioni`;
    }
  },

  // Agent 2: Selezione tipo ordine
  orderSelection: {
    async process(session, userMessage) {
      if (userMessage.includes('domicilio')) {
        session.data.orderType = 'delivery';
        session.currentAgent = 'deliveryOrder';
        return `Perfetto! Ordine con consegna a domicilio.
                Cosa vorresti ordinare dal nostro menu?
                
                🍕 Pizze: Margherita (8€), Diavola (10€)
                🍝 Pasta: Carbonara (9€), Amatriciana (9€)
                🥗 Insalate: Caesar (7€), Mista (6€)`;
      }
      
      if (userMessage.includes('ritiro')) {
        session.data.orderType = 'pickup';
        session.currentAgent = 'pickupOrder';
        return `Ottima scelta! Ordine con ritiro al locale.
                Scegli dal menu e dimmi per che ora vorresti ritirare.`;
      }
      
      if (userMessage.includes('asporto')) {
        session.data.orderType = 'takeaway';
        session.currentAgent = 'takeawayOrder';
        return `Asporto rapido! Perfetto per chi ha fretta.
                Cosa posso preparati velocemente?`;
      }
      
      return `Non ho capito bene. Preferisci:
              1️⃣ Consegna a domicilio
              2️⃣ Ritiro al locale
              3️⃣ Asporto rapido`;
    }
  },

  // Agent 3: Gestione ordine domicilio
  deliveryOrder: {
    async process(session, userMessage) {
      // Estrai piatti dal messaggio
      const items = extractOrderItems(userMessage);
      if (items.length > 0) {
        session.data.orderItems = items;
        session.data.total = calculateTotal(items, RESTAURANT_CONFIG.deliveryCost);
        
        if (session.data.total < RESTAURANT_CONFIG.minimumOrder) {
          return `Il totale è €${session.data.total.toFixed(2)} ma l'ordine minimo 
                  per la consegna è €${RESTAURANT_CONFIG.minimumOrder}.
                  Vuoi aggiungere qualcosa?`;
        }
        
        return `Ordine: ${items.map(i => i.name).join(', ')}
                Totale: €${session.data.total.toFixed(2)} (inclusa consegna €${RESTAURANT_CONFIG.deliveryCost})
                
                Ora ho bisogno dell'indirizzo di consegna.`;
      }
      
      // Se non ci sono items, chiedi l'indirizzo
      if (session.data.orderItems.length > 0 && !session.data.deliveryAddress) {
        session.data.deliveryAddress = userMessage;
        session.currentAgent = 'collectCustomerData';
        return `Indirizzo registrato: ${userMessage}
                
                Per completare l'ordine ho bisogno di:
                - Nome completo
                - Numero di telefono
                - Email`;
      }
      
      return `Cosa vorresti ordinare? Dimmi i piatti che ti interessano.`;
    }
  },

  // Agent 4: Raccolta dati cliente
  collectCustomerData: {
    async process(session, userMessage) {
      if (!session.data.name && containsName(userMessage)) {
        session.data.name = extractName(userMessage);
        return `Grazie ${session.data.name}! Ora il numero di telefono?`;
      }
      
      if (!session.data.phone && containsPhone(userMessage)) {
        session.data.phone = extractPhone(userMessage);
        return `Numero registrato. Ultima cosa: la tua email?`;
      }
      
      if (!session.data.email && containsEmail(userMessage)) {
        session.data.email = extractEmail(userMessage);
        session.currentAgent = 'confirmation';
        
        // Salva su Google Sheets (simulato)
        await saveToGoogleSheets(session.data);
        
        return `Perfetto! Riepilogo ordine:
                
                👤 ${session.data.name} - ${session.data.phone}
                📍 ${session.data.deliveryAddress}
                🍽️ ${session.data.orderItems.map(i => i.name).join(', ')}
                💰 Totale: €${session.data.total.toFixed(2)}
                
                Confermi l'ordine? Il ristorante riceverà la notifica immediatamente.`;
      }
      
      return `Ho bisogno ancora di ${getMissingData(session.data).join(' e ')}.`;
    }
  },

  // Agent 5: Informazioni ristorante
  info: {
    async process(session, userMessage) {
      if (userMessage.includes('orari')) {
        return `🕐 Orari di ${RESTAURANT_CONFIG.name}:
                ${RESTAURANT_CONFIG.hours}
                
                Altro che vuoi sapere?`;
      }
      
      if (userMessage.includes('menu')) {
        return `📋 Le nostre categorie:
                ${RESTAURANT_CONFIG.menuCategories.join('\n')}
                
                Vuoi fare un ordine ora?`;
      }
      
      if (userMessage.includes('indirizzo') || userMessage.includes('dove')) {
        return `📍 Ci trovi in: ${RESTAURANT_CONFIG.address}
                
                Vuoi prenotare un tavolo?`;
      }
      
      return `Ti posso dare informazioni su:
              • Orari di apertura
              • Menu e prezzi
              • Indirizzo e contatti
              • Modalità di ordine e consegna`;
    }
  },

  // Agent 6: Prenotazione tavolo
  reservation: {
    async process(session, userMessage) {
      const reservationData = extractReservationData(userMessage);
      
      if (reservationData.people && reservationData.date) {
        session.data.reservationDetails = reservationData;
        session.currentAgent = 'collectCustomerData';
        
        return `Prenotazione per ${reservationData.people} persone 
                il ${reservationData.date} alle ${reservationData.time || '20:00'}.
                
                Ora ho bisogno dei tuoi dati:
                - Nome completo
                - Numero di telefono`;
      }
      
      return `Per la prenotazione ho bisogno di:
              - Numero di persone
              - Data e orario preferito
              
              Esempio: "Tavolo per 4 persone sabato alle 20:00"`;
    }
  }
};

// =========== FUNZIONI HELPER ===========

async function detectIntent(message) {
  // Simulazione NLP - in produzione usa OpenAI/Dialogflow
  const keywords = {
    order: ['ordine', 'ordinare', 'cibo', 'pizza', 'pasta'],
    reservation: ['prenotazione', 'tavolo', 'prenotare'],
    info: ['informazioni', 'orari', 'indirizzo', 'menu']
  };
  
  const lowerMessage = message.toLowerCase();
  for (const [intent, words] of Object.entries(keywords)) {
    if (words.some(word => lowerMessage.includes(word))) {
      return intent;
    }
  }
  return 'unclear';
}

function extractOrderItems(message) {
  // Estrazione piatti - logica semplificata
  const items = [];
  if (message.includes('margherita')) items.push({name: 'Pizza Margherita', price: 8});
  if (message.includes('diavola')) items.push({name: 'Pizza Diavola', price: 10});
  if (message.includes('carbonara')) items.push({name: 'Pasta Carbonara', price: 9});
  return items;
}

function calculateTotal(items, deliveryCost = 0) {
  return items.reduce((sum, item) => sum + item.price, 0) + deliveryCost;
}

function containsName(message) {
  return /nome|sono|mi chiamo/i.test(message);
}

function extractName(message) {
  const match = message.match(/(?:nome|sono|mi chiamo)\s+(\w+)/i);
  return match ? match[1] : message.split(' ')[0];
}

function containsPhone(message) {
  return /\d{3}/.test(message);
}

function extractPhone(message) {
  return message.match(/\d+/g)?.join('') || '';
}

function containsEmail(message) {
  return /@/.test(message);
}

function extractEmail(message) {
  return message.match(/\S+@\S+\.\S+/)?.[0] || '';
}

function getMissingData(data) {
  const missing = [];
  if (!data.name) missing.push('nome');
  if (!data.phone) missing.push('telefono');
  if (!data.email) missing.push('email');
  return missing;
}

function extractReservationData(message) {
  // Estrazione dati prenotazione - versione semplificata
  const people = message.match(/(\d+)\s*person/i)?.[1];
  const date = message.match(/(lunedi|martedi|sabato|domenica|\d{1,2}\/\d{1,2})/i)?.[0];
  const time = message.match(/(\d{1,2}:?\d{0,2})/)?.[0];
  
  return { people, date, time };
}

async function saveToGoogleSheets(data) {
  // Simulazione salvataggio - implementa con Google Sheets API
  console.log('Salvando su Google Sheets:', data);
  // In produzione: chiamata API a Google Sheets
}

// =========== API ENDPOINTS ===========

app.post('/chat', async (req, res) => {
  try {
    const { userId, message } = req.body;
    
    if (!sessions.has(userId)) {
      sessions.set(userId, new ChatSession(userId));
    }
    
    const session = sessions.get(userId);
    session.conversationHistory.push({ user: message, timestamp: new Date() });
    
    const currentAgent = agents[session.currentAgent];
    const response = await currentAgent.process(session, message);
    
    session.conversationHistory.push({ bot: response, timestamp: new Date() });
    
    res.json({
      response,
      currentAgent: session.currentAgent,
      sessionData: session.data
    });
    
  } catch (error) {
    console.error('Errore:', error);
    res.status(500).json({ error: 'Errore del server' });
  }
});

// Endpoint per servire il frontend
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>${RESTAURANT_CONFIG.name} - Chatbot</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
            .chat-container { border: 1px solid #ddd; height: 400px; overflow-y: scroll; padding: 10px; margin-bottom: 10px; }
            .message { margin: 10px 0; padding: 10px; border-radius: 10px; }
            .user { background: #007bff; color: white; text-align: right; }
            .bot { background: #f1f1f1; color: black; }
            .input-area { display: flex; }
            .input-area input { flex: 1; padding: 10px; }
            .input-area button { padding: 10px 20px; }
        </style>
    </head>
    <body>
        <h1>🍕 ${RESTAURANT_CONFIG.name}</h1>
        <div class="chat-container" id="chat"></div>
        <div class="input-area">
            <input type="text" id="messageInput" placeholder="Scrivi un messaggio..." onkeypress="if(event.key==='Enter') sendMessage()">
            <button onclick="sendMessage()">Invia</button>
        </div>
        
        <script>
            const userId = Math.random().toString(36).substr(2, 9);
            
            async function sendMessage() {
                const input = document.getElementById('messageInput');
                const message = input.value.trim();
                if (!message) return;
                
                addMessage(message, 'user');
                input.value = '';
                
                try {
                    const response = await fetch('/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId, message })
                    });
                    
                    const data = await response.json();
                    addMessage(data.response, 'bot');
                    
                } catch (error) {
                    addMessage('Errore di connessione', 'bot');
                }
            }
            
            function addMessage(text, sender) {
                const chat = document.getElementById('chat');
                const div = document.createElement('div');
                div.className = 'message ' + sender;
                div.innerHTML = text.replace(/\\n/g, '<br>');
                chat.appendChild(div);
                chat.scrollTop = chat.scrollHeight;
            }
            
            // Messaggio iniziale
            addMessage('Ciao! Benvenuto da ${RESTAURANT_CONFIG.name}! Come posso aiutarti?', 'bot');
        </script>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Chatbot ristorante in esecuzione su http://localhost:${PORT}`);
  console.log(`📊 Costi stimati: €5-10/mese invece di €50-100/mese con Voiceflow`);
});
