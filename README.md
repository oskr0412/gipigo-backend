# 🚀 GipiGo Backend - Servidor de Notificaciones

Este es el backend de GipiGo, un servidor Node.js que maneja las notificaciones push para repartidores usando Firebase Cloud Messaging (FCM).

## 📋 Requisitos del Sistema

- **Node.js** versión 18.0.0 o superior
- **npm** (viene incluido con Node.js)
- **Puerto 3000** disponible (configurable)

## 🔧 Instalación y Configuración

### 1. Instalar Node.js
Descarga e instala Node.js desde [nodejs.org](https://nodejs.org/)

Para verificar la instalación:
```bash
node --version
npm --version
```

### 2. Instalar Dependencias
```bash
cd gipigo-backend
npm install
```

### 3. ⚠️ **CONFIGURACIÓN CRÍTICA: Configurar IP del Servidor**

**IMPORTANTE**: Debes modificar el archivo `server.js` para que el servidor escuche en todas las interfaces de red, no solo en localhost.

#### Cambio requerido en `server.js`:

**BUSCA esta línea al final del archivo:**
```javascript
app.listen(port, () => {
  console.log(`Servidor Gípigo escuchando en el puerto ${port}`);
  console.log(`Estado del servidor: http://localhost:${port}/status`);
});
```

**CÁMBIALA por:**
```javascript
app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor Gípigo escuchando en el puerto ${port}`);
  console.log(`Estado del servidor: http://localhost:${port}/status`);
  console.log(`Acceso desde red local: http://TU_IP_LOCAL:${port}/status`);
});
```

#### ¿Por qué este cambio?
- **Sin '0.0.0.0'**: El servidor solo acepta conexiones desde localhost (127.0.0.1)
- **Con '0.0.0.0'**: El servidor acepta conexiones desde cualquier IP de la red local
- **Esto permite** que la app Flutter se conecte desde dispositivos físicos o emuladores

### 4. **Opcional: Agregar CORS para mejor compatibilidad**

Si tienes problemas de CORS, agrega esto al inicio de `server.js` (después de las dependencias):

```javascript
const admin = require('firebase-admin');
const express = require('express');
const bodyParser = require('body-parser');

// Agregar estas líneas para CORS
const cors = require('cors');
const app = express();

