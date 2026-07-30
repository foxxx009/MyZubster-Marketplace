const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');

const PORT = process.env.PORT || 4000;
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database setup con Sequelize
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: process.env.DB_PATH || path.join(__dirname, 'data', 'marketplace.db'),
  logging: false,
});

// Definisci i modelli
const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, defaultValue: 'user' },
});

const Skill = sequelize.define('Skill', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  seller_id: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  price: { type: DataTypes.FLOAT, allowNull: false },
  category: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING, defaultValue: 'active' },
});

const Order = sequelize.define('Order', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  buyer_id: { type: DataTypes.INTEGER, allowNull: false },
  seller_id: { type: DataTypes.INTEGER, allowNull: false },
  skill_id: { type: DataTypes.INTEGER, allowNull: false },
  amount: { type: DataTypes.FLOAT, allowNull: false },
  status: { type: DataTypes.STRING, defaultValue: 'pending' },
  payment_id: { type: DataTypes.STRING },
  paymentMethod: {
    type: DataTypes.ENUM('standard', 'escrow'),
    defaultValue: 'standard'
  },
  escrowId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  escrowStatus: {
    type: DataTypes.ENUM('pending', 'funded', 'completed', 'disputed', 'refunded'),
    allowNull: true
  },
});

const WebhookLog = sequelize.define('WebhookLog', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  order_id: { type: DataTypes.INTEGER },
  event: { type: DataTypes.STRING },
  payload: { type: DataTypes.TEXT },
  status: { type: DataTypes.STRING },
});

// Relazioni
Skill.belongsTo(User, { foreignKey: 'seller_id', as: 'seller' });
Order.belongsTo(User, { foreignKey: 'buyer_id', as: 'buyer' });
Order.belongsTo(User, { foreignKey: 'seller_id', as: 'seller' });
Order.belongsTo(Skill, { foreignKey: 'skill_id', as: 'skill' });

// Middleware per iniettare i modelli nelle route
app.use((req, res, next) => {
  req.models = { User, Skill, Order, WebhookLog };
  next();
});

// Import routes
const authRoutes = require('./routes/auth');
const skillRoutes = require('./routes/skills');
const orderRoutes = require('./routes/orders');
const webhookRoutes = require('./routes/webhook');
const userRoutes = require('./routes/users');

app.use('/api/auth', authRoutes);
app.use('/api/skills', skillRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/users', userRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'MyZubster-Marketplace',
    version: '1.0.0',
    database: 'sqlite'
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Esporta app e sequelize
module.exports = app;
module.exports.sequelize = sequelize;
module.exports.models = { User, Skill, Order, WebhookLog };

// Avvia il server SOLO se eseguito direttamente
if (require.main === module) {
  sequelize.sync({ alter: true }).then(() => {
    console.log('✅ Database sincronizzato (Sequelize)');
    app.listen(PORT, () => {
      console.log(`🚀 Server avviato sulla porta ${PORT}`);
      console.log(`🌐 URL: http://localhost:${PORT}`);
      console.log(`🔍 Health check: http://localhost:${PORT}/api/health`);
    });
  }).catch(err => {
    console.error('❌ Errore database:', err);
    process.exit(1);
  });
}
