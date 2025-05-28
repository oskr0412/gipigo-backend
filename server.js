const admin = require('firebase-admin');
const express = require('express');
const bodyParser = require('body-parser');

// **Asegúrate de que esta ruta sea correcta**
// **Configuración de Firebase usando variables de entorno**
const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
  universe_domain: "googleapis.com"
};
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// **Endpoint GET para verificar el estado del servidor**
app.get('/status', (req, res) => {
  res.status(200).send({ message: 'Servidor Gígigo en línea y funcionando correctamente desde Cagua!' });
});

// **NUEVO ENDPOINT: Notificar nueva orden a todos los repartidores**
app.post('/notify-new-order', async (req, res) => {
  const { ordenData } = req.body;

  if (!ordenData) {
    return res.status(400).send({ error: 'Se requieren los datos de la orden.' });
  }

  try {
    console.log('🟢 Iniciando notificación de nueva orden:', ordenData.numero_orden);

    // 1. Obtener todos los tokens de repartidores activos desde Firestore
    const db = admin.firestore();

    // *** NUEVO: Debugging detallado ***
    console.log('🔍 Iniciando búsqueda de repartidores...');

    // Primero buscar TODOS los usuarios con rol Repartidor (sin filtro de estado)
    const todosRepartidores = await db.collection('Users')
      .where('rol', '==', 'REPARTIDOR')  // *** CAMBIADO A MAYÚSCULAS ***
      .get();

    console.log(`🔍 Total de usuarios con rol "REPARTIDOR": ${todosRepartidores.size}`);

    if (todosRepartidores.empty) {
      console.log('❌ No se encontraron usuarios con rol "REPARTIDOR"');
      console.log('💡 Verifica que el campo "rol" sea exactamente "REPARTIDOR" (todo en mayúsculas)');
      return res.status(404).send({ message: 'No se encontraron repartidores en el sistema' });
    }

    // Mostrar información detallada de cada repartidor
    todosRepartidores.forEach((doc, index) => {
      const data = doc.data();
      console.log(`👤 Repartidor ${index + 1}:`);
      console.log(`   - ID: ${doc.id}`);
      console.log(`   - Nombre: ${data.nombre || 'Sin nombre'}`);
      console.log(`   - Rol: "${data.rol}"`);
      console.log(`   - Estado: "${data.estado}"`);
      console.log(`   - Tiene fcmToken: ${data.fcmToken ? 'SÍ' : 'NO'}`);
      if (data.fcmToken) {
        console.log(`   - FCM Token (primeros 20 chars): ${data.fcmToken.substring(0, 20)}...`);
      }
      console.log('');
    });

    // Ahora buscar específicamente los repartidores activos
    const repartidoresSnapshot = await db.collection('Users')
      .where('rol', '==', 'REPARTIDOR')  // *** CAMBIADO A MAYÚSCULAS ***
      .where('estado', '==', 'Activo')
      .get();

    console.log(`🔍 Repartidores con estado "Activo": ${repartidoresSnapshot.size}`);

    if (repartidoresSnapshot.empty) {
      console.log('⚠️ No se encontraron repartidores con estado "Activo"');
      console.log('💡 Verifica que:');
      console.log('   1. Los repartidores hayan hecho login');
      console.log('   2. El campo "estado" sea exactamente "Activo" (con A mayúscula)');
      console.log('   3. No haya espacios extra en el valor del estado');
      return res.status(404).send({ message: 'No hay repartidores activos disponibles' });
    }

    // 2. Extraer tokens FCM válidos
    const tokens = [];
    repartidoresSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`🔍 Procesando repartidor ${doc.id}:`);
      console.log(`   - Nombre: ${data.nombre || 'Sin nombre'}`);
      console.log(`   - FCM Token presente: ${data.fcmToken ? 'SÍ' : 'NO'}`);

      if (data.fcmToken && data.fcmToken.trim() !== '') {
        // Limpiar el token de comillas extra
        const cleanToken = data.fcmToken.replace(/['"]/g, '');
        console.log(`   - Token limpio (primeros 50 chars): ${cleanToken.substring(0, 50)}...`);
        tokens.push(cleanToken);
        console.log(`   ✅ Token agregado (total: ${tokens.length})`);
      } else {
        console.log(`   ❌ Token FCM inválido o vacío`);
      }
    });

    console.log(`📱 Total de tokens FCM válidos recolectados: ${tokens.length}`);

    if (tokens.length === 0) {
      console.log('❌ No se encontraron tokens FCM válidos');
      return res.status(404).send({ message: 'No hay repartidores con tokens FCM válidos' });
    }

    console.log(`📱 Enviando notificación a ${tokens.length} repartidores`);

    // 3. Preparar el mensaje de notificación
    const message = {
      notification: {
        title: '🚚 Nueva Orden Disponible',
        body: `Orden ${ordenData.numero_orden} - ${ordenData.cliente_nombre} - €${ordenData.precio}`,
      },
      data: {
        type: 'nueva_orden',
        orden_id: ordenData.numero_orden,
        cliente_nombre: ordenData.cliente_nombre || '',
        precio: ordenData.precio?.toString() || '0',
        distancia: ordenData.distanciaPedido?.toString() || '0',
        duracion: ordenData.duracionEstimadaMinutos?.toString() || '0',
        direccion_calle: ordenData.direccion?.calle || '',
        direccion_numero: ordenData.direccion?.numero || '',
        direccion_ciudad: ordenData.direccion?.ciudad || '',
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        notification: {
          channelId: 'orders_channel',
          priority: 'high',
          sound: 'notification',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'notification.wav',
            badge: 1,
          },
        },
      },
    };

    // 4. Enviar notificaciones (compatible con versiones más antiguas de Firebase Admin)
    console.log(`🚀 Iniciando envío de notificaciones a ${tokens.length} repartidores...`);

    let totalSuccess = 0;
    let totalFailure = 0;

    // Enviar a cada token individualmente usando el método más básico
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      try {
        console.log(`📤 Enviando notificación ${i + 1}/${tokens.length} a token: ${token.substring(0, 30)}...`);

        // Usar el método más básico: send() con estructura legacy
        const legacyMessage = {
          notification: {
            title: message.notification.title,
            body: message.notification.body,
          },
          data: message.data || {},
          token: token,
        };

        // Usar send() en lugar de sendMessage()
        const response = await admin.messaging().send(legacyMessage);

        console.log(`✅ Notificación ${i + 1} enviada exitosamente. ID: ${response}`);
        totalSuccess++;

      } catch (error) {
        console.error(`❌ Error enviando notificación ${i + 1}:`, error.code || error.message);
        totalFailure++;

        // Log más detallado del error
        if (error.code) {
          console.error(`   - Código de error: ${error.code}`);
        }
        if (error.message) {
          console.error(`   - Mensaje: ${error.message}`);
        }
      }
    }

    console.log(`📊 Resumen final:`);
    console.log(`   ✅ Exitosos: ${totalSuccess}`);
    console.log(`   ❌ Fallidos: ${totalFailure}`);
    console.log(`   📱 Total: ${tokens.length}`);

    // 5. Enviar respuesta con estadísticas
    console.log(`🎯 Resumen final: ${totalSuccess} exitosos, ${totalFailure} fallidos de ${tokens.length} total`);

    res.send({
      message: 'Notificaciones de nueva orden enviadas',
      stats: {
        total_repartidores: tokens.length,
        exitosos: totalSuccess,
        fallidos: totalFailure,
        orden: ordenData.numero_orden
      }
    });

  } catch (error) {
    console.error('❌ Error al notificar nueva orden:', error);
    res.status(500).send({
      error: 'Error al enviar notificaciones de nueva orden',
      details: error.toString()
    });
  }
});

// **Endpoint original para notificaciones genéricas**
app.post('/send-notification', async (req, res) => {
  const { registrationTokens, title, body, data } = req.body;

  if (!registrationTokens || registrationTokens.length === 0 || !title || !body) {
    return res.status(400).send({ error: 'Se requieren tokens de registro, título y cuerpo.' });
  }

  // Limpiar tokens
  const cleanedTokens = registrationTokens.map(token => token.replace(/['"]/g, ''));

  const message = {
    notification: {
      title: title,
      body: body,
    },
    data: data || {},
    tokens: cleanedTokens, // Usar todos los tokens
  };

  console.log('Mensaje a enviar:', JSON.stringify(message, null, 2));

  try {
    const response = await admin.messaging().sendMulticast(message);
    console.log('Respuesta de FCM:', response);
    res.send({
      message: `Notificaciones enviadas: ${response.successCount}/${cleanedTokens.length}`,
      response
    });
  } catch (error) {
    console.error('Error al enviar la notificación:', error);
    res.status(500).send({ error: 'Error al enviar la notificación', details: error.toString() });
  }
});

app.listen(port, () => {
  console.log(`Servidor escuchando en el puerto ${port}`);
});