const admin = require('firebase-admin');
const express = require('express');
const bodyParser = require('body-parser');

// 🔥 NUEVO: Configuración de Firebase usando variables de entorno
let serviceAccount;

if (process.env.NODE_ENV === 'production') {
  // En producción (Render), usar variables de entorno
  serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'), // Convertir \\n a saltos de línea reales
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
  };
} else {
  // En desarrollo local, usar archivo JSON
  try {
    serviceAccount = require('./gipigo-41931-firebase-adminsdk-fbsvc-837615255f.json');
  } catch (error) {
    console.error('❌ Archivo de credenciales de Firebase no encontrado en desarrollo');
    console.error('💡 Asegúrate de tener el archivo JSON en la raíz del proyecto para desarrollo local');
    process.exit(1);
  }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// Endpoint GET para verificar el estado del servidor
app.get('/status', (req, res) => {
  const environment = process.env.NODE_ENV || 'development';
  res.status(200).send({ 
    message: `Servidor Gípigo en línea y funcionando correctamente desde ${environment}!`,
    environment: environment,
    timestamp: new Date().toISOString()
  });
});

// ENDPOINT: Notificar nueva orden a repartidores Y administradores
app.post('/notify-new-order', async (req, res) => {
  console.log('🔔 === NUEVA PETICIÓN DE NOTIFICACIÓN ===');
  console.log('🔔 Timestamp:', new Date().toISOString());
  
  const { ordenData } = req.body;

  if (!ordenData) {
    return res.status(400).send({ error: 'Se requieren los datos de la orden.' });
  }

  try {
    console.log('🔔 Orden recibida:', ordenData.numero_orden);
    console.log('🔔 Cliente:', ordenData.cliente_nombre);
    console.log('🔔 Precio:', ordenData.precio);

    const db = admin.firestore();

    // 1. Obtener repartidores activos
    console.log('🔍 Buscando repartidores activos...');
    const repartidoresSnapshot = await db.collection('Users')
      .where('rol', '==', 'REPARTIDOR')
      .where('estado', '==', 'Activo')
      .get();

    // 2. Obtener administradores (todos, sin importar estado)
    console.log('🔍 Buscando administradores...');
    const administradoresSnapshot = await db.collection('Users')
      .where('rol', '==', 'ADMINISTRADOR')
      .get();

    console.log(`📊 Repartidores activos encontrados: ${repartidoresSnapshot.size}`);
    console.log(`📊 Administradores encontrados: ${administradoresSnapshot.size}`);

    // 3. Recopilar tokens de repartidores
    const repartidorTokens = [];
    repartidoresSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`👤 Repartidor: ${data.nombre || 'Sin nombre'}`);
      console.log(`   - UID: ${doc.id}`);
      console.log(`   - Estado: ${data.estado}`);
      console.log(`   - Tiene FCM Token: ${data.fcmToken ? 'SÍ' : 'NO'}`);
      
      if (data.fcmToken && data.fcmToken.trim() !== '') {
        const cleanToken = data.fcmToken.replace(/['"]/g, '');
        repartidorTokens.push({
          token: cleanToken,
          nombre: data.nombre || 'Sin nombre',
          uid: doc.id,
          tipo: 'REPARTIDOR'
        });
        console.log(`   ✅ Token agregado`);
      } else {
        console.log(`   ❌ Token FCM inválido`);
      }
    });

    // 4. Recopilar tokens de administradores
    const adminTokens = [];
    administradoresSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`👑 Administrador: ${data.nombre || 'Sin nombre'}`);
      console.log(`   - UID: ${doc.id}`);
      console.log(`   - Estado: ${data.estado || 'Sin estado'}`);
      console.log(`   - Tiene FCM Token: ${data.fcmToken ? 'SÍ' : 'NO'}`);
      
      if (data.fcmToken && data.fcmToken.trim() !== '') {
        const cleanToken = data.fcmToken.replace(/['"]/g, '');
        adminTokens.push({
          token: cleanToken,
          nombre: data.nombre || 'Sin nombre',
          uid: doc.id,
          tipo: 'ADMINISTRADOR'
        });
        console.log(`   ✅ Token agregado`);
      } else {
        console.log(`   ❌ Token FCM inválido`);
      }
    });

    const todosLosTokens = [...repartidorTokens, ...adminTokens];
    console.log(`📊 Total tokens a enviar: ${todosLosTokens.length}`);

    if (todosLosTokens.length === 0) {
      console.log('⚠️ No hay tokens válidos para enviar');
      return res.json({
        message: 'No hay usuarios con tokens FCM válidos',
        stats: {
          total_repartidores: repartidorTokens.length,
          total_administradores: adminTokens.length,
          repartidores_exitosos: 0,
          repartidores_fallidos: 0,
          admin_exitosos: 0,
          admin_fallidos: 0,
          total: 0
        }
      });
    }

    // 5. Preparar el precio
    const precioMostrar = ordenData.precio || ordenData.precioCalculado || '0.00';
    console.log(`💰 Precio a mostrar en notificación: ${precioMostrar}`);

    // 6. Preparar mensajes diferentes para repartidores y administradores
    const mensajeRepartidores = {
      notification: {
        title: '🚚 Nueva Orden Disponible',
        body: `Orden ${ordenData.numero_orden} - ${ordenData.cliente_nombre} - €${precioMostrar}`,
      },
      data: {
        type: 'nueva_orden',
        orden_id: ordenData.numero_orden || '',
        cliente_nombre: ordenData.cliente_nombre || '',
        precio: precioMostrar.toString(),
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      },
      android: {
        notification: {
          channelId: 'orders_channel',
          priority: 'high',
          sound: 'notification',
          icon: '@drawable/ic_notification',
          color: '#2196F3',
        },
      }
    };

    const mensajeAdministradores = {
      notification: {
        title: '👑 Admin: Nueva Orden',
        body: `${ordenData.numero_orden} - €${precioMostrar} - ${ordenData.cliente_nombre} - ${repartidorTokens.length} repartidores activos`,
      },
      data: {
        type: 'nueva_orden_admin',
        orden_id: ordenData.numero_orden || '',
        cliente_nombre: ordenData.cliente_nombre || '',
        precio: precioMostrar.toString(),
        repartidores_activos: repartidorTokens.length.toString(),
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      },
      android: {
        notification: {
          channelId: 'orders_channel',
          priority: 'high',
          sound: 'notification',
          icon: '@drawable/ic_notification',
          color: '#FF9800', // Color diferente para admin
        },
      }
    };

    // 7. Enviar notificaciones
    let repartidoresExitosos = 0;
    let repartidoresFallidos = 0;
    let adminExitosos = 0;
    let adminFallidos = 0;

    console.log(`🚀 Enviando a ${repartidorTokens.length} repartidores...`);
    for (const tokenInfo of repartidorTokens) {
      try {
        const response = await admin.messaging().send({
          token: tokenInfo.token,
          ...mensajeRepartidores
        });
        console.log(`✅ Repartidor ${tokenInfo.nombre}: Enviado (${response})`);
        repartidoresExitosos++;
      } catch (error) {
        console.log(`❌ Repartidor ${tokenInfo.nombre}: Error - ${error.message}`);
        repartidoresFallidos++;
      }
    }

    console.log(`👑 Enviando a ${adminTokens.length} administradores...`);
    for (const tokenInfo of adminTokens) {
      try {
        const response = await admin.messaging().send({
          token: tokenInfo.token,
          ...mensajeAdministradores
        });
        console.log(`✅ Admin ${tokenInfo.nombre}: Enviado (${response})`);
        adminExitosos++;
      } catch (error) {
        console.log(`❌ Admin ${tokenInfo.nombre}: Error - ${error.message}`);
        adminFallidos++;
      }
    }

    // 8. Estadísticas finales
    const estadisticas = {
      total_repartidores: repartidorTokens.length,
      total_administradores: adminTokens.length,
      repartidores_exitosos: repartidoresExitosos,
      repartidores_fallidos: repartidoresFallidos,
      admin_exitosos: adminExitosos,
      admin_fallidos: adminFallidos,
      total: repartidoresExitosos + adminExitosos,
      orden: ordenData.numero_orden,
      precio_enviado: precioMostrar
    };

    console.log('📊 Estadísticas finales:', estadisticas);

    res.json({
      message: 'Notificaciones de nueva orden enviadas',
      stats: estadisticas
    });

  } catch (error) {
    console.error('❌ Error enviando notificaciones:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }

  console.log('🔔 === FIN PETICIÓN ===');
});

// Endpoint original para notificaciones genéricas
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
    tokens: cleanedTokens,
    android: {
      notification: {
        icon: '@drawable/ic_notification',
        color: '#2196F3',
      },
    },
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
  console.log(`Servidor Gípigo escuchando en el puerto ${port}`);
  console.log(`Estado del servidor: http://localhost:${port}/status`);
  console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
});