// Configurar CORS para permitir conexiones desde la app
app.use(cors({
  origin: '*', // En producción, especifica las IPs permitidas
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

**Si agregas CORS, también instala la dependencia:**
```bash
npm install cors
```

### 5. ⚠️ **CONFIGURACIÓN CRÍTICA: Firebase Admin SDK**

El backend requiere el archivo de credenciales de Firebase. **DEBES tener el archivo:**
```
gipigo-41931-firebase-adminsdk-fbsvc-837615255f.json
```

**Ubicación del archivo:**
- Coloca este archivo en la **raíz del proyecto** (mismo nivel que `server.js`)
- El servidor lo busca automáticamente con esta ruta:
  ```javascript
  require('./gipigo-41931-firebase-adminsdk-fbsvc-837615255f.json')
  ```

**Si no tienes este archivo:**
1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona el proyecto `gipigo-41931`
3. Ve a **Configuración del proyecto** → **Cuentas de servicio**
4. Haz clic en **"Generar nueva clave privada"**
5. Descarga el archivo JSON y renómbralo exactamente como se especifica arriba

## 🚀 Ejecutar el Servidor

### Modo Desarrollo:
```bash
npm run dev
```

### Modo Producción:
```bash
npm start
```

El servidor iniciará en: `http://localhost:3000`

## ✅ Verificar Funcionamiento

### 1. Comprobar Estado del Servidor
Abre en tu navegador o usa curl:
```bash
curl http://localhost:3000/status
```

**Respuesta esperada:**
```json
{
  "message": "Servidor Gípigo en línea y funcionando correctamente desde servidor local!"
}
```

### 2. Verificar Logs del Servidor
En la consola deberías ver:
```
Servidor Gípigo escuchando en el puerto 3000
Estado del servidor: http://localhost:3000/status
```

## 📡 Endpoints Disponibles

### 1. **GET /status**
- **Descripción**: Verifica el estado del servidor
- **Respuesta**: Mensaje de confirmación

### 2. **POST /notify-new-order**
- **Descripción**: Envía notificaciones de nueva orden a repartidores activos
- **Body requerido**:
  ```json
  {
    "ordenData": {
      "numero_orden": "ORD001",
      "cliente_nombre": "Juan Pérez",
      "precio": "25.50",
      "distanciaPedido": "2.5",
      "duracionEstimadaMinutos": "15",
      "direccion": {
        "calle": "Calle Principal",
        "numero": "123",
        "ciudad": "Madrid"
      }
    }
  }
  ```

### 3. **POST /send-notification**
- **Descripción**: Envía notificaciones genéricas
- **Body requerido**:
  ```json
  {
    "registrationTokens": ["token1", "token2"],
    "title": "Título de la notificación",
    "body": "Mensaje de la notificación",
    "data": {}
  }
  ```

## 🔥 Configuración de Firestore

El servidor busca repartidores en Firestore con esta estructura:

### Colección: `Users`
```javascript
{
  "rol": "REPARTIDOR",           // Exactamente así, en mayúsculas
  "estado": "Activo",            // Exactamente así, con A mayúscula
  "fcmToken": "token_del_dispositivo",
  "nombre": "Nombre del repartidor"
}
```

**⚠️ Importante:**
- El campo `rol` debe ser exactamente `"REPARTIDOR"` (todo en mayúsculas)
- El campo `estado` debe ser exactamente `"Activo"` (con A mayúscula)
- El `fcmToken` debe estar presente y válido

## 🐛 Solución de Problemas

### Error: "No se encontraron repartidores"
**Causa**: No hay usuarios con rol "REPARTIDOR" en Firestore
**Solución**: 
1. Verifica que existan usuarios en la colección `Users`
2. Asegúrate de que el campo `rol` sea exactamente `"REPARTIDOR"`

### Error: "No hay repartidores activos disponibles"
**Causa**: Los repartidores no tienen estado "Activo"
**Solución**:
1. Verifica que los repartidores hayan hecho login en la app
2. Asegúrate de que el campo `estado` sea exactamente `"Activo"`

### Error: "No hay repartidores con tokens FCM válidos"
**Causa**: Los tokens FCM están vacíos o son inválidos
**Solución**:
1. Los repartidores deben abrir la app para generar tokens FCM
2. Verifica que el campo `fcmToken` no esté vacío

### Error: "EADDRINUSE: address already in use :::3000"
**Causa**: El puerto 3000 ya está en uso
**Solución**:
```bash
# Ver qué proceso usa el puerto 3000
netstat -tulpn | grep 3000    # Linux/Mac
netstat -ano | findstr :3000  # Windows

# Cambiar puerto (modificar server.js)
const port = process.env.PORT || 3001;
```

### Error de Firebase: "Failed to determine project ID"
**Causa**: Archivo de credenciales incorrecto o ausente
**Solución**:
1. Verifica que el archivo JSON esté en la ubicación correcta
2. Comprueba que el nombre del archivo sea exacto
3. Asegúrate de que el archivo no esté corrupto

## 📊 Logs y Debugging

El servidor incluye logs detallados para debugging:

```bash
# Al enviar notificaciones verás:
🟢 Iniciando notificación de nueva orden: ORD001
🔍 Total de usuarios con rol "REPARTIDOR": 5
🔍 Repartidores con estado "Activo": 3
📱 Total de tokens FCM válidos recolectados: 3
📤 Enviando notificación 1/3 a token: abcd1234...
✅ Notificación 1 enviada exitosamente
📊 Resumen final:
   ✅ Exitosos: 3
   ❌ Fallidos: 0
   📱 Total: 3
```

## 🔐 Consideraciones de Seguridad

1. **Nunca subas el archivo de credenciales Firebase a Git**
2. **Usa variables de entorno en producción**
3. **Configura CORS apropiadamente para producción**

## 🌐 Configuración de Red y Acceso

### Obtener tu IP Local

**Windows:**
```cmd
ipconfig
```
Busca "Dirección IPv4" en tu adaptador de red principal.

**macOS/Linux:**
```bash
ifconfig | grep "inet "
# o
ip addr show
```

**Ejemplo de IP:** `192.168.1.100`

### URLs de Acceso

Una vez que el servidor esté ejecutándose:

- **Acceso local:** `http://localhost:3000`
- **Acceso desde la red:** `http://192.168.1.100:3000` (usar tu IP real)
- **Para la app Flutter:** Usar `http://TU_IP_LOCAL:3000`

### Configurar Firewall (Si es necesario)

**Windows:**
1. Panel de Control → Sistema y seguridad → Firewall de Windows
2. Reglas de entrada → Nueva regla → Puerto → TCP → 3000

**Linux (Ubuntu):**
```bash
sudo ufw allow 3000
```

**macOS:**
```bash
# Generalmente no es necesario, pero si hay problemas:
sudo pfctl -f /etc/pf.conf
```

## 📝 Estructura del Proyecto

```
gipigo-backend/
├── server.js                                    # Servidor principal
├── package.json                                 # Dependencias y scripts
├── package-lock.json                           # Lock de dependencias
├── gipigo-41931-firebase-adminsdk-fbsvc-*.json # Credenciales Firebase
└── README.md                                   # Esta documentación
```

## 🆘 Soporte y Contacto

Si encuentras problemas:

1. **Verifica los logs del servidor** en la consola
2. **Comprueba el estado** con `GET /status`
3. **Revisa la configuración de Firebase** en Firestore
4. **Asegúrate de que los puertos** estén disponibles

---

**✅ Una vez configurado correctamente, el servidor estará listo para enviar notificaciones push a los repartidores de GipiGo.**