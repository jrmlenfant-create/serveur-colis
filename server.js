const express = require('express');
const webpush = require('web-push');
const cron = require('node-cron');
const axios = require('axios');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(cors());

// Connexion à Supabase
const SUPABASE_URL = 'VOTRE_SUPABASE_PROJECT_URL';
const SUPABASE_SERVICE_KEY = 'VOTRE_SUPABASE_SERVICE_ROLE_KEY';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Configuration Push VAPID
const vapidKeys = webpush.generateVapidKeys();
webpush.setVapidDetails(
  'mailto:contact@moncolis.app',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Obtenir la clé VAPID publique pour l'application iPhone
app.get('/api/vapidPublicKey', (req, res) => {
  res.send(vapidKeys.publicKey);
});

// Ajouter/Abonner un nouveau colis
app.post('/api/suivre', async (req, res) => {
  const { trackingNumber, subscription } = req.body;

  if (!trackingNumber || !subscription) {
    return res.status(400).json({ error: 'Données manquantes' });
  }

  try {
    // Insérer dans la base de données Supabase
    const { error } = await supabase.from('suivis').insert([
      {
        tracking_number: trackingNumber,
        subscription: subscription,
        last_status: 'En attente'
      }
    ]);

    if (error) throw error;

    res.status(200).json({ message: 'Suivi enregistré avec succès !' });
  } catch (err) {
    console.error('Erreur Supabase :', err);
    res.status(500).json({ error: 'Erreur d\'enregistrement' });
  }
});

// Tâche automatique (Cron) toutes les 30 minutes
cron.schedule('*/30 * * * *', async () => {
  console.log('🔄 Vérification globale des colis...');

  try {
    // Récupérer tous les colis enregistrés en BDD
    const { data: suivis, error } = await supabase.from('suivis').select('*');
    if (error || !suivis) return;

    for (let item of suivis) {
      try {
        const response = await axios.get(`https://api.statustracker.ordertracker.com/v1/track/${item.tracking_number}`);

        if (response.data && response.data.status) {
          const nouveauStatut = response.data.status;

          // Si le statut a évolué, notifier SEULEMENT la personne qui suit ce colis
          if (nouveauStatut !== item.last_status) {
            await supabase
              .from('suivis')
              .update({ last_status: nouveauStatut })
              .eq('id', item.id);

            const payload = JSON.stringify({
              title: '📦 Mise à jour Colis',
              body: `${item.tracking_number} : ${nouveauStatut}`
            });

            webpush.sendNotification(item.subscription, payload).catch(e => console.error(e));
          }
        }
      } catch (e) {
        console.log(`Erreur suivi ${item.tracking_number}`);
      }
    }
  } catch (err) {
    console.error('Erreur Cron :', err);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur multi-utilisateurs actif sur le port ${PORT}`));
