const express = require('express');
const webpush = require('web-push');
const cron = require('node-cron');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Génération automatique des clés Push en mémoire
const vapidKeys = webpush.generateVapidKeys();
webpush.setVapidDetails(
  'mailto:contact@moncolis.app',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Stockage en mémoire
let suivis = [];

// Route pour transmettre la clé publique VAPID à l'iPhone
app.get('/api/vapidPublicKey', (req, res) => {
  res.send(vapidKeys.publicKey);
});

// Route pour enregistrer un numéro de suivi
app.post('/api/suivre', (req, res) => {
  const { trackingNumber, subscription } = req.body;
  
  // On vérifie si le colis est déjà suivi
  const existe = suivis.find(s => s.trackingNumber === trackingNumber);
  if (!existe) {
    suivis.push({ trackingNumber, subscription, lastStatus: 'En attente' });
  }

  res.status(200).json({ message: 'Suivi activé avec succès !' });
});

// Vérification automatique toutes les 30 minutes (Sans API Payante)
cron.schedule('*/30 * * * *', async () => {
  console.log('🔄 Vérification des colis en cours...');

  for (let item of suivis) {
    try {
      // Utilisation d'un endpoint de suivi public universel
      const response = await axios.get(`https://api.statustracker.ordertracker.com/v1/track/${item.trackingNumber}`);
      
      if (response.data && response.data.status) {
        const nouveauStatut = response.data.status;

        // Si le statut a changé, on déclenche la notification push iOS
        if (nouveauStatut !== item.lastStatus) {
          item.lastStatus = nouveauStatut;

          const payload = JSON.stringify({
            title: '📦 Mise à jour de votre Colis',
            body: `${item.trackingNumber} : ${nouveauStatut}`
          });

          webpush.sendNotification(item.subscription, payload).catch(err => console.error(err));
        }
      }
    } catch (error) {
      console.log(`Vérification en cours pour ${item.trackingNumber}...`);
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur actif sur le port ${PORT}`));