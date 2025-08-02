const express = require('express');
const app     = express();
const bp      = require('body-parser');
const path    = require('path')

// Socket Requirements
const http    = require('http');
const socketio= require('socket.io');
const server  = http.createServer(app);
const io      = socketio(server); 
app.io = io;
// Controlers

const _p      = require('../src/utils/promise_error');
const  {Database}   = require('../src/utils/Database');
let    db = new Database();

const accounts   = require('./controlers/accounts');
const signup  = require('./controlers/signup');
const signin   = require('./controlers/signin');
const purchase   = require('./controlers/purchase');
const manufacturing   = require('./controlers/manufacturing');
const sales   = require('./controlers/sales');
const inventory   = require('./controlers/inventory');
const hrpayroll   = require('./controlers/hrpayroll');
const administration   = require('./controlers/administration');
const service   = require('./controlers/service');
 

// Middlewares
const auth    = require('./middlewares/auth');
const cros    = require('./middlewares/cros');
const errh    = require('./middlewares/error_handler');
const  {checkAuth}  = require('./checksuthforsoket')
app.use(cros);
app.use(bp.json());

// Health check endpoint - place before auth middleware
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'API is running' });
});

app.use('/api',auth);

// Serve static files
app.use('', express.static('uploads'));

// Mount all route modules
app.use(accounts);
app.use(signin);
app.use(signup);
app.use(purchase);
app.use(sales);
app.use(manufacturing);
app.use(hrpayroll);
app.use(administration); 
app.use(inventory);
app.use(service);

// Enhanced route listing
app.get('/routes', (req, res) => {
  const routes = [];
  
  // Function to process router stack
  const processMiddleware = (middleware, basePath = '') => {
    if (middleware.route) {
      // Routes registered directly on the app
      const path = basePath + (middleware.route.path === '/' ? '' : middleware.route.path);
      routes.push({
        path: path || '/',
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router' && middleware.handle.stack) {
      // Router middleware
      middleware.handle.stack.forEach(handler => {
        if (handler.route) {
          const path = basePath + (handler.route.path === '/' ? '' : handler.route.path);
          routes.push({
            path: path || '/',
            methods: Object.keys(handler.route.methods)
          });
        }
      });
    }
  };

  // Process all middleware in the app
  app._router.stack.forEach(middleware => {
    processMiddleware(middleware);
    // Handle mounted routers
    if (middleware.name === 'router') {
      middleware.handle.stack.forEach(handler => {
        processMiddleware(handler, middleware.regexp ? middleware.regexp.source.replace(/^\^|\$\/(?![a-z]*i)/g, '') : '');
      });
    }
  });

  res.json(routes);
});

app.use(errh);

const _PORT = process.env.PORT || 5000;  
server.listen(_PORT,()=>{
    console.log(`Api is Running on port... ${_PORT}`)
});